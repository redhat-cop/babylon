import re

from copy import deepcopy
from datetime import datetime, timezone
from pydantic.utils import deep_update

import kopf
import kubernetes_asyncio

from babylon import Babylon
from cachedkopfobject import CachedKopfObject

import catalogitem
import resourceclaim
import workshop as workshop_import

class WorkshopProvision(CachedKopfObject):
    api_group = Babylon.babylon_domain
    api_version = Babylon.babylon_api_version
    kind = 'WorkshopProvision'
    plural = 'workshopprovisions'

    cache = {}

    @classmethod
    def get_for_workshop(cls, workshop):
        return [
            workshop_provision for workshop_provision in cls.cache.values()
            if workshop_provision.workshop_namespace == workshop.namespace
            and workshop_provision.workshop_name == workshop.name
        ]

    @property
    def action_schedule_start(self):
        start_timestamp = self.spec.get('actionSchedule', {}).get('start')
        if not start_timestamp:
            return None
        return datetime.strptime(
            start_timestamp, '%Y-%m-%dT%H:%M:%SZ'
        ).replace(tzinfo=timezone.utc)

    @property
    def action_schedule_stop(self):
        stop_timestamp = self.spec.get('actionSchedule', {}).get('stop')
        if not stop_timestamp:
            return None
        return datetime.strptime(
            stop_timestamp, '%Y-%m-%dT%H:%M:%SZ'
        ).replace(tzinfo=timezone.utc)
    
    @property
    def auto_detach_condition(self):
        return self.spec.get('autoDetach', {}).get('when')

    @property
    def catalog_item_name(self):
        return self.spec['catalogItem']['name']

    @property
    def catalog_item_namespace(self):
        return self.spec['catalogItem']['namespace']

    @property
    def concurrency(self):
        return self.spec.get('concurrency', self.count)

    @property
    def count(self):
        return self.spec.get('count', 0)

    @property
    def enable_resource_pools(self):
        return self.spec.get('enableResourcePools', False)

    @property
    def ignore(self):
        return Babylon.babylon_ignore_label in self.labels

    @property
    def lifespan_end(self):
        end_timestamp = self.spec.get('lifespan', {}).get('end')
        if not end_timestamp:
            return None
        return datetime.strptime(
            end_timestamp, '%Y-%m-%dT%H:%M:%SZ'
        ).replace(tzinfo=timezone.utc)

    @property
    def lifespan_start(self):
        start_timestamp = self.spec.get('lifespan', {}).get('start')
        if not start_timestamp:
            return None
        return datetime.strptime(
            start_timestamp, '%Y-%m-%dT%H:%M:%SZ'
        ).replace(tzinfo=timezone.utc)

    @property
    def parameters(self):
        return self.spec.get('parameters', {})

    @property
    def start_delay(self):
        return self.spec.get('startDelay', 10)

    @property
    def workshop_name(self):
        return self.spec.get('workshopName', self.labels.get(Babylon.workshop_label))

    @property
    def workshop_namespace(self):
        return self.namespace

    async def create_resource_claim(self, logger, workshop):
        logger.debug(f"Creating ResourceClaim for {self.name} in namespace {self.namespace}")
        try:
            catalog_item = await catalogitem.CatalogItem.fetch(
                name = self.catalog_item_name,
                namespace = self.catalog_item_namespace,
            )
        except kubernetes_asyncio.client.rest.ApiException as exception:
            if exception.status == 404:
                raise kopf.TemporaryError(
                    f"CatalogItem {self.catalog_item_name} was not found in namespace {self.catalog_item_namespace}.",
                    delay=60
                )
            raise

        resource_claim_definition = {
            "apiVersion": f"{Babylon.poolboy_domain}/{Babylon.poolboy_api_version}",
            "kind": "ResourceClaim",
            "metadata": {
                "annotations": {
                    Babylon.catalog_display_name_annotation: catalog_item.catalog_display_name,
                    Babylon.catalog_item_display_name_annotation: catalog_item.display_name,
                    Babylon.notifier_annotation: "disable",
                },
                "generateName": f"{catalog_item.name}-",
                "labels": {
                    Babylon.catalog_item_name_label: catalog_item.name,
                    Babylon.catalog_item_namespace_label: catalog_item.namespace,
                    Babylon.workshop_label: workshop.name,
                    Babylon.workshop_id_label: workshop.workshop_id,
                    Babylon.workshop_uid_label: workshop.uid,
                    Babylon.workshop_provision_label: self.name,
                },
                "namespace": f"{self.namespace}",
                "ownerReferences": [self.as_owner_ref()],
            },
            "spec": {
                "resources": deepcopy(catalog_item.resources)
            }
        }

        if self.auto_detach_condition:
            resource_claim_definition['spec']['autoDetach'] = {"when": self.auto_detach_condition}

        if not self.enable_resource_pools:
            resource_claim_definition['metadata']['annotations'][Babylon.resource_pool_annotation] = "disable"

        if workshop.requester:
            resource_claim_definition['metadata']['annotations'][Babylon.requester_annotation] = workshop.requester

        if catalog_item.lab_ui_type:
            resource_claim_definition['metadata']['labels'][Babylon.lab_ui_label] = catalog_item.lab_ui_type

        for catalog_item_parameter in catalog_item.parameters:
            value = self.parameters[catalog_item_parameter.name] \
                if catalog_item_parameter.name in self.parameters else catalog_item_parameter.default
            if value is None and not catalog_item_parameter.required:
                continue
            if catalog_item_parameter.annotation:
                resource_claim_definition['metadata']['annotations'][catalog_item_parameter.annotation] = str(value)
            if catalog_item_parameter.variable:
                for resource_index in catalog_item_parameter.resource_indexes:
                    resource_claim_definition['spec']['resources'][resource_index] = deep_update(
                        resource_claim_definition['spec']['resources'][resource_index],
                        {'template': {'spec': {'vars': {'job_vars': {catalog_item_parameter.variable: value}}}}}
                    )

        if 'purpose' in self.parameters:
            resource_claim_definition['metadata']['annotations'][Babylon.purpose_annotation] = self.parameters.get('purpose')

        if 'purpose_activity' in self.parameters:
            resource_claim_definition['metadata']['annotations'][Babylon.purpose_activity_annotation] = self.parameters.get('purpose_activity')

        if 'salesforce_id' in self.parameters:
            resource_claim_definition['metadata']['annotations'][Babylon.salesforce_id_annotation] = self.parameters.get('salesforce_id')

        resource_claim = await resourceclaim.ResourceClaim.create(resource_claim_definition)

        if workshop.service_url:
            url_prefix = re.sub(r'^(https?://[^/]+).*', r'\1', workshop.service_url)
            await resource_claim.merge_patch({
                "metadata": {
                    "annotations": {
                        Babylon.url_annotation: f"{url_prefix}/services/{resource_claim.namespace}/{resource_claim.name}"
                    }
                }
            })

        logger.info(f"Created {resource_claim} for {self}")
        return resource_claim

    async def delete_all_resource_claims(self, logger):
        logger.info(f"Deleting all ResourceClaims for {self}")
        async for resource_claim in self.list_resource_claims():
            logger.info(f"Deleting {resource_claim}")
            await resource_claim.delete()

    async def get_workshop(self):
        return await workshop_import.Workshop.get(name=self.workshop_name, namespace=self.namespace)

    async def handle_create(self, logger):
        async with self.lock:
            await self.set_owner_references(logger=logger)

    async def handle_delete(self, logger):
        async with self.lock:
            logger.info(f"Handling delete for {self}")
            await self.delete_all_resource_claims(logger=logger)

    async def handle_resume(self, logger):
        async with self.lock:
            logger.info(f"Handling resume for {self}")
            await self.set_owner_references(logger=logger)

    async def handle_update(self, logger):
        async with self.lock:
            await self.set_owner_references(logger=logger)
        await self.manage(logger=logger)

    async def list_resource_claims(self):
        async for resource_claim in resourceclaim.ResourceClaim.list(
            label_selector =
                f"{Babylon.workshop_label}={self.workshop_name},"
                f"{Babylon.workshop_provision_label}={self.name}",
            namespace = self.namespace,
        ):
            yield resource_claim

    async def manage(self, logger):
        try:
            workshop = await self.get_workshop()
        except kubernetes_asyncio.client.rest.ApiException as exception:
            if exception.status == 404:
                raise kopf.TemporaryError("Workshop {self.workshop_name} was not found.", delay=60)
            raise

        if not workshop.workshop_id:
            logger.info(f"Waiting for workshop id assignment for {workshop}")
            return

        async with self.lock:
            await self.manage_action_schedule_and_lifespan(logger=logger, workshop=workshop)
            await self.manage_resource_claims(logger=logger, workshop=workshop)

    async def manage_action_schedule_and_lifespan(self, logger, workshop):
        patch = {}

        if workshop.action_schedule_start \
        and workshop.action_schedule_start != self.action_schedule_start:
            patch = deep_update(patch, {
                "spec": {
                    "actionSchedule": {
                        "start": workshop.action_schedule_start.strftime('%FT%TZ')
                    }
                }
            })

        if workshop.action_schedule_stop \
        and workshop.action_schedule_stop != self.action_schedule_stop:
            patch = deep_update(patch, {
                "spec": {
                    "actionSchedule": {
                        "stop": workshop.action_schedule_stop.strftime('%FT%TZ')
                    }
                }
            })

        if workshop.lifespan_end and workshop.lifespan_end != self.lifespan_end:
            patch = deep_update(patch, {
                "spec": {
                    "lifespan": {
                        "end": workshop.lifespan_end.strftime('%FT%TZ')
                    }
                }
            })

        if workshop.lifespan_start and workshop.lifespan_start != self.lifespan_start:
            patch = deep_update(patch, {
                "spec": {
                    "lifespan": {
                        "start": workshop.lifespan_start.strftime('%FT%TZ')
                    }
                }
            })

        if patch:
            await self.merge_patch(patch)

    async def manage_resource_claims(self, logger, workshop):
        logger.debug(f"Manage ResourceClaims for {self}")

        resource_claim_count = 0
        provisioning_count = 0
        failed_count = 0

        async for resource_claim in self.list_resource_claims():
            resource_claim_count += 1
            await resource_claim.adjust_action_schedule_and_lifetime(
                lifespan_end = self.lifespan_end,
                logger = logger,
                start_datetime = self.action_schedule_start,
                stop_datetime = self.action_schedule_stop,
            )
            if not resource_claim.provision_complete:
                provisioning_count += 1

            if resource_claim.is_failed:
                failed_count += 1

            await workshop.update_provision_count(
                provisioning=provisioning_count,
                failed=failed_count,
                completed=resource_claim_count - provisioning_count - failed_count
            )

        # Do not start any provisions if lifespan start is in the future
        if self.lifespan_start and self.lifespan_start > datetime.now(timezone.utc):
            return

        # Do not start any provisions if failure threshold is exceeded
        if self.count != 0:
            if Babylon.workshop_fail_percentage_threshold <= failed_count / self.count * 100:
                return

        # Start provisions up to count and within concurrency limit
        if resource_claim_count < (self.count + failed_count) and provisioning_count < self.concurrency:
            await self.create_resource_claim(logger=logger, workshop=workshop)

    async def set_owner_references(self, logger):
        try:
            workshop = await self.get_workshop()
        except kubernetes_asyncio.client.rest.ApiException as exception:
            if exception.status == 404:
                raise kopf.TemporaryError("Workshop {self.workshop_name} was not found.", delay=60)
            raise

        if self.owner_references != [workshop.as_owner_ref()] \
        or self.labels.get(Babylon.workshop_label) != self.workshop_name:
            logger.info(f"Setting ownerReferences for {self} to {workshop}")
            await self.merge_patch({
                "metadata": {
                    "labels": { Babylon.workshop_label: self.workshop_name },
                    "ownerReferences": [workshop.as_owner_ref()],
                }
            })
