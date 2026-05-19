from datetime import datetime, timezone

from kubernetes_asyncio.client.exceptions import ApiException as k8sApiException

from babylon import Babylon
from k8sobject import K8sObject

import selfpacedlab as selfpacedlab_import


class ResourceClaim(K8sObject):
    api_group = Babylon.poolboy_domain
    api_version = Babylon.poolboy_api_version
    kind = 'ResourceClaim'
    plural = 'resourceclaims'

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
            return

        if lab is None:
            logger.warning(
                f"{resource_claim} references missing SelfPacedLab {resource_claim.selfpacedlab_name}"
            )
            return

        await lab.add_resource_claim_to_status(resource_claim, logger=logger)

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

    async def get_selfpacedlab(self):
        return await selfpacedlab_import.SelfPacedLab.get(
            name=self.selfpacedlab_name, namespace=self.namespace
        )
