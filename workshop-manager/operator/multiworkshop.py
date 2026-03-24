#!/usr/bin/env python3

import asyncio
import json
import logging
import random
import re
import string

from datetime import datetime, timezone, timedelta

from kubernetes_asyncio.client.exceptions import ApiException as k8sApiException

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
        meta = kwargs.get('meta', {})

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
        return self.spec.get('assets', [])

    @property
    def catalog_assets(self):
        """Get only catalog (non-external) assets."""
        return [
            a for a in self.assets
            if a.get('type', 'Workshop') != 'external'
            and a.get('key', '').strip()
            and a.get('name', '').strip()
            and a.get('namespace', '').strip()
        ]

    @property
    def display_name(self):
        return self.spec.get('displayName', self.spec.get('name', self.name))

    @property
    def start_date(self):
        return self.spec.get('startDate')

    @property
    def end_date(self):
        return self.spec.get('endDate')

    @property
    def number_seats(self):
        return self.spec.get('numberSeats', 1)

    @property
    def purpose(self):
        return self.spec.get('purpose')

    @property
    def purpose_activity(self):
        return self.spec.get('purpose-activity')

    @property
    def salesforce_items(self):
        return self.spec.get('salesforceItems', [])

    @property
    def ready_by_date(self):
        return self.spec.get('readyByDate')

    @property
    def created_by(self):
        return self.annotations.get(f'{Babylon.babylon_domain}/created-by', '')

    @property
    def ordered_by(self):
        return self.annotations.get(Babylon.ordered_by_annotation, self.created_by)

    @property
    def requester(self):
        return self.annotations.get(Babylon.requester_annotation, self.created_by)

    @staticmethod
    def generate_k8s_name(base_name, max_length=63):
        """Generate a K8s-compliant name with a random 5-char suffix."""
        sanitized = re.sub(r'[^a-z0-9.]', '-', base_name.lower())
        sanitized = re.sub(r'-+', '-', sanitized).strip('-')
        suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=5))
        max_base = max_length - 6
        truncated = sanitized[:max_base].rstrip('-')
        return f"{truncated}-{suffix}"

    async def create_workshops_for_assets(self, logger):
        """Create Workshop and WorkshopProvision CRs for each catalog asset.

        Idempotent: skips assets that already have a Workshop (checked via label selector).
        """
        catalog_assets = self.catalog_assets
        if not catalog_assets:
            logger.info(f"No catalog assets to process for {self}")
            return

        # List workshops already created for this MultiWorkshop
        existing_workshops = {}
        try:
            workshop_list = await Babylon.custom_objects_api.list_namespaced_custom_object(
                group=Babylon.babylon_domain,
                version=Babylon.babylon_api_version,
                namespace=self.namespace,
                plural='workshops',
                label_selector=f"{Babylon.babylon_domain}/multiworkshop={self.name}",
            )
            for item in workshop_list.get('items', []):
                asset_key = item.get('metadata', {}).get('labels', {}).get(
                    f'{Babylon.babylon_domain}/asset-key'
                )
                if asset_key:
                    existing_workshops[asset_key] = item['metadata']['name']
        except Exception as e:
            logger.warning(f"Failed to list existing workshops for {self}: {e}")

        updated_assets = []

        for asset in self.assets:
            asset_key = asset.get('key', '')
            asset_type = asset.get('type', 'Workshop')

            if asset_type == 'external' or not asset_key.strip():
                updated_assets.append(asset)
                continue

            # Already created — skip
            if asset_key in existing_workshops:
                asset_copy = dict(asset)
                asset_copy['name'] = existing_workshops[asset_key]
                updated_assets.append(asset_copy)
                continue

            try:
                workshop_name = await self._create_workshop_and_provision(asset, logger)
                asset_copy = dict(asset)
                asset_copy['name'] = workshop_name
                updated_assets.append(asset_copy)
            except Exception as e:
                logger.error(f"Failed to create workshop for asset {asset_key} in {self}: {e}")
                updated_assets.append(asset)

        try:
            await self.merge_patch({'spec': {'assets': updated_assets}})
        except Exception as e:
            logger.error(f"Failed to update assets for {self}: {e}")

    async def _create_workshop_and_provision(self, asset, logger):
        """Create a Workshop and its WorkshopProvision for a single asset.

        Returns the workshop name.
        """
        asset_key = asset['key']
        asset_namespace = asset['namespace']
        asset_display_name = asset.get('displayName', '')
        asset_description = asset.get('description', '')

        catalog_item_def = await Babylon.custom_objects_api.get_namespaced_custom_object(
            group=Babylon.babylon_domain,
            version=Babylon.babylon_api_version,
            namespace=asset_namespace,
            plural='catalogitems',
            name=asset_key,
        )
        ci_meta = catalog_item_def.get('metadata', {})
        ci_labels = ci_meta.get('labels', {})
        ci_spec = catalog_item_def.get('spec', {})

        base_workshop_name = f"{self.name}-{ci_meta['name']}"
        workshop_name = self.generate_k8s_name(base_workshop_name)

        # --- Workshop labels ---
        workshop_labels = {
            Babylon.catalog_item_name_label: ci_meta['name'],
            Babylon.catalog_item_namespace_label: ci_meta['namespace'],
            f'{Babylon.demo_domain}/white-glove': 'false',
            f'{Babylon.demo_domain}/lock-enabled': 'true',
            f'{Babylon.babylon_domain}/multiworkshop': self.name,
            f'{Babylon.babylon_domain}/asset-key': asset_key,
        }
        asset_uuid = ci_labels.get(Babylon.asset_uuid_label)
        if asset_uuid:
            workshop_labels[Babylon.asset_uuid_label] = asset_uuid

        # --- Workshop annotations ---
        is_scheduled = False
        if self.start_date:
            try:
                start_dt = datetime.strptime(self.start_date, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)
                is_scheduled = start_dt > datetime.now(timezone.utc) + timedelta(minutes=15)
            except (ValueError, TypeError):
                pass

        workshop_annotations = {
            f'{Babylon.babylon_domain}/category': ci_spec.get('category', ''),
            f'{Babylon.demo_domain}/scheduled': 'true' if is_scheduled else 'false',
            f'{Babylon.babylon_domain}/created-by': self.created_by,
            f'{Babylon.babylon_domain}/multiworkshop-source': self.name,
            f'{Babylon.babylon_domain}/multiworkshop-uid': self.uid,
        }
        if self.requester:
            workshop_annotations[Babylon.requester_annotation] = self.requester
        if self.ordered_by:
            workshop_annotations[Babylon.ordered_by_annotation] = self.ordered_by
        if self.purpose:
            workshop_annotations[Babylon.purpose_annotation] = self.purpose
        if self.purpose_activity:
            workshop_annotations[Babylon.purpose_activity_annotation] = self.purpose_activity
        if self.salesforce_items:
            workshop_annotations[Babylon.salesforce_items_annotation] = json.dumps(self.salesforce_items)
        workshop_annotations[f'{Babylon.demo_domain}/provide_salesforce-id_later'] = (
            str(not bool(self.salesforce_items)).lower()
        )

        message_templates = ci_spec.get('messageTemplates', {})
        if message_templates.get('info'):
            workshop_annotations[f'{Babylon.demo_domain}/info-message-template'] = json.dumps(message_templates['info'])
        workshop_user_mode = ci_spec.get('workshopUserMode', 'none')
        if workshop_user_mode != 'none' and message_templates.get('user'):
            workshop_annotations[f'{Babylon.demo_domain}/user-message-template'] = json.dumps(message_templates['user'])

        # --- Workshop spec ---
        workshop_spec = {
            'multiuserServices': workshop_user_mode != 'none',
            'openRegistration': True,
            'lifespan': {},
            'actionSchedule': {},
        }
        if self.start_date:
            workshop_spec['lifespan']['start'] = self.start_date
            workshop_spec['actionSchedule']['start'] = self.start_date
        if self.end_date:
            workshop_spec['lifespan']['end'] = self.end_date
            workshop_spec['actionSchedule']['stop'] = self.end_date
        if self.ready_by_date:
            workshop_spec['lifespan']['readyBy'] = self.ready_by_date

        lifespan_spec = ci_spec.get('lifespan', {})
        if lifespan_spec.get('maximum'):
            workshop_spec['lifespan']['maximum'] = lifespan_spec['maximum']
        if lifespan_spec.get('relativeMaximum'):
            workshop_spec['lifespan']['relativeMaximum'] = lifespan_spec['relativeMaximum']

        if ci_spec.get('workshopLabUiRedirect'):
            workshop_spec['labUserInterface'] = {'redirect': True}

        ws_display = asset_display_name or f"{self.display_name} - {asset_key}"
        if ws_display:
            workshop_spec['displayName'] = ws_display
        if asset_description:
            workshop_spec['description'] = asset_description

        workshop_definition = {
            'apiVersion': f'{Babylon.babylon_domain}/{Babylon.babylon_api_version}',
            'kind': 'Workshop',
            'metadata': {
                'name': workshop_name,
                'namespace': self.namespace,
                'labels': workshop_labels,
                'annotations': workshop_annotations,
                'ownerReferences': [self.as_owner_ref()],
            },
            'spec': workshop_spec,
        }

        # Create Workshop (retry on 409 name conflict)
        workshop_def = None
        for attempt in range(3):
            try:
                workshop_def = await Babylon.custom_objects_api.create_namespaced_custom_object(
                    group=Babylon.babylon_domain,
                    namespace=self.namespace,
                    plural='workshops',
                    version=Babylon.babylon_api_version,
                    body=workshop_definition,
                )
                break
            except k8sApiException as e:
                if e.status == 409 and attempt < 2:
                    workshop_name = self.generate_k8s_name(base_workshop_name)
                    workshop_definition['metadata']['name'] = workshop_name
                else:
                    raise

        workshop_uid = workshop_def['metadata']['uid']
        workshop_name = workshop_def['metadata']['name']
        logger.info(f"Created Workshop {workshop_name} for asset {asset_key} in {self}")

        # --- WorkshopProvision ---
        provision_labels = {
            Babylon.catalog_item_name_label: ci_meta['name'],
            Babylon.catalog_item_namespace_label: ci_meta['namespace'],
            f'{Babylon.babylon_domain}/multiworkshop': self.name,
            f'{Babylon.babylon_domain}/asset-key': asset_key,
        }
        if asset_uuid:
            provision_labels[Babylon.asset_uuid_label] = asset_uuid

        provision_annotations = {
            f'{Babylon.babylon_domain}/category': ci_spec.get('category', ''),
            f'{Babylon.babylon_domain}/multiworkshop-source': self.name,
            f'{Babylon.babylon_domain}/multiworkshop-uid': self.uid,
            Babylon.resource_pool_annotation: 'disabled',
        }

        # Collect catalog item parameter defaults (mirrors CatalogItemFormReducer init)
        provision_parameters = {}
        for param in ci_spec.get('parameters', []):
            param_name = param.get('name')
            if not param_name or param_name in ('purpose', 'salesforce_id'):
                continue
            schema = param.get('openAPIV3Schema', {})
            default_value = schema.get('default') if 'default' in schema else param.get('value')
            if default_value is None:
                continue
            provision_parameters[param_name] = default_value

        if self.purpose:
            provision_parameters['purpose'] = self.purpose
        if self.purpose_activity:
            provision_parameters['purpose_activity'] = self.purpose_activity
        if self.salesforce_items:
            provision_parameters['salesforce_items'] = json.dumps(self.salesforce_items)

        provision_spec = {
            'catalogItem': {
                'name': ci_meta['name'],
                'namespace': ci_meta['namespace'],
            },
            'concurrency': 10,
            'count': self.number_seats,
            'parameters': provision_parameters,
            'startDelay': 10,
            'workshopName': workshop_name,
        }
        if self.start_date and self.end_date:
            provision_spec['lifespan'] = {
                'start': self.start_date,
                'end': self.end_date,
            }

        provision_definition = {
            'apiVersion': f'{Babylon.babylon_domain}/{Babylon.babylon_api_version}',
            'kind': 'WorkshopProvision',
            'metadata': {
                'name': workshop_name,
                'namespace': self.namespace,
                'labels': provision_labels,
                'annotations': provision_annotations,
                'ownerReferences': [{
                    'apiVersion': f'{Babylon.babylon_domain}/{Babylon.babylon_api_version}',
                    'controller': True,
                    'kind': 'Workshop',
                    'name': workshop_name,
                    'uid': workshop_uid,
                }],
            },
            'spec': provision_spec,
        }

        await Babylon.custom_objects_api.create_namespaced_custom_object(
            group=Babylon.babylon_domain,
            namespace=self.namespace,
            plural='workshopprovisions',
            version=Babylon.babylon_api_version,
            body=provision_definition,
        )
        logger.info(f"Created WorkshopProvision {workshop_name} for asset {asset_key} in {self}")

        return workshop_name

    async def sync_workshops_schedule(self, logger):
        """Sync auto-stop and auto-destroy dates from this MultiWorkshop to child
        workshops that have lock-enabled turned on.

        When lock-enabled is true, the workshop's lifespan and action schedule
        must stay in sync with the parent MultiWorkshop's startDate/endDate.
        """
        try:
            workshop_list = await Babylon.custom_objects_api.list_namespaced_custom_object(
                group=Babylon.babylon_domain,
                version=Babylon.babylon_api_version,
                namespace=self.namespace,
                plural='workshops',
                label_selector=f"{Babylon.babylon_domain}/multiworkshop={self.name}",
            )
        except Exception as e:
            logger.warning(f"Failed to list workshops for schedule sync on {self}: {e}")
            return

        for item in workshop_list.get('items', []):
            ws_labels = item.get('metadata', {}).get('labels', {})
            lock_enabled = ws_labels.get(f'{Babylon.demo_domain}/lock-enabled', 'false')
            if lock_enabled != 'true':
                continue

            ws_name = item['metadata']['name']
            ws_spec = item.get('spec', {})
            ws_lifespan = ws_spec.get('lifespan', {})
            ws_action_schedule = ws_spec.get('actionSchedule', {})

            patch_spec = {}

            if self.start_date:
                if ws_lifespan.get('start') != self.start_date:
                    patch_spec.setdefault('lifespan', {})['start'] = self.start_date
                if ws_action_schedule.get('start') != self.start_date:
                    patch_spec.setdefault('actionSchedule', {})['start'] = self.start_date
            if self.end_date:
                if ws_lifespan.get('end') != self.end_date:
                    patch_spec.setdefault('lifespan', {})['end'] = self.end_date
                if ws_action_schedule.get('stop') != self.end_date:
                    patch_spec.setdefault('actionSchedule', {})['stop'] = self.end_date

            if not patch_spec:
                continue

            try:
                await Babylon.custom_objects_api.patch_namespaced_custom_object(
                    group=Babylon.babylon_domain,
                    version=Babylon.babylon_api_version,
                    namespace=self.namespace,
                    plural='workshops',
                    name=ws_name,
                    body={'spec': patch_spec},
                    _content_type='application/merge-patch+json',
                )
                logger.info(
                    f"Synced schedule from {self} to locked Workshop {ws_name}: {patch_spec}"
                )
            except Exception as e:
                logger.error(
                    f"Failed to sync schedule to Workshop {ws_name} from {self}: {e}"
                )

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
                    asset_copy = asset.copy()
                    asset_copy['workshopId'] = workshop_id
                    updated_assets.append(asset_copy)
                    needs_update = True
                    logger.info(f"Found workshop ID {workshop_id} for MultiWorkshop {self.name} asset {asset['key']}")
                else:
                    updated_assets.append(asset)

            except Exception as e:
                logger.debug(f"Could not get workshop {workshop_name} for MultiWorkshop {self.name}: {e}")
                updated_assets.append(asset)

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
        """Handle MultiWorkshop creation — create workshops for each asset."""
        logger.info(f"MultiWorkshop {self.name} created")
        await self.create_workshops_for_assets(logger)
        await self.update_workshop_ids(logger)

    async def handle_update(self, logger):
        """Handle MultiWorkshop updates."""
        logger.debug(f"MultiWorkshop {self.name} updated")
        await self.sync_workshops_schedule(logger)

    async def handle_delete(self, logger):
        """Handle MultiWorkshop deletion."""
        logger.info(f"MultiWorkshop {self.name} deleted")

    @property
    def end_datetime(self):
        if not self.end_date:
            return None
        try:
            return datetime.strptime(self.end_date, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            return None

    async def manage(self, logger):
        """Periodic management tasks for MultiWorkshop."""
        await self.update_workshop_ids(logger)
        await self.sync_workshops_schedule(logger)
