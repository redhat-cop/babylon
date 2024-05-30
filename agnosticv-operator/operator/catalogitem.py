import asyncio
import json
import kubernetes_asyncio
import logging
import os

from datetime import datetime, timezone

from babylon import Babylon
from k8sobject import K8sObject

from agnosticvcomponent import AgnosticVComponent

logger = logging.getLogger('catalogitem')

deleted_from_agnosticv_message = "Deleted from AgnosticV"

class CatalogItem(K8sObject):
    api_group = Babylon.catalog_api_group
    api_version = Babylon.catalog_version
    api_group_version = f"{api_group}/{api_version}"
    kind = "CatalogItem"
    plural = "catalogitems"
    monitor_component_deletion_interval = int(os.environ.get('CATALOG_ITEM_CLEANUP_INTERVAL', 60))

    @classmethod
    async def check_all_component_deletion(cls):
        async for catalog_item in cls.list():
            if not catalog_item.deletion_timestamp:
                await catalog_item.check_component_deletion()

    @classmethod
    async def monitor_component_deletion(cls):
        logger.info("Starting monitor for CatalogItem component deletion")
        try:
            while True:
                await cls.check_all_component_deletion()
                await asyncio.sleep(cls.monitor_component_deletion_interval)
        except asyncio.CancelledError:
            logger.info("Exiting monitor for CatalogItem component deletion")
            return

    @classmethod
    async def on_cleanup(cls):
        cls.monitor_component_deletion_task.cancel()
        await cls.monitor_component_deletion_task

    @classmethod
    async def on_startup(cls):
        cls.monitor_component_deletion_task = asyncio.create_task(cls.monitor_component_deletion())

    @property
    def access_control(self):
        return self.spec.get('accessControl')

    @property
    def display_name(self):
        return self.spec.get('displayName', self.name)

    @property
    def has_deleted_ops_annotation(self):
        if not Babylon.ops_annotation in self.metadata:
            return False
        value = json.dumps(self.metadata[Babylon.ops_annotation])
        if not value.get('status', {}).get('id') == 'under-maintenance':
            return False
        comments = value.get('comments', [])
        if len(comments) != 1:
            return False
        if comments[0]['message'] != deleted_from_agnosticv_message:
            return False
        return True

    async def check_component_deletion(self):
        try:
            agnosticv_component = await self.fetch_agnosticv_component()
            if agnosticv_component.catalog_disable:
                logger.info(f"Checking {self} for deletion after AgnosticVComponent catalog disabled")
                await self.delete_if_no_resource_claims()
            elif self.namespace != agnosticv_component.catalog_item_namespace:
                logger.info(f"Checking {self} for deletion after AgnosticVComponent catalog namespace changed")
                await self.delete_if_no_resource_claims()
        except kubernetes_asyncio.client.rest.ApiException as e:
            if e.status == 404:
                logger.info(f"Checking {self} for deletion after AgnosticVComponent deletion")
                await self.delete_if_no_resource_claims()
            else:
                logger.exception(f"Exception checking for delete of {self}")
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception(f"Exception while checking for {self} AgnosticVComponent deletion")

    async def delete_if_no_resource_claims(self):
        try:
            resource_claim_list = await Babylon.custom_objects_api.list_cluster_custom_object(
                group=Babylon.resource_broker_api_group,
                label_selector=f"{Babylon.catalog_item_name_label}={self.name},{Babylon.catalog_item_namespace_label}={self.namespace}",
                limit=1,
                plural="resourceclaims",
                version=Babylon.resource_broker_version,
            )
            if resource_claim_list.get('items'):
                logger.info(f"Not deleting {self}, ResourceClaims still reference it.")

                no_access = {"allowGroups": []}
                patch = []
                if self.access_control != no_access:
                    patch.append({"op": "add", "path": "/spec/accessControl", "value": no_access})
                if not self.has_deleted_ops_annotation:
                    nowts = datetime.now(timezone.utc).strftime('%FT%TZ')
                    patch.append({
                        "op": "add",
                        "path": f"/metadata/annotations/{Babylon.ops_annotation.replace('/', '~1')}",
                        "value": json.dumps({
                            "comments": [{
                                "author": "agnosticv-operator",
                                "createdAt": nowts,
                                "message": deleted_from_agnosticv_message,
                            }],
                            "incidentUrl": "",
                            "jirjaIssueId": "",
                            "status": {
                                "id": "under-maintenance",
                                "updated": {
                                    "author": "agnosticv-operator",
                                    "updatedAt": nowts,
                                }
                            },
                            "updated": {
                                "author": "agnosticv-operator",
                                "updatedAt": nowts,
                            },
                        }, separators=(',',':')),
                    })
                if patch:
                    await self.json_patch(patch)
                return
        except:
            logger.exception(f"Exception while getting ResourceClaims for {self}")
            return

        logger.info(f"Deleting {self}")
        try:
            await self.delete()
        except:
            logger.exception(f"Exception while deleting {self}")

    async def fetch_agnosticv_component(self):
        return await AgnosticVComponent.fetch(name=self.name)
