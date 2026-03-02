import json

from copy import deepcopy
from datetime import datetime, timezone

from kubernetes_asyncio.client import ApiException as k8sApiException

from babylon import Babylon
from k8sobject import K8sObject

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
        if (
            event.get('type') == 'DELETED' or
            resource_claim.deletion_timestamp is not None
        ):
            await resource_claim.__handle_delete(logger)

    @property
    def service_access_config_names(self) -> list[str]:
        """Return names of ServiceAccessConfigs associated with this ResourceClaim"""
        return self.status.get('serviceAccessConfigs', [])

    async def __handle_delete(self, logger):
        for service_access_config_name in self.service_access_config_names:
            try:
                service_access_config = await service_access_config.ServiceAccessConfig.fetch(
                    name=service_access_config_name,
                    namespace=self.namespace,
                )
                logger.info("Deleting %s after delete of %s", service_access_config, self)
                await service_access_config.delete()
            except k8sApiException as exception:
                if exception.status != 404:
                    logger.exception("Failed to get ServiceAccessConfig %s for %s", service_access_config_name, self)
