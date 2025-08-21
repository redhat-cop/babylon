#!/usr/bin/env python3

import asyncio
import logging

from babylon import Babylon
from k8sobject import K8sObject


class MultiWorkshop(K8sObject):
    api_group = Babylon.babylon_domain
    api_version = 'v1'
    plural = 'multiworkshops'

    @classmethod
    async def preload(cls):
        """Preload MultiWorkshop CRD."""
        await cls._preload()

    @property
    def assets(self):
        """Get assets from MultiWorkshop spec."""
        return self.spec.get('assets', [])

    @property
    def namespace(self):
        """Get namespace from MultiWorkshop metadata."""
        return self.metadata['namespace']

    async def update_workshop_ids(self, logger=None):
        """Check if any assets are missing workshop IDs and update them."""
        if not logger:
            logger = logging.getLogger(__name__)
            
        assets = self.assets
        if not assets:
            return False

        needs_update = False
        updated_assets = []

        for asset in assets:
            # Skip if asset already has workshop ID or doesn't have workshop name or asset name
            workshop_name = asset.get('workshopName') or asset.get('name')
            if asset.get('workshopId') or not workshop_name:
                updated_assets.append(asset)
                continue

            # Try to get the workshop and its ID
            try:
                workshop = await Babylon.custom_objects_api.get_namespaced_custom_object(
                    group=Babylon.babylon_domain,
                    version='v1',
                    namespace=self.namespace,
                    plural='workshops',
                    name=workshop_name
                )

                workshop_id = workshop.get('metadata', {}).get('labels', {}).get(f'{Babylon.babylon_domain}/workshop-id')
                if workshop_id:
                    # Create a copy of the asset and add the workshop ID
                    asset_copy = asset.copy()
                    asset_copy['workshopId'] = workshop_id
                    updated_assets.append(asset_copy)
                    needs_update = True
                    logger.info(f"Found workshop ID {workshop_id} for MultiWorkshop {self.name} asset {asset['key']}")
                else:
                    # Workshop exists but doesn't have an ID yet
                    updated_assets.append(asset)

            except Exception as e:
                # Workshop might not exist yet or other error, keep original asset
                logger.debug(f"Could not get workshop {workshop_name} for MultiWorkshop {self.name}: {e}")
                updated_assets.append(asset)

        # Update the MultiWorkshop if any assets were updated
        if needs_update:
            try:
                patch = {
                    'spec': {
                        'assets': updated_assets
                    }
                }
                await self.json_patch(patch)
                logger.info(f"Updated workshop IDs for MultiWorkshop {self.name}")
                return True
            except Exception as e:
                logger.error(f"Failed to update MultiWorkshop {self.name}: {e}")
                return False

        return False

    async def handle_create(self, logger):
        """Handle MultiWorkshop creation."""
        logger.info(f"MultiWorkshop {self.name} created")

    async def handle_update(self, logger):
        """Handle MultiWorkshop updates."""
        logger.debug(f"MultiWorkshop {self.name} updated")
        # Check for missing workshop IDs after updates
        await self.update_workshop_ids(logger)

    async def handle_delete(self, logger):
        """Handle MultiWorkshop deletion."""
        logger.info(f"MultiWorkshop {self.name} deleted")

    async def manage(self, logger):
        """Periodic management tasks for MultiWorkshop."""
        # Check for missing workshop IDs
        await self.update_workshop_ids(logger)
