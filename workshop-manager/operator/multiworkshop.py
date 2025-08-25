#!/usr/bin/env python3

import asyncio
import logging

from babylon import Babylon
from cachedkopfobject import CachedKopfObject


class MultiWorkshop(CachedKopfObject):
    api_group = Babylon.babylon_domain
    api_version = Babylon.babylon_api_version
    kind = 'MultiWorkshop'
    plural = 'multiworkshops'

    cache = {}

    @classmethod
    async def preload(cls):
        """Override preload to avoid issues during startup.
        
        MultiWorkshop preloading can be skipped as resources will be loaded
        on-demand when needed by the operator handlers.
        """
        pass

    def __init__(self, **kwargs):
        """Initialize MultiWorkshop with kopf event parameters."""
        # Extract the parameters that KopfObject expects
        meta = kwargs.get('meta', {})
        
        # Provide defaults for required parameters
        init_kwargs = {
            'annotations': kwargs.get('annotations', meta.get('annotations', {})),
            'labels': kwargs.get('labels', meta.get('labels', {})),
            'meta': meta,
            'name': kwargs.get('name', meta.get('name', '')),
            'namespace': kwargs.get('namespace', meta.get('namespace', '')),
            'spec': kwargs.get('spec', {}),
            'status': kwargs.get('status', {}),
            'uid': kwargs.get('uid', meta.get('uid', '')),
        }
        
        super().__init__(**init_kwargs)

    @property
    def assets(self):
        """Get assets from MultiWorkshop spec."""
        return self.spec.get('assets', [])

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
            workshop_name = asset.get('name')
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
                await self.merge_patch(patch)
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
