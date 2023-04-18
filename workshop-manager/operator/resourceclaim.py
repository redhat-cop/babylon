import json

from copy import deepcopy
from datetime import datetime, timezone

import kubernetes_asyncio

from babylon import Babylon
from k8sobject import K8sObject
from labuserinterface import LabUserInterface
from userassignment import UserAssignment

import workshop as workshop_import

class ResourceClaim(K8sObject):
    api_group = Babylon.poolboy_domain
    api_version = Babylon.poolboy_api_version
    kind = 'ResourceClaim'
    plural = 'resourceclaims'

    lab_ui_url_keys = ('bookbag_url', 'lab_ui_url', 'labUserInterfaceUrl')

    @classmethod
    async def handle_event(cls, event, logger):
        definition = event.get('object')
        if not definition or definition.get('kind') != 'ResourceClaim':
            logger.warning(event)
            return

        resource_claim = cls(definition=definition)
        if not resource_claim.provision_complete:
            return

        if event.get('type') == 'DELETED':
            await resource_claim.handle_deleted(logger=logger)
            return

        try:
            workshop = await resource_claim.get_workshop()
        except kubernetes_asyncio.client.rest.ApiException as exception:
            if exception.status == 404:
                logger.warning(
                    f"{resource_claim} references mising Workshop {resource_claim.workshop_name}"
                )
            else:
                raise
        await workshop.handle_resource_claim_event(logger=logger, resource_claim=resource_claim)

    @property
    def api_group_version(self):
        return f"{self.api_group}/{self.api_version}"

    @property
    def effective_lifespan_end(self):
        lifespan_end_timestamp = self.definition.get('status', {}).get('lifespan', {}).get('end')
        if not lifespan_end_timestamp:
            return None
        return datetime.strptime(
            lifespan_end_timestamp, '%Y-%m-%dT%H:%M:%SZ'
        ).replace(tzinfo=timezone.utc)

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
        return self.status.get('resourceHandle', {}).get('name')

    @property
    def resource_handle_namespace(self):
        return self.status.get('resourceHandle', {}).get('namespace')

    @property
    def start_datetime(self):
        for resource in self.definition['spec']['resources']:
            try:
                return datetime.strptime(
                    resource['template']['spec']['vars']['action_schedule']['start'], '%Y-%m-%dT%H:%M:%SZ'
                ).replace(tzinfo=timezone.utc)
            except KeyError:
                pass
        return None

    @property
    def stop_datetime(self):
        for resource in self.definition['spec']['resources']:
            try:
                return datetime.strptime(
                    resource['template']['spec']['vars']['action_schedule']['stop'], '%Y-%m-%dT%H:%M:%SZ'
                ).replace(tzinfo=timezone.utc)
            except KeyError:
                pass
        return None

    @property
    def workshop_name(self):
        return self.labels.get(Babylon.workshop_label)

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
                    k: v for k, v in state_vars['provision_data'].items() if k not in self.lab_ui_url_keys
                })
                for lab_ui_url_key in self.lab_ui_url_keys:
                    if lab_ui_url_key in state_vars['provision_data']:
                        lab_user_interface = LabUserInterface(
                            url = state_vars['provision_data'][lab_ui_url_key]
                        )
                    break
            if 'provision_messages' in state_vars:
                provision_messages.extend(state_vars['provision_messages'])

        if Babylon.lab_ui_url_annotation in annotations:
            lab_user_interface = LabUserInterface(
                url = annotations[Babylon.lab_ui_url_annotation]
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
                    k: v for k, v in user_data.items() if k != 'msg' and k not in self.lab_ui_url_keys
                }
                user_messages = user_data.get('msg')
                for iter_user in user_assignments:
                    if iter_user.user_name == user_name:
                        user_assignment = iter_user
                        user_assignment.data.update(pruned_user_data)
                        if user_messages:
                            if user_assignment.messages:
                                user_assignment.messages = f"{user_assignment.messages}\n{user_messages}"
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
                for lab_ui_url_key in self.lab_ui_url_keys:
                    if lab_ui_url_key in user_data:
                        user_assignment.lab_user_interface = LabUserInterface(
                            url = user_data[lab_ui_url_key]
                        )
                    break

        if Babylon.lab_ui_urls_annotation in annotations:
            try:
                lab_ui_urls = json.loads(annotations[Babylon.lab_ui_urls_annotation])
            except json.decoder.JSONDecodeError as exception:
                logger.warning(
                    f"Failed to parse {Babylon.lab_ui_urls_annotation} annotation "
                    f"for ResourceClaim {self.name} in {self.namespace}: {exception.msg}"
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
                    f"{Babylon.lab_ui_urls_annotation} annotation for ResourceClaim "
                    f"{self.name} in {self.namespace} is not a dictionary!"
                )

        return user_assignments

    async def adjust_action_schedule_and_lifetime(
        self,
        lifespan_end=None,
        logger=None,
        start_datetime=None,
        stop_datetime=None,
    ):
        resource_claim_patch = None
        if lifespan_end and lifespan_end != self.effective_lifespan_end:
            lifespan_end_ts = lifespan_end.strftime('%FT%TZ')
            lifespan_maximum_days = 1 + int((lifespan_end - self.creation_datetime).total_seconds() / 60 / 60 / 24)
            lifespan_relative_maximum_days = 1 + int((lifespan_end - datetime.now(timezone.utc)).total_seconds() / 60 / 60 / 24)
            logger.info(f"Extending lifetime of {self} to {lifespan_end_ts}")

            # Override lifespan in ResourceHandle to allow extension required by ResourceClaim
            if self.resource_handle_name and self.resource_handle_namespace:
                await Babylon.custom_objects_api.patch_namespaced_custom_object(
                    group = self.api_group,
                    name = self.resource_handle_name,
                    namespace = self.resource_handle_namespace,
                    plural = "resourcehandles",
                    version = self.api_version,
                    _content_type = 'application/merge-patch+json',
                    body = {
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
            logger.info(f"Adjusting action schedule of {self}")
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
                if start_datetime and 'start' in action_schedule:
                    action_schedule['start'] = start_datetime.strftime('%FT%TZ')
                if stop_datetime and 'stop' in action_schedule:
                    action_schedule['stop'] = stop_datetime.strftime('%FT%TZ')
                resource_claim_patch['spec']['resources'].append(resource_copy)

        if resource_claim_patch:
            await self.merge_patch(resource_claim_patch)

    async def get_workshop(self):
        return await workshop_import.Workshop.get(name=self.workshop_name, namespace=self.namespace)

    async def handle_deleted(self, logger):
        try:
            workshop = await self.get_workshop()
        except kubernetes_asyncio.client.rest.ApiException as exception:
            if exception.status != 404:
                raise
        await workshop.handle_resource_claim_deleted(logger=logger, resource_claim=self)
