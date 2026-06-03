import random
from datetime import datetime, timezone
from urllib.parse import urlparse

from kubernetes_asyncio.client.exceptions import ApiException as k8sApiException

import resourceclaim
import selfpacedlabprovisionitem
from babylon import Babylon
from cachedkopfobject import CachedKopfObject


class SelfPacedLab(CachedKopfObject):
    api_group = Babylon.babylon_domain
    api_version = Babylon.babylon_api_version
    kind = 'SelfPacedLab'
    plural = 'selfpacedlabs'

    cache = {}

    @property
    def asset_uuid(self):
        return self.labels.get(Babylon.asset_uuid_label)

    @property
    def ignore(self):
        return Babylon.babylon_ignore_label in self.labels

    @property
    def lifespan_start(self):
        start_timestamp = self.spec.get('lifespan', {}).get('start')
        if not start_timestamp:
            return None
        return datetime.strptime(start_timestamp, '%Y-%m-%dT%H:%M:%SZ').replace(
            tzinfo=timezone.utc
        )

    @property
    def lifespan_end(self):
        end_timestamp = self.spec.get('lifespan', {}).get('end')
        if not end_timestamp:
            return None
        return datetime.strptime(end_timestamp, '%Y-%m-%dT%H:%M:%SZ').replace(
            tzinfo=timezone.utc
        )

    @property
    def ordered_by(self):
        return self.annotations.get(Babylon.ordered_by_annotation)

    @property
    def requester(self):
        return self.annotations.get(Babylon.requester_annotation)

    @property
    def resource_claim_names(self) -> list[str]:
        return list(self.status.get('resourceClaims', {}).keys())

    @property
    def service_url(self):
        return self.annotations.get(Babylon.url_annotation)

    @property
    def white_gloved(self):
        return self.labels.get(Babylon.white_glove_label)

    @property
    def selfpacedlab_provision_item_names(self) -> list[str]:
        return list(self.status.get('selfPacedLabProvisionItems', {}).keys())

    @property
    def selfpacedlab_id(self):
        return self.labels.get(Babylon.selfpacedlab_id_label)

    @property
    def selfpacedlab_url(self):
        return self.status.get('selfPacedLabURL')

    @property
    def _effective_base_url(self):
        if Babylon.selfpacedlab_base_url:
            return Babylon.selfpacedlab_base_url
        if self.service_url:
            parsed = urlparse(self.service_url)
            if parsed.scheme and parsed.netloc:
                return f"{parsed.scheme}://{parsed.netloc}"
        return ''

    def get_selfpacedlab_provision_items(self):
        return selfpacedlabprovisionitem.SelfPacedLabProvisionItem.get_for_selfpacedlab(self)

    async def delete_all_resource_claims(self, logger):
        logger.info(f"Deleting all ResourceClaims for {self}")
        async for resource_claim_obj in self.list_resource_claims():
            logger.info(f"Deleting {resource_claim_obj}")
            await resource_claim_obj.delete()

    async def delete_all_selfpacedlab_provision_items(self, logger):
        logger.info(f"Deleting all SelfPacedLabProvisionItems for {self}")
        for item in self.get_selfpacedlab_provision_items():
            logger.info(f"Deleting {item}")
            await item.delete()

    async def handle_create(self, logger):
        async with self.lock:
            logger.info(f"Handling create for {self}")
            await self.__manage_selfpacedlab_id_label(logger=logger)

    async def handle_delete(self, logger):
        async with self.lock:
            logger.info(f"Handling delete for {self}")
            await self.delete_all_selfpacedlab_provision_items(logger=logger)
            await self.delete_all_resource_claims(logger=logger)

    async def handle_resume(self, logger):
        async with self.lock:
            logger.info(f"Handling resume for {self}")
            await self.__manage_selfpacedlab_id_label(logger=logger)
            await self.update_status()

    async def handle_update(self, logger):
        async with self.lock:
            logger.info(f"Handling update for {self}")
            await self.__manage_selfpacedlab_id_label(logger=logger)
            await self.update_status()

    async def list_resource_claims(self):
        async for resource_claim_obj in resourceclaim.ResourceClaim.list(
            label_selector=f"{Babylon.selfpacedlab_label}={self.name}",
            namespace=self.namespace,
        ):
            yield resource_claim_obj

    async def manage(self, logger):
        async with self.lock:
            await self.update_status()

    async def __manage_selfpacedlab_id_label(self, logger):
        """Generate a unique selfpacedlab id label to provide a short URL for access."""
        if self.selfpacedlab_id:
            if not self.selfpacedlab_url:
                url = f"{self._effective_base_url}/selfpacedlab/{self.selfpacedlab_id}"
                await self.merge_patch_status({"selfPacedLabURL": url})
                logger.info(f"Set selfPacedLabURL {url} for {self}")
            return

        while True:
            selfpacedlab_id = ''.join(
                random.choice('23456789abcdefghjkmnpqrstuvwxyz') for i in range(6)
            )
            id_in_use = any(
                lab.selfpacedlab_id == selfpacedlab_id
                for lab in self.cache.values()
            )
            if not id_in_use:
                break

        await self.merge_patch(
            {
                "metadata": {
                    "labels": {
                        Babylon.selfpacedlab_id_label: selfpacedlab_id,
                    }
                }
            }
        )
        logger.info(f"Assigned selfpacedlab id {selfpacedlab_id} to {self}")

        url = f"{self._effective_base_url}/selfpacedlab/{selfpacedlab_id}"
        await self.merge_patch_status({"selfPacedLabURL": url})
        logger.info(f"Set selfPacedLabURL {url} for {self}")

    async def add_resource_claim_to_status(self, resource_claim_obj, logger):
        if resource_claim_obj.name in self.status.get('resourceClaims', {}):
            return
        await self.merge_patch_status(
            {"resourceClaims": {resource_claim_obj.name: {"uid": resource_claim_obj.uid}}}
        )
        logger.info("Added %s to %s status", resource_claim_obj, self)

    async def add_selfpacedlab_provision_item_to_status(self, item, logger):
        if item.name in self.status.get('selfPacedLabProvisionItems', {}):
            return
        await self.merge_patch_status(
            {
                "selfPacedLabProvisionItems": {
                    item.name: {"uid": item.uid}
                }
            }
        )
        logger.info("Added %s to %s status", item, self)

    async def remove_resource_claim_from_status(self, resource_claim_obj, logger):
        if resource_claim_obj.name not in self.status.get('resourceClaims', {}):
            return
        await self.merge_patch_status({"resourceClaims": {resource_claim_obj.name: None}})
        logger.info("Removed %s from %s status", resource_claim_obj, self)

    async def remove_selfpacedlab_provision_item_from_status(self, item, logger):
        if item.name not in self.status.get('selfPacedLabProvisionItems', {}):
            return
        await self.merge_patch_status(
            {"selfPacedLabProvisionItems": {item.name: None}}
        )
        logger.info("Removed %s from %s status", item, self)

    async def update_status(self):
        total_ready_count = 0
        total_provisioning_count = 0
        total_assigned_count = 0

        for item in self.get_selfpacedlab_provision_items():
            item_status = item.status or {}
            total_ready_count += item_status.get('readyCount', 0)
            total_provisioning_count += item_status.get('provisioningCount', 0)
            total_assigned_count += item_status.get('assignedCount', 0)

        await self.merge_patch_status(
            {
                "poolCount": {
                    "ready": total_ready_count,
                    "provisioning": total_provisioning_count,
                    "assigned": total_assigned_count,
                },
            }
        )
