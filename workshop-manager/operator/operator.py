#!/usr/bin/env python3

import asyncio
import json
import kopf
import kubernetes
import logging
import os
import random
import re

from copy import deepcopy
from datetime import datetime, timedelta, timezone
from infinite_relative_backoff import InfiniteRelativeBackoff
from pydantic.utils import deep_update

babylon_domain = os.environ.get('BABYLON_DOMAIN', 'babylon.gpte.redhat.com')
babylon_api_version = os.environ.get('BABYLON_API_VERSION', 'v1')
poolboy_domain = os.environ.get('POOLBOY_DOMAIN', 'poolboy.gpte.redhat.com')
poolboy_api_version = os.environ.get('POOLBOY_API_VERSION', 'v1')
poolboy_namespace = os.environ.get('POOLBOY_NAMESPACE', 'poolboy')

catalog_display_name_annotation = f"{babylon_domain}/catalogDisplayName"
catalog_item_display_name_annotation = f"{babylon_domain}/catalogItemDisplayName"
catalog_item_name_label = f"{babylon_domain}/catalogItemName"
catalog_item_namespace_label = f"{babylon_domain}/catalogItemNamespace"
display_name_annotation = f"{babylon_domain}/displayName"
finalizer_value = f"{babylon_domain}/workshop-manager"
lab_ui_label = f"{babylon_domain}/labUserInterface"
lab_ui_url_annotation = f"{babylon_domain}/labUserInterfaceUrl"
lab_ui_urls_annotation = f"{babylon_domain}/labUserInterfaceUrls"
notifier_annotation = f"{babylon_domain}/notifier"
requester_annotation = f"{babylon_domain}/requester"
url_annotation = f"{babylon_domain}/url"
workshop_label = f"{babylon_domain}/workshop"
workshop_id_label = f"{babylon_domain}/workshop-id"
workshop_provision_label = f"{babylon_domain}/workshop-provision"

if os.path.exists('/run/secrets/kubernetes.io/serviceaccount'):
    kubernetes.config.load_incluster_config()
else:
    kubernetes.config.load_kube_config()

core_v1_api = kubernetes.client.CoreV1Api()
custom_objects_api = kubernetes.client.CustomObjectsApi()

lab_ui_url_keys = ('bookbag_url', 'lab_ui_url', 'labUserInterfaceUrl')

class CatalogItem:
    @staticmethod
    def get(name, namespace):
        catalog_namespace = core_v1_api.read_namespace(namespace)
        definition = custom_objects_api.get_namespaced_custom_object(
            babylon_domain, babylon_api_version, namespace, 'catalogitems', name
        )
        return CatalogItem(
            definition = definition,
            catalog_namespace = catalog_namespace,
        )

    def __init__(self, definition, catalog_namespace):
        self.definition = definition
        self.catalog_namespace = catalog_namespace
        self.parameters = [
            CatalogItemParameter(
                item, resource_count=len(self.resources)
            ) for item in definition['spec'].get('parameters', [])
        ]

    @property
    def catalog_display_name(self):
        if self.catalog_namespace.metadata.annotations \
        and 'openshift.io/display-name' in self.catalog_namespace.metadata.annotations:
            return self.catalog_namespace.metadata.annotations['openshift.io/display-name']
        else:
            return self.catalog_namespace.metadata.name

    @property
    def display_name(self):
        return self.definition['metadata'].get('annotations', {}).get(display_name_annotation, self.name)

    @property
    def lab_ui_type(self):
        if 'bookbag' in self.definition['spec']:
            return 'bookbag'
        else:
            return None

    @property
    def name(self):
        return self.definition['metadata']['name']

    @property
    def namespace(self):
        return self.definition['metadata']['namespace']

    @property
    def resources(self):
        return self.definition['spec']['resources']


class CatalogItemParameter:
    def __init__(self, definition, resource_count):
        self.definition = definition
        self.resource_count = resource_count

    @property
    def annotation(self):
        return self.definition.get('annotation')

    @property
    def default(self):
        open_api_v3_schema = self.open_api_v3_schema
        if open_api_v3_schema:
            if 'default' in open_api_v3_schema:
                return open_api_v3_schema['default']
            if 'value' in self.definition:
                data_type = open_api_v3_schema.get('type')
                value = self.definition['value']
                if data_type == 'boolean':
                    value_lower = value.lower()
                    return value_lower in ('1', 'on', 't', 'true', 'y', 'yes')
                elif data_type == 'integer':
                    return int(value)
                elif data_type == 'number':
                    return float(value)
                else:
                    return value
        elif 'value' in self.definition:
            return self.definition['value']

    @property
    def name(self):
        return self.definition.get('name')

    @property
    def open_api_v3_schema(self):
        return self.definition.get('openAPIV3Schema')

    @property
    def required(self):
        return self.definition.get('required', False)

    @property
    def resource_indexes(self):
        if 'resourceIndexes' in self.definition:
            return [
                self.resource_count - 1 if idx == '@' else idx
                for idx in self.definition['resourceIndexes']
            ]
        else:
            return [ self.resource_count - 1 ]

    @property
    def variable(self):
        return self.definition.get('variable', None if self.annotation else self.name)


