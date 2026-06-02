from datetime import datetime, timezone

from kubernetes_asyncio.client.exceptions import ApiException as k8sApiException

from babylon import Babylon
from k8sobject import K8sObject
from labuserinterface import LabUserInterface
from userassignment import UserAssignment

import selfpacedlab as selfpacedlab_import
import selfpacedlabuserassignment


class ResourceClaim(K8sObject):
    api_group = Babylon.poolboy_domain
    api_version = Babylon.poolboy_api_version
    kind = 'ResourceClaim'
    plural = 'resourceclaims'

    lab_ui_url_keys = ('bookbag_url', 'lab_ui_url', 'labUserInterfaceUrl', 'showroom_primary_view_url')

    @classmethod
    async def handle_event(cls, event, logger):
        definition = event.get('object')
        if not definition or definition.get('kind') != 'ResourceClaim':
            logger.warning(event)
            return

        resource_claim = cls(definition=definition)
        logger.debug(f"Handling {resource_claim} {event.get('type') or 'EVENT'}")

        lab = None
        try:
            lab = await resource_claim.get_selfpacedlab()
        except k8sApiException as exception:
            if exception.status != 404:
                logger.exception("Failed to get selfpacedlab %s", resource_claim.selfpacedlab_name)

        if event.get('type') == 'DELETED' or resource_claim.deletion_timestamp is not None:
            if lab is not None:
                await lab.remove_resource_claim_from_status(resource_claim, logger=logger)
            await resource_claim.delete_selfpacedlab_user_assignments(logger=logger)
            return

        if lab is None:
            logger.warning(
                f"{resource_claim} references missing SelfPacedLab {resource_claim.selfpacedlab_name}"
            )
            return

        await lab.add_resource_claim_to_status(resource_claim, logger=logger)

        if resource_claim.provision_complete and not resource_claim.is_failed:
            await resource_claim.manage_selfpacedlab_user_assignments(
                logger=logger, lab=lab,
            )

    @property
    def deletion_timestamp(self):
        return self.metadata.get('deletionTimestamp')

    @property
    def is_failed(self):
        if 'status' not in self.definition or 'resources' not in self.definition['status']:
            return False
        for resource in self.definition['status']['resources']:
            state = resource.get('state')
            if not state:
                return False
            if state['kind'] == 'AnarchySubject':
                current_state = state.get('spec', {}).get('vars', {}).get('current_state')
                if current_state is not None and (
                    current_state.endswith('-failed') or
                    current_state in ["provision-error", "provision-cancelled"]
                ):
                    return True
        return False

    @property
    def provision_complete(self):
        if 'status' not in self.definition \
        or 'resources' not in self.definition['status']:
            return False
        for resource in self.definition['status']['resources']:
            state = resource.get('state')
            if not state:
                return False
            if state['kind'] == 'AnarchySubject':
                current_state = state.get('spec', {}).get('vars', {}).get('current_state')
                if current_state is not None and (
                    current_state.endswith('-failed') or
                    current_state in ["provision-error", "provision-cancelled"]
                ):
                    return True
                if not state.get('status', {}).get('towerJobs', {}).get('provision', {}).get('completeTimestamp'):
                    return False
        return True

    @property
    def selfpacedlab_name(self):
        return self.labels.get(Babylon.selfpacedlab_label)

    def as_user_assignment(self):
        annotations = self.definition['metadata'].get('annotations', {})
        lab_user_interface = None
        provision_data = {}
        provision_messages = []

        for resource in self.definition.get('status', {}).get('resources', []):
            name = resource.get('name')
            state = resource.get('state')
            if not state or not state['kind'] == 'AnarchySubject':
                continue
            state_vars = state['spec']['vars']
            if 'provision_data' in state_vars:
                provision_data[name] = {}
                provision_data[name].update({
                    k: v for k, v in state_vars['provision_data'].items() if k not in self.lab_ui_url_keys
                })
                for lab_ui_url_key in self.lab_ui_url_keys:
                    if lab_ui_url_key in state_vars['provision_data']:
                        lab_user_interface = LabUserInterface(
                            url=state_vars['provision_data'][lab_ui_url_key]
                        )
                        break
            if 'provision_messages' in state_vars:
                provision_messages.extend(state_vars['provision_messages'])

        if Babylon.lab_ui_url_annotation in annotations:
            lab_user_interface = LabUserInterface(
                url=annotations[Babylon.lab_ui_url_annotation]
            )

        return UserAssignment(
            data=provision_data,
            lab_user_interface=lab_user_interface,
            messages="\n".join(provision_messages) if provision_messages else None,
            resource_claim_name=self.name,
        )

    async def delete_selfpacedlab_user_assignments(self, logger):
        await selfpacedlabuserassignment.SelfPacedLabUserAssignment.delete_for_resource_claim(
            logger=logger,
            namespace=self.namespace,
            resource_claim_name=self.name,
        )

    async def get_selfpacedlab(self):
        return await selfpacedlab_import.SelfPacedLab.get(
            name=self.selfpacedlab_name, namespace=self.namespace
        )

    async def manage_selfpacedlab_user_assignments(self, logger, lab):
        user_assignment = self.as_user_assignment()

        existing = await selfpacedlabuserassignment.SelfPacedLabUserAssignment.find(
            namespace=self.namespace,
            resource_claim_name=self.name,
            selfpacedlab_name=lab.name,
        )
        lab_user_interface = (
            user_assignment.lab_user_interface.serialize()
            if user_assignment.lab_user_interface else None
        )
        if existing:
            if (
                existing.data != user_assignment.data or
                existing.spec.get('labUserInterface') != lab_user_interface or
                existing.messages != user_assignment.messages
            ):
                await existing.merge_patch({
                    "data": user_assignment.data,
                    "labUserInterface": lab_user_interface,
                    "messages": user_assignment.messages,
                })
        else:
            new_assignment = await selfpacedlabuserassignment.SelfPacedLabUserAssignment.create(
                data=user_assignment.data,
                lab_user_interface=user_assignment.lab_user_interface,
                messages=user_assignment.messages,
                namespace=self.namespace,
                resource_claim=self,
                selfpacedlab_name=lab.name,
                selfpacedlab_id=lab.selfpacedlab_id or '',
            )
            logger.info(f"Created {new_assignment} for {lab} {self}")
