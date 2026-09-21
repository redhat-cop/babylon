from kubernetes_asyncio.client import ApiException as k8sApiException

from babylon import Babylon
from k8sobject import K8sObject

import serviceaccessconfig

class SelfPacedLab(K8sObject):
    api_group = Babylon.babylon_domain
    api_version = Babylon.babylon_api_version
    kind = 'SelfPacedLab'
    plural = 'selfpacedlabs'

    @classmethod
    async def handle_event(cls, event, logger):
        definition = event.get('object')
        if not definition or definition.get('kind') != 'SelfPacedLab':
            logger.warning(event)
            return
        self_paced_lab = cls(definition=definition)
        if (
            event.get('type') == 'DELETED' or
            self_paced_lab.deletion_timestamp is not None
        ):
            await self_paced_lab.__handle_delete(logger)
        else:
            await self_paced_lab.__handle_event(logger)

    @property
    def resource_claim_names(self) -> list[str]:
        return list(self.status.get('resourceClaims', {}).keys())

    @property
    def service_access_config_names(self) -> list[str]:
        return self.status.get('serviceAccessConfigs', [])

    async def __handle_delete(self, logger):
        for service_access_config_name in self.service_access_config_names:
            try:
                service_access_config = await serviceaccessconfig.ServiceAccessConfig.fetch(
                    name=service_access_config_name,
                    namespace=self.namespace,
                )
                logger.info("Deleting %s after delete of %s", service_access_config, self)
                await service_access_config.delete()
            except k8sApiException as exception:
                if exception.status != 404:
                    logger.exception("Failed to get ServiceAccessConfig %s for %s", service_access_config_name, self)

    async def __handle_event(self, logger):
        for service_access_config_name in self.service_access_config_names:
            try:
                service_access_config = await serviceaccessconfig.ServiceAccessConfig.fetch(
                    name=service_access_config_name,
                    namespace=self.namespace,
                )
            except k8sApiException as exception:
                if exception.status == 404:
                    logger.warning("ServiceAccessConfig %s for %s not found", service_access_config_name, self)
                else:
                    logger.exception("Failed to get ServiceAccessConfig %s for %s", service_access_config_name, self)
                continue
            await service_access_config.handle_self_paced_lab_event(self, logger)