class LabUserInterface:
    def __init__(self, definition=None, url=None):
        if definition:
            self.url = definition.get('url')
        else:
            self.url = url

    def serialize(self):
        ret = dict(url=self.url)
        return ret


class ResourceClaim:
    def __init__(self, definition):
        self.definition = definition

    @property
    def creation_datetime(self):
        return datetime.strptime(
            self.definition['metadata']['creationTimestamp'], '%Y-%m-%dT%H:%M:%SZ'
        ).replace(tzinfo=timezone.utc)

    @property
    def effective_lifespan_end(self):
        lifespan_end_timestamp = self.definition.get('status', {}).get('lifespan', {}).get('end')
        if not lifespan_end_timestamp:
            return None
        return datetime.strptime(
            lifespan_end_timestamp, '%Y-%m-%dT%H:%M:%SZ'
        ).replace(tzinfo=timezone.utc)

    @property
    def name(self):
        return self.definition['metadata']['name']

    @property
    def namespace(self):
        return self.definition['metadata']['namespace']

    @property
    def provision_complete(self):
        if not 'status' in self.definition \
        or not 'resources' in self.definition['status']:
            return False
        for resource in self.definition['status']['resources']:
            state = resource.get('state')
            if not state:
                return False
            if state['kind'] == 'AnarchySubject':
                if not state.get('status', {}).get('towerJobs', {}).get('provision', {}).get('completeTimestamp'):
                    return False
        return True

    @property
    def resource_handle_name(self):
        return self.definition['status'].get('resourceHandle', {}).get('name')

    @property
    def resource_handle_namespace(self):
        return self.definition['status'].get('resourceHandle', {}).get('namespace')

    @property
    def start_datetime(self):
        for resource in self.definition['spec']['resources']:
            try:
                return datetime.strptime(
                    resource['template']['spec']['vars']['action_schedule']['start'], '%Y-%m-%dT%H:%M:%SZ'
                ).replace(tzinfo=timezone.utc)
            except KeyError:
                pass

    @property
    def stop_datetime(self):
        for resource in self.definition['spec']['resources']:
            try:
                return datetime.strptime(
                    resource['template']['spec']['vars']['action_schedule']['stop'], '%Y-%m-%dT%H:%M:%SZ'
                ).replace(tzinfo=timezone.utc)
            except KeyError:
                pass

    @property
    def workshop_name(self):
        return self.definition['metadata']['labels'][workshop_label]

    def adjust_action_schedule_and_lifetime(self, lifespan_end=None, logger=None, start_datetime=None, stop_datetime=None):
        resource_claim_patch = None
        if lifespan_end and lifespan_end != self.effective_lifespan_end:
            lifespan_end_ts = lifespan_end.strftime('%FT%TZ')
            lifespan_maximum_days = 1 + int((lifespan_end - self.creation_datetime).total_seconds() / 60 / 60 / 24)
            lifespan_relative_maximum_days = 1 + int((lifespan_end - datetime.now(timezone.utc)).total_seconds() / 60 / 60 / 24)
            logger.info(f"Extending lifetime of {self.name} to {lifespan_end_ts}")
            custom_objects_api.patch_namespaced_custom_object(
                poolboy_domain, poolboy_api_version,
                self.resource_handle_namespace, 'resourcehandles', self.resource_handle_name,
                {
                    "spec": {
                        "lifespan": {
                            "end": lifespan_end_ts,
                            "maximum": f"{lifespan_maximum_days}d",
                            "relativeMaximum": f"{lifespan_relative_maximum_days}d"
                        }
                    }
                }
            )
            resource_claim_patch = {
                "spec": {
                    "lifespan": {
                        "end": lifespan_end_ts,
                    }
                }
            }

        if (start_datetime and self.start_datetime and start_datetime != self.start_datetime) \
        or (stop_datetime and self.stop_datetime and stop_datetime != self.stop_datetime):
            logger.info(f"Adjusting action schedule of {self.name}")
            if resource_claim_patch:
                resource_claim_patch['spec']['resources'] = []
            else:
                resource_claim_patch = {
                    "spec": {
                        "resources": []
                    }
                }
            for resource in self.definition.get('spec', {}).get('resources', []):
                resource_copy = deepcopy(resource)
                action_schedule = resource_copy.get('template', {}).get('spec', {}).get('vars', {}).get('action_schedule', {})
                if 'start' in action_schedule:
                    action_schedule['start'] = start_datetime.strftime('%FT%TZ')
                if 'stop' in action_schedule:
                    action_schedule['stop'] = stop_datetime.strftime('%FT%TZ')
                resource_claim_patch['spec']['resources'].append(resource_copy)

        if resource_claim_patch:
            custom_objects_api.patch_namespaced_custom_object(
                poolboy_domain, poolboy_api_version,
                self.namespace, 'resourceclaims', self.name, resource_claim_patch
            )

    def as_user_assignment(self, logger):
        annotations = self.definition['metadata'].get('annotations', {})
        lab_user_interface = None
        provision_data = {}
        provision_messages = []

        for resource in self.definition.get('status', {}).get('resources', []):
            state = resource.get('state')
            if not state or not state['kind'] == 'AnarchySubject':
                continue
            state_vars = state['spec']['vars']
            if 'provision_data' in state_vars:
                provision_data.update({
                    k: v for k, v in state_vars['provision_data'].items() if k not in lab_ui_url_keys
                })
                for lab_ui_url_key in lab_ui_url_keys:
                    if lab_ui_url_key in provision_data:
                        lab_user_interface = LabUserInterface(
                            url = provision_data[lab_ui_url_key]
                        )
                    break
            if 'provision_messages' in state_vars:
                provision_messages.extend(state_vars['provision_messages'])

        if lab_ui_url_annotation in annotations:
            lab_user_interface = LabUserInterface(
                url = annotations[lab_ui_url_annotation]
            )

        return UserAssignment(
             data = provision_data,
             lab_user_interface = lab_user_interface,
             messages = "\n".join(provision_messages) if provision_messages else None,
             resource_claim_name = self.name,
        )

    def get_user_assignments(self, logger):
        annotations = self.definition['metadata'].get('annotations', {})

        user_assignments = []

        for resource in self.definition.get('status', {}).get('resources', []):
            state = resource.get('state')
            if not state or not state['kind'] == 'AnarchySubject':
                continue
            for user_name, user_data in state['spec']['vars'].get('provision_data', {}).get('users', {}).items():
                user_assignment = None
                pruned_user_data = {
                    k: v for k, v in user_data.items() if k != 'msg' and k not in lab_ui_url_keys
                }
                user_messages = user_data.get('msg')
                for iter_user in user_assignments:
                    if iter_user.user_name == user_name:
                        user_assignment = iter_user
                        user_assignment.data.update(pruned_user_data)
                        if user_messages:
                            if user_assignment.messages:
                                user_assignment.messages = f"{user.messages}\n{user_messages}"
                            else:
                                user_assignment.messages = user_messages
                        break
                else:
                    user_assignment = UserAssignment(
                        data = pruned_user_data,
                        messages = user_messages,
                        resource_claim_name = self.name,
                        user_name = user_name,
                    )
                    user_assignments.append(user_assignment)
                for lab_ui_url_key in lab_ui_url_keys:
                    if lab_ui_url_key in user_data:
                        user_assignment.lab_user_interface = LabUserInterface(
                            url = user_data[lab_ui_url_key]
                        )
                    break

        if lab_ui_urls_annotation in annotations:
            try:
                lab_ui_urls = json.loads(annotations[lab_ui_urls_annotation])
            except json.decoder.JSONDecodeError as e:
                logger.warning(
                    f"Failed to parse {lab_ui_urls_annotation} annotation "
                    f"for ResourceClaim {self.name} in {self.namespace}: {e.msg}"
                )
            if isinstance(lab_ui_urls, dict):
                for user_name, url in lab_ui_urls.items():
                    for user_assignment in user_assignments:
                        if user_assignment.resource_claim_name == self.name \
                        and user_assignment.user_name == user_name:
                            if user_assignment.lab_user_interface:
                                user_assignment.lab_user_interface.url = url
                            else:
                                user_assignment.lab_user_interface = LabUserInterface(url=url)
                            break
                    else:
                        user_assignments.append(
                            UserAssignment(
                                lab_user_interface = LabUserInterface(url=url),
                                user_name = user_name,
                                resource_claim_name = self.name,
                            )
                        )
            else:
                logger.warning(
                    f"{lab_ui_urls_annotation} annotation for ResourceClaim "
                    f"{self.name} in {self.namespace} is not a dictionary!"
                )

        return user_assignments

    def get_workshop(self):
        return Workshop.get(name=self.workshop_name, namespace=self.namespace)


class UserAssignment:
    def __init__(self,
        data = None,
        definition = None,
        lab_user_interface = None,
        messages = None,
        resource_claim_name = None,
        user_name = None,
    ):
        if definition:
            self.data = definition.get('data')
            self.messages = definition.get('messages')
            self.resource_claim_name = definition.get('resourceClaimName')
            self.user_name = definition.get('userName')
            if 'labUserInterface' in definition:
                self.lab_user_interface = LabUserInterface(definition=definition['labUserInterface'])
        else:
            self.data = data
            self.lab_user_interface = lab_user_interface
            self.messages = messages
            self.resource_claim_name = resource_claim_name
            self.user_name = user_name

    def serialize(self):
        ret = {}
        if self.data:
            ret['data'] = self.data
        if self.lab_user_interface:
            ret['labUserInterface'] = self.lab_user_interface.serialize()
        if self.messages:
            ret['messages'] = self.messages
        if self.resource_claim_name:
            ret['resourceClaimName'] = self.resource_claim_name
        if self.user_name:
            ret['userName'] = self.user_name
        return ret


class Workshop:
    workshops = {}

    @staticmethod
    def get(name, namespace):
        workshop = Workshop.workshops.get((namespace, name))
        if not workshop:
            definition = custom_objects_api.get_namespaced_custom_object(
                babylon_domain, babylon_api_version, namespace, 'workshops', name
            )
            workshop = Workshop(definition=definition)
        return workshop

    @staticmethod
    def register(name, namespace, **kwargs):
        workshop = Workshop.workshops.get((namespace, name))
        if workshop:
            workshop.__init__(name=name, namespace=namespace, **kwargs)
        else:
            workshop = Workshop(name=name, namespace=namespace, **kwargs)
            Workshop.workshops[(namespace, name)] = workshop
        return workshop

    def __init__(
        self,
        annotations=None,
        definition=None,
        labels=None,
        meta=None,
        name=None,
        namespace=None,
        spec=None,
        uid=None,
        **_,
    ):
        if definition:
            self.meta = definition['metadata']
            self.spec = definition['spec']
            self.annotations = self.meta.get('annotations', {})
            self.labels = self.meta.get('labels', {})
            self.name = self.meta['name']
            self.namespace = self.meta['namespace']
            self.uid = self.meta['uid']
        else:
            self.annotations = annotations
            self.labels = labels
            self.meta = meta
            self.name = name
            self.namespace = namespace
            self.spec = spec
            self.uid = uid

    @property
    def multiuser_services(self):
        return self.spec.get('multiuserServices', False)

    @property
    def requester(self):
        return self.annotations.get(requester_annotation)

    @property
    def service_url(self):
        return self.annotations.get(url_annotation)

    @property
    def user_assignments(self):
        return [
            UserAssignment(definition=definition) for definition in self.spec.get('userAssignments', [])
        ]

    def check_resource_claims(self, logger):
        check_resource_claim_names = []
        for user_assignment in self.user_assignments:
            resource_claim_name = user_assignment.resource_claim_name
            if resource_claim_name and resource_claim_name not in check_resource_claim_names:
                check_resource_claim_names.append(resource_claim_name)

        missing_resource_claim_names = []
        for resource_claim_name in check_resource_claim_names:
            try:
                custom_objects_api.get_namespaced_custom_object(
                    poolboy_domain, poolboy_api_version, self.namespace, 
                    'resourceclaims', resource_claim_name
                )
            except kubernetes.client.rest.ApiException as e:
                if e.status == 404:
                    missing_resource_claim_names.append(resource_claim_name)
                else:
                    pass

        if missing_resource_claim_names:
            logger.info(f"Removing ResourceClaims ({', '.join(missing_resource_claim_names)}) from Workshop {self.name} in {self.namespace}")
            try:
                workshop_definition = custom_objects_api.get_namespaced_custom_object(
                    babylon_domain, babylon_api_version, self.namespace, 'workshops', self.name
                )
                workshop_user_assignments = workshop_definition['spec'].get('userAssignments', [])
                pruned_user_assignments = [
                    item for item in workshop_user_assignments if item.get('resourceClaimName') not in missing_resource_claim_names
                ]
                if pruned_user_assignments == workshop_user_assignments:
                    self.init__(definition=workshop_definition)
                else:
                    workshop_definition['spec']['userAssignments'] = pruned_user_assignments
                    updated_definition = custom_objects_api.replace_namespaced_custom_object(
                        babylon_domain, babylon_api_version, self.namespace,
                        'workshops', self.name, workshop_definition
                    )
                    self.__init__(definition=updated_definition)
            except kubernetes.client.rest.ApiException as e:
                if e.status != 409 and e.status != 404:
                    raise

    def delete_all_workshop_provisions(self, logger):
        logger.info(f"Deleting all WorkshopProvisions for Workshop {self.name} in {self.namespace}")
        for workshop_provision in self.list_workshop_provisions():
            logger.info(f"Deleting WorkshopProvision {workshop_provision.name} in {workshop_provision.namespace}")
            try:
                custom_objects_api.delete_namespaced_custom_object(
                    babylon_domain, babylon_api_version,
                    workshop_provision.namespace, 'workshopprovisions', workshop_provision.name
                )
            except kubernetes.client.rest.ApiException as e:
                if e.status != 404:
                    raise

    def delete_all_resource_claims(self, logger):
        logger.info(f"Deleting all ResourceClaims for Workshop {self.name} in {self.namespace}")
        for resource_claim in self.list_resource_claims():
            logger.info(f"Deleting ResourceClaim {resource_claim.name} in namespace {resource_claim.namespace}")
            try:
                custom_objects_api.delete_namespaced_custom_object(
                    poolboy_domain, poolboy_api_version, resource_claim.namespace, 
                    'resourceclaims', resource_claim.name
                )
            except kubernetes.client.rest.ApiException as e:
                if e.status != 404:
                    raise

    def list_resource_claims(self):
        _continue = None
        while True:
            resource_claim_list = custom_objects_api.list_namespaced_custom_object(
                poolboy_domain, poolboy_api_version, self.namespace, 'resourceclaims',
                label_selector = f"{workshop_label}={self.name}",
                limit = 20, _continue = _continue
            )
            for resource_claim_definition in resource_claim_list.get('items', []):
                yield ResourceClaim(definition=resource_claim_definition)
            _continue = resource_claim_list['metadata'].get('continue')
            if not _continue:
                return

    def list_workshop_provisions(self):
        _continue = None
        while True:
            workshop_provision_list = custom_objects_api.list_namespaced_custom_object(
                poolboy_domain, poolboy_api_version, self.namespace, 'resourceclaims',
                label_selector = f"{workshop_label}={self.name}",
                limit = 20, _continue = _continue
            )
            for workshop_provision_definition in workshop_provision_list.get('items', []):
                yield WorkshopProvision(definition=workshop_provision_definition)
            _continue = workshop_provision_list['metadata'].get('continue')
            if not _continue:
                return

    def manage(self, logger):
        self.check_resource_claims(logger=logger)

    def manage_workshop_id_label(self, logger):
        """
        Generate a unique workshop id label for workshop to provide a short URL for access.
        """
        if workshop_id_label in self.labels:
            return
        while True:
            workshop_id = ''.join(random.choice('23456789abcdefghjkmnpqrstuvwxyz') for i in range(6))
            # Check if id is in use
            workshop_list = custom_objects_api.list_cluster_custom_object(
                babylon_domain, babylon_api_version, 'workshops',
                label_selector = f"{workshop_id_label}={workshop_id}",
            )
            if workshop_list.get('items'):
                continue
            workshop_definition = custom_objects_api.patch_namespaced_custom_object(
                babylon_domain, babylon_api_version, self.namespace, 'workshops', self.name,
                {
                    "metadata": {
                        "labels": {
                            workshop_id_label: workshop_id,
                        }
                    }
                }
            )
            self.__init__(definition=workshop_definition)
            logger.info(f"Assigned workshop id {workshop_id}")
            return

    def on_create(self, logger):
        logger.debug(f"Handling Workshop create for {self.name} in {self.namespace}")
        self.manage_workshop_id_label(logger=logger)

    def on_delete(self, logger):
        logger.info(f"Handling Workshop delete for {self.name} in {self.namespace}")
        self.delete_all_workshop_provisions(logger=logger)
        self.delete_all_resource_claims(logger=logger)

    def on_resume(self, logger):
        logger.debug(f"Handling Workshop resume for {self.name} in {self.namespace}")
        self.manage_workshop_id_label(logger=logger)

    def on_update(self, logger):
        logger.debug(f"Handling Workshop update for {self.name} in {self.namespace}")
        self.manage_workshop_id_label(logger=logger)

    def remove_resource_claim(self, logger, resource_claim):
        while True:
            # First fetch latest version of Workshop from the API
            workshop_definition = custom_objects_api.get_namespaced_custom_object(
                babylon_domain, babylon_api_version, self.namespace, 'workshops', self.name
            )
            workshop_definition_updated = False
            workshop_user_assignments = workshop_definition['spec'].get('userAssignments', [])
            pruned_user_assignments = [
                item for item in workshop_user_assignments if item.get('resourceClaimName') != resource_claim.name
            ]
            if pruned_user_assignments == workshop_user_assignments:
                return
            try:
                workshop_definition['spec']['userAssignments'] = pruned_user_assignments
                updated_definition = custom_objects_api.replace_namespaced_custom_object(
                    babylon_domain, babylon_api_version, self.namespace,
                    'workshops', self.name, workshop_definition
                )
                self.__init__(definition=updated_definition)
            except kubernetes.client.rest.ApiException as e:
                if e.status != 409 and e.status != 404:
                    raise

    def unregister(self):
        Workshop.workshops.pop((self.namespace, self.name), None)

    def update_resource_claim(self, logger, resource_claim):
        while True:
            # First fetch latest version of Workshop from the API
            workshop_definition = custom_objects_api.get_namespaced_custom_object(
                babylon_domain, babylon_api_version, self.namespace, 'workshops', self.name
            )
            workshop_definition_updated = False
            user_assignments = resource_claim.get_user_assignments(logger=logger) \
                if self.multiuser_services else [resource_claim.as_user_assignment(logger=logger)]

            for user_assignment in user_assignments:
                user_assignment_definition = user_assignment.serialize()
                for idx, item in enumerate(workshop_definition['spec'].get('userAssignments', [])):
                    if item.get('resourceClaimName') == resource_claim.name \
                    and (
                        not self.multiuser_services or 
                        item.get('userName') == user_assignment.user_name
                    ):
                        updated_item = deep_update(item, user_assignment_definition)
                        if item != updated_item:
                            workshop_definition['spec']['userAssignments'][idx] = updated_item
                            workshop_definition_updated = True
                        break
                else:
                    if 'userAssignments' in workshop_definition['spec']:
                        workshop_definition['spec']['userAssignments'].append(user_assignment_definition)
                    else:
                        workshop_definition['spec']['userAssignments'] = [user_assignment_definition]
                    workshop_definition_updated = True

            if not workshop_definition_updated:
                return

            try:
                updated_definition = custom_objects_api.replace_namespaced_custom_object(
                    babylon_domain, babylon_api_version, self.namespace,
                    'workshops', self.name, workshop_definition
                )
                self.__init__(definition=updated_definition)
                logger.info(
                    f"Updated Workshop {self.name} in namespace {self.namespace} "
                    f"for ResourceClaim {resource_claim.name}"
                )
                return
            except kubernetes.client.rest.ApiException as e:
                if e.status != 409:
                    raise


class WorkshopProvision:
    workshop_provisions = {}

    @staticmethod
    def register(name, namespace, **kwargs):
        workshop_provision = WorkshopProvision.workshop_provisions.get((namespace, name))
        if workshop_provision:
            workshop_provision.__init__(name=name, namespace=namespace, **kwargs)
        else:
            workshop_provision = WorkshopProvision(name=name, namespace=namespace, **kwargs)
            WorkshopProvision.workshop_provisions[(namespace, name)] = workshop_provision
        return workshop_provision

    def __init__(
        self,
        annotations=None,
        definition=None,
        labels=None,
        meta=None,
        name=None,
        namespace=None,
        spec=None,
        uid=None,
        **_,
    ):
        if definition:
            self.meta = definition['metadata']
            self.spec = definition['spec']
            self.annotations = self.meta.get('labels', {})
            self.labels = self.meta.get('labels', {})
            self.name = self.meta['name']
            self.namespace = self.meta['namespace']
            self.uid = self.meta['uid']
        else:
            self.annotations = annotations
            self.labels = labels
            self.meta = meta
            self.name = name
            self.namespace = namespace
            self.spec = spec
            self.uid = uid

    @property
    def catalog_item_name(self):
        return self.spec['catalogItem']['name']

    @property
    def catalog_item_namespace(self):
        return self.spec['catalogItem']['namespace']

    @property
    def concurrency(self):
        return self.spec.get('concurrency', self.count)

    @property
    def count(self):
        return self.spec.get('count', 0)

    @property
    def lifespan_end(self):
        lifespan_end_timestamp = self.spec.get('lifespan', {}).get('end')
        if not lifespan_end_timestamp:
            return None
        return datetime.strptime(
            lifespan_end_timestamp, '%Y-%m-%dT%H:%M:%SZ'
        ).replace(tzinfo=timezone.utc)

    @property
    def lifespan_start(self):
        lifespan_start_timestamp = self.spec.get('lifespan', {}).get('start')
        if not lifespan_start_timestamp:
            return None
        return datetime.strptime(
            lifespan_start_timestamp, '%Y-%m-%dT%H:%M:%SZ'
        ).replace(tzinfo=timezone.utc)

    @property
    def owner_references(self):
        return self.meta.get('ownerReferences', [])

    @property
    def parameters(self):
        return self.spec.get('parameters', {})

    @property
    def start_delay(self):
        return self.spec.get('startDelay', 10)

    @property
    def action_schedule_start(self):
        start_timestamp = self.spec.get('actionSchedule', {}).get('start')
        if not start_timestamp:
            return None
        return datetime.strptime(
            start_timestamp, '%Y-%m-%dT%H:%M:%SZ'
        ).replace(tzinfo=timezone.utc)

    @property
    def action_schedule_stop(self):
        stop_timestamp = self.spec.get('actionSchedule', {}).get('stop')
        if not stop_timestamp:
            return None
        return datetime.strptime(
            stop_timestamp, '%Y-%m-%dT%H:%M:%SZ'
        ).replace(tzinfo=timezone.utc)

    @property
    def workshop_name(self):
        return self.spec['workshopName']
    
    def create_resource_claim(self, logger, workshop):
        logger.debug(f"Creating ResourceClaim for {self.name} in namespace {self.namespace}")
        try:
            catalog_item = CatalogItem.get(
                name = self.catalog_item_name,
                namespace = self.catalog_item_namespace,
            )
        except kubernetes.client.rest.ApiException as e:
            if e.status == 404:
                raise kopf.TemporaryError(
                    f"CatalogItem {self.catalog_item_name} was not found in namespace {self.catalog_item_namespace}.",
                    delay=60
                )
            else:
                raise

        resource_claim_definition = {
            "apiVersion": f"{poolboy_domain}/{poolboy_api_version}",
            "kind": "ResourceClaim",
            "metadata": {
                "annotations": {
                    catalog_display_name_annotation: catalog_item.catalog_display_name,
                    catalog_item_display_name_annotation: catalog_item.display_name,
                    notifier_annotation: "disable",
                },
                "generateName": f"{catalog_item.name}-",
                "labels": {
                    catalog_item_name_label: catalog_item.name,
                    catalog_item_namespace_label: catalog_item.namespace,
                    workshop_label: workshop.name,
                    workshop_provision_label: self.name,
                },
                "namespace": f"{self.namespace}",
                "ownerReferences": [{
                    "apiVersion": f"{babylon_domain}/{babylon_api_version}",
                    "controller": True,
                    "kind": "WorkshopProvision",
                    "name": self.name,
                    "uid": self.uid,
                }]
            },
            "spec": {
                "resources": deepcopy(catalog_item.resources)
            }
        }

        if workshop.requester:
            resource_claim_definition['metadata']['annotations'][requester_annotation] = workshop.requester

        if catalog_item.lab_ui_type:
            resource_claim_definition['metadata']['labels'][lab_ui_label] = catalog_item.lab_ui_type

        for catalog_item_parameter in catalog_item.parameters:
            value = self.parameters[catalog_item_parameter.name] \
                if catalog_item_parameter.name in self.parameters else catalog_item_parameter.default
            if value == None and not catalog_item_parameter.required:
                continue
            if catalog_item_parameter.annotation:
                resource_claim_definition['metadata']['annotations'][catalog_item_parameter.annotation] = str(value)
            if catalog_item_parameter.variable:
                for resource_index in catalog_item_parameter.resource_indexes:
                    resource_claim_definition['spec']['resources'][resource_index] = deep_update(
                        resource_claim_definition['spec']['resources'][resource_index],
                        {'template': {'spec': {'vars': {'job_vars': {catalog_item_parameter.variable: value}}}}}
                    )

        resource_claim_definition = custom_objects_api.create_namespaced_custom_object(
            poolboy_domain, poolboy_api_version, self.namespace, 'resourceclaims',
            resource_claim_definition
        )
        if workshop.service_url:
            url_prefix = re.sub(r'^(https?://[^/]+).*', r'\1', workshop.service_url)
            name = resource_claim_definition['metadata']['name']
            resource_claim_definition = custom_objects_api.patch_namespaced_custom_object(
                poolboy_domain, poolboy_api_version, self.namespace, 'resourceclaims', name,
                {
                    "metadata": {
                        "annotations": {
                            url_annotation: f"{url_prefix}/services/{self.namespace}/{name}"
                        }
                    }
                }
            )

        resource_claim = ResourceClaim(resource_claim_definition)
        logger.info(
            f"Created ResourceClaim for {resource_claim.name} "
            f"for WorkshopProvision {self.name} in namespace {self.namespace}"
        )
        return resource_claim

    def delete_all_resource_claims(self, logger):
        logger.info(f"Deleting all ResourceClaims for WorkshopProvision {self.name} in namespace {self.namespace}")
        for resource_claim in self.list_resource_claims():
            logger.info(f"Deleting ResourceClaim {resource_claim.name} in namespace {resource_claim.namespace}")
            try:
                custom_objects_api.delete_namespaced_custom_object(
                    poolboy_domain, poolboy_api_version, resource_claim.namespace, 
                    'resourceclaims', resource_claim.name
                )
            except kubernetes.client.rest.ApiException as e:
                if e.status != 404:
                    raise

    def get_workshop(self):
        return Workshop.get(name=self.workshop_name, namespace=self.namespace)

    def list_resource_claims(self):
        _continue = None
        while True:
            resource_claim_list = custom_objects_api.list_namespaced_custom_object(
                poolboy_domain, poolboy_api_version, self.namespace, 'resourceclaims',
                label_selector = f"{workshop_provision_label}={self.name}",
                limit = 20, _continue = _continue
            )
            for resource_claim_definition in resource_claim_list.get('items', []):
                yield ResourceClaim(definition=resource_claim_definition)
            _continue = resource_claim_list['metadata'].get('continue')
            if not _continue:
                return

    def manage_resource_claims(self, logger):
        logger.debug(f"Manage ResourceClaims for {self.name} in namespace {self.namespace}")

        try:
            workshop = self.get_workshop()
        except kubernetes.client.rest.ApiException as e:
            if e.status == 404:
                raise kopf.TemporaryError("Workshop {self.workshop_name} was not found.", delay=30)
            else:
                raise

        resource_claim_count = 0
        provisioning_count = 0
        for resource_claim in self.list_resource_claims():
            resource_claim_count += 1
            resource_claim.adjust_action_schedule_and_lifetime(
                lifespan_end = self.lifespan_end,
                logger = logger,
                start_datetime = self.action_schedule_start,
                stop_datetime = self.action_schedule_stop,
            )
            if resource_claim.provision_complete:
                workshop.update_resource_claim(
                    logger = logger,
                    resource_claim = resource_claim,
                )
            else:
                provisioning_count += 1

        # Do not start any provisions if lifespan start is in the future
        if self.lifespan_start and self.lifespan_start > datetime.now(timezone.utc):
            return

        # Start provisions up to count and within concurrency limit
        if resource_claim_count < self.count and provisioning_count < self.concurrency:
            self.create_resource_claim(logger=logger, workshop=workshop)

    def on_create(self, logger):
        logger.debug(f"Handling WorkshopProvision create for {self.name} in namespace {self.namespace}")
        self.set_owner_references(logger=logger)

    def on_delete(self, logger):
        logger.info(f"Handling WorkshopProvision delete for {self.name} in namespace {self.namespace}")
        self.delete_all_resource_claims(logger=logger)

    def on_resume(self, logger):
        logger.debug(f"Handling WorkshopProvision resume for {self.name} in namespace {self.namespace}")
        self.set_owner_references(logger=logger)

    def on_update(self, logger):
        logger.debug(f"Handling WorkshopProvision update for {self.name} in namespace {self.namespace}")

    def set_owner_references(self, logger):
        try:
            workshop = self.get_workshop()
        except kubernetes.client.rest.ApiException as e:
            if e.status == 404:
                raise kopf.TemporaryError("Workshop {self.workshop_name} was not found.", delay=30)
            else:
                raise
        if not self.owner_references or not workshop_label in self.labels:
            logger.info("Setting ownerReferences and workshop label for WorkshopProvision {self.name} in namespace {self.namespace}")
            custom_objects_api.patch_namespaced_custom_object(
                babylon_domain, babylon_api_version,
                self.namespace, 'workshopprovisions', self.name,
                {
                    "metadata": {
                        "labels": {
                            workshop_label: workshop.name,
                        },
                        "ownerReferences": [{
                            "apiVersion": f"{babylon_domain}/{babylon_api_version}",
                            "controller": True,
                            "kind": "Workshop",
                            "name": workshop.name,
                            "uid": workshop.uid,
                        }]
                    }
                }
            )

    def unregister(self):
        WorkshopProvision.workshop_provisions.pop((self.namespace, self.name), None)


@kopf.on.startup()
def configure(settings: kopf.OperatorSettings, **_):
    # Never give up from network errors
    settings.networking.error_backoffs = InfiniteRelativeBackoff()

    # Store last handled configuration in status
    settings.persistence.diffbase_storage = kopf.StatusDiffBaseStorage(field='status.diffBase')

    # Use operator domain as finalizer
    settings.persistence.finalizer = finalizer_value

    # Store progress in status. Some objects may be too large to store status in metadata annotations
    settings.persistence.progress_storage = kopf.StatusProgressStorage(field='status.kopf.progress')

    # Only create events for warnings and errors
    settings.posting.level = logging.WARNING

    # Disable scanning for CustomResourceDefinitions
    settings.scanning.disabled = True


# Directly watch ResourceClaims for case of a Workshop not using WorkshopProvision
@kopf.on.event(poolboy_domain, poolboy_api_version, 'resourceclaims', labels={workshop_label: kopf.PRESENT})
def resource_claim_event(event, logger, **_):
    definition = event.get('object')
    if not definition \
    or definition.get('kind') != 'ResourceClaim':
        logger.warning(event)
        return

    resource_claim = ResourceClaim(definition=definition)

    # Do not handle events until provision has completed
    if not resource_claim.provision_complete:
        return

    try:
        workshop = resource_claim.get_workshop()
    except kubernetes.client.rest.ApiException as e:
        if e.status == 404:
            logger.warning(
                f"ResourceClaim {resource_claim.name} in namespace {resource_claim.namespace} "
                f"references mising Workshop {resource_claim.workshop_name}"
            )
        else:
            raise

    if event.get('type') == 'DELETED':
        workshop.remove_resource_claim(
            logger = logger,
            resource_claim = resource_claim,
        )
    else:
        workshop.update_resource_claim(
            logger = logger,
            resource_claim = resource_claim,
        )


@kopf.on.create(babylon_domain, babylon_api_version, 'workshops')
def workshop_create(logger, **kwargs):
    workshop = Workshop.register(**kwargs)
    workshop.on_create(logger=logger)

@kopf.on.delete(babylon_domain, babylon_api_version, 'workshops')
def workshop_delete(logger, **kwargs):
    workshop = Workshop.register(**kwargs)
    workshop.on_delete(logger=logger)
    workshop.unregister()

@kopf.on.resume(babylon_domain, babylon_api_version, 'workshops')
def workshop_resume(logger, **kwargs):
    workshop = Workshop.register(**kwargs)
    workshop.on_resume(logger=logger)

@kopf.on.update(babylon_domain, babylon_api_version, 'workshops')
def workshop_update(logger, **kwargs):
    workshop = Workshop.register(**kwargs)
    workshop.on_update(logger=logger)

@kopf.daemon(babylon_domain, babylon_api_version, 'workshops')
async def workshop_daemon(logger, stopped, **kwargs):
    workshop = Workshop.register(**kwargs)
    try:
        while not stopped:
            workshop.manage(logger=logger)
            await asyncio.sleep(60)
    except asyncio.CancelledError:
        pass


@kopf.on.create(babylon_domain, babylon_api_version, 'workshopprovisions')
def workshop_provision_create(logger, **kwargs):
    workshop_provision = WorkshopProvision.register(**kwargs)
    workshop_provision.on_create(logger=logger)

@kopf.on.delete(babylon_domain, babylon_api_version, 'workshopprovisions')
def workshop_provision_delete(logger, **kwargs):
    workshop_provision = WorkshopProvision.register(**kwargs)
    workshop_provision.on_delete(logger=logger)
    workshop_provision.unregister()

@kopf.on.resume(babylon_domain, babylon_api_version, 'workshopprovisions')
def workshop_provision_resume(logger, **kwargs):
    workshop_provision = WorkshopProvision.register(**kwargs)
    workshop_provision.on_resume(logger=logger)

@kopf.on.update(babylon_domain, babylon_api_version, 'workshopprovisions')
def workshop_provision_update(logger, **kwargs):
    workshop_provision = WorkshopProvision.register(**kwargs)
    workshop_provision.on_update(logger=logger)

@kopf.daemon(babylon_domain, babylon_api_version, 'workshopprovisions')
async def workshop_provision(logger, stopped, **kwargs):
    workshop_provision = WorkshopProvision.register(**kwargs)
    try:
        while not stopped:
            workshop_provision.manage_resource_claims(logger=logger)
            await asyncio.sleep(workshop_provision.start_delay)
    except asyncio.CancelledError:
        pass
