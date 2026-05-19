import re
from datetime import datetime, timedelta, timezone

import kopf
from kubernetes_asyncio.client.exceptions import ApiException as k8sApiException

import catalogitem
import resourceclaim
import resourceprovider
import selfpacedlab as selfpacedlab_import
from babylon import Babylon
from cachedkopfobject import CachedKopfObject


def parse_duration(duration_str):
    """Parse a duration string like '24h', '2d', '30m', '3600s' into a timedelta."""
    match = re.match(r'^(\d+)([dhms])$', duration_str)
    if not match:
        raise ValueError(f"Invalid duration format: {duration_str}")
    value = int(match.group(1))
    unit = match.group(2)
    if unit == 'd':
        return timedelta(days=value)
    elif unit == 'h':
        return timedelta(hours=value)
    elif unit == 'm':
        return timedelta(minutes=value)
    elif unit == 's':
        return timedelta(seconds=value)


class SelfPacedLabItem(CachedKopfObject):
    api_group = Babylon.babylon_domain
    api_version = Babylon.babylon_api_version
    kind = 'SelfPacedLabItem'
    plural = 'selfpacedlabitems'

    cache = {}

    @classmethod
    def get_for_selfpacedlab(cls, lab):
        return [
            item
            for item in cls.cache.values()
            if item.selfpacedlab_namespace == lab.namespace
            and item.selfpacedlab_name == lab.name
        ]

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
        return self.spec.get('concurrency', self.pool_size)

    @property
    def pool_size(self):
        return self.spec.get('poolSize', 1)

    @property
    def ignore(self):
        return Babylon.babylon_ignore_label in self.labels

    @property
    def parameters(self):
        return self.spec.get('parameters', {})

    @property
    def selfpacedlab_name(self):
        return self.spec.get('selfPacedLabName', self.labels.get(Babylon.selfpacedlab_label))

    @property
    def selfpacedlab_namespace(self):
        return self.namespace

    @property
    def start_delay(self):
        return self.spec.get('startDelay', 10)

    @property
    def assigned_lifespan(self):
        return self.spec.get('assignedLifespan')

    @property
    def assigned_lifespan_delta(self):
        if self.assigned_lifespan:
            return parse_duration(self.assigned_lifespan)
        return None

    @property
    def unassigned_lifespan(self):
        return self.spec.get('unassignedLifespan', '24h')

    @property
    def unassigned_lifespan_delta(self):
        return parse_duration(self.unassigned_lifespan)

    async def create_resource_claim(self, logger, lab):
        logger.debug(
            f"Creating ResourceClaim for {self.name} in namespace {self.namespace}"
        )
        resource_provider_obj = await resourceprovider.ResourceProvider.fetch(
            name=self.catalog_item_name,
            namespace=Babylon.poolboy_namespace,
        )
        try:
            catalog_item_obj = await catalogitem.CatalogItem.fetch(
                name=self.catalog_item_name,
                namespace=self.catalog_item_namespace,
            )
        except k8sApiException as exception:
            if exception.status == 404:
                raise kopf.TemporaryError(
                    f"CatalogItem {self.catalog_item_name} was not found in namespace {self.catalog_item_namespace}.",
                    delay=60,
                )
            raise

        resource_claim_definition = {
            "apiVersion": f"{Babylon.poolboy_domain}/{Babylon.poolboy_api_version}",
            "kind": "ResourceClaim",
            "metadata": {
                "annotations": {
                    Babylon.catalog_display_name_annotation: catalog_item_obj.catalog_display_name,
                    Babylon.catalog_item_display_name_annotation: catalog_item_obj.display_name,
                    Babylon.notifier_annotation: "disable",
                },
                "generateName": f"{catalog_item_obj.name}-",
                "labels": {
                    Babylon.catalog_item_name_label: catalog_item_obj.name,
                    Babylon.catalog_item_namespace_label: catalog_item_obj.namespace,
                    Babylon.selfpacedlab_label: lab.name,
                    Babylon.selfpacedlab_id_label: lab.selfpacedlab_id,
                    Babylon.selfpacedlab_uid_label: lab.uid,
                    Babylon.selfpacedlab_item_label: self.name,
                },
                "namespace": f"{self.namespace}",
                "ownerReferences": [self.as_owner_ref()],
            },
            "spec": {
                "provider": {
                    "name": catalog_item_obj.name,
                    "parameterValues": {
                        key: value
                        for key, value in self.parameters.items()
                        if resource_provider_obj.has_parameter(key)
                    },
                }
            },
        }

        if self.auto_detach_condition:
            resource_claim_definition['spec']['autoDetach'] = {
                "when": self.auto_detach_condition
            }

        # SelfPacedLab manages its own warm pool; disable Poolboy ResourcePool
        resource_claim_definition['metadata']['annotations'][
            Babylon.resource_pool_annotation
        ] = 'disabled'

        if lab.asset_uuid:
            resource_claim_definition['metadata']['labels'][
                Babylon.asset_uuid_label
            ] = lab.asset_uuid

        if lab.requester:
            resource_claim_definition['metadata']['annotations'][
                Babylon.requester_annotation
            ] = lab.requester

        if lab.ordered_by:
            resource_claim_definition['metadata']['annotations'][
                Babylon.ordered_by_annotation
            ] = lab.ordered_by

        if lab.white_gloved:
            resource_claim_definition['metadata']['labels'][
                Babylon.white_glove_label
            ] = lab.white_gloved

        if catalog_item_obj.lab_ui_type:
            resource_claim_definition['metadata']['labels'][Babylon.lab_ui_label] = (
                catalog_item_obj.lab_ui_type
            )

        for catalog_item_parameter in catalog_item_obj.parameters:
            value = (
                self.parameters[catalog_item_parameter.name]
                if catalog_item_parameter.name in self.parameters
                else catalog_item_parameter.default
            )
            if value is None and not catalog_item_parameter.required:
                continue
            if catalog_item_parameter.annotation:
                resource_claim_definition['metadata']['annotations'][
                    catalog_item_parameter.annotation
                ] = str(value)

        if 'purpose' in self.parameters:
            resource_claim_definition['metadata']['annotations'][
                Babylon.purpose_annotation
            ] = self.parameters['purpose']

        if 'purpose_activity' in self.parameters:
            resource_claim_definition['metadata']['annotations'][
                Babylon.purpose_activity_annotation
            ] = self.parameters['purpose_activity']

        if 'salesforce_id' in self.parameters:
            resource_claim_definition['metadata']['annotations'][
                Babylon.salesforce_id_annotation
            ] = self.parameters['salesforce_id']

        if 'salesforce_items' in self.parameters:
            resource_claim_definition['metadata']['annotations'][
                Babylon.salesforce_items_annotation
            ] = self.parameters['salesforce_items']

        resource_claim_obj = await resourceclaim.ResourceClaim.create(
            resource_claim_definition
        )

        if lab.service_url:
            url_prefix = re.sub(r'^(https?://[^/]+).*', r'\1', lab.service_url)
            await resource_claim_obj.merge_patch(
                {
                    "metadata": {
                        "annotations": {
                            Babylon.url_annotation: f"{url_prefix}/services/{resource_claim_obj.namespace}/{resource_claim_obj.name}"
                        }
                    }
                }
            )

        logger.info(f"Created {resource_claim_obj} for {self}")
        await lab.add_resource_claim_to_status(resource_claim_obj, logger=logger)
        return resource_claim_obj

    async def delete_all_resource_claims(self, logger):
        logger.info(f"Deleting all ResourceClaims for {self}")
        async for resource_claim_obj in self.list_resource_claims():
            logger.info(f"Deleting {resource_claim_obj}")
            await resource_claim_obj.delete()

    async def get_selfpacedlab(self):
        return await selfpacedlab_import.SelfPacedLab.get(
            name=self.selfpacedlab_name, namespace=self.namespace
        )

    async def handle_create(self, logger):
        async with self.lock:
            await self.set_owner_references(logger=logger)

    async def handle_delete(self, logger):
        try:
            lab = await self.get_selfpacedlab()
            await lab.remove_selfpacedlab_item_from_status(self, logger=logger)
        except k8sApiException as exception:
            if exception.status != 404:
                logger.exception(
                    "Failed to remove from selfpacedlab %s status while handling delete for %s",
                    self.selfpacedlab_name,
                    self,
                )
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
        async for resource_claim_obj in resourceclaim.ResourceClaim.list(
            label_selector=f"{Babylon.selfpacedlab_label}={self.selfpacedlab_name},"
            f"{Babylon.selfpacedlab_item_label}={self.name}",
            namespace=self.namespace,
        ):
            if resource_claim_obj.deletion_timestamp is not None:
                continue
            yield resource_claim_obj

    async def manage(self, logger):
        try:
            lab = await self.get_selfpacedlab()
        except k8sApiException as exception:
            if exception.status == 404:
                raise kopf.TemporaryError(
                    f"SelfPacedLab {self.selfpacedlab_name} was not found.", delay=60
                )
            raise

        await lab.add_selfpacedlab_item_to_status(self, logger=logger)

        if not lab.selfpacedlab_id:
            logger.info(f"Waiting for selfpacedlab id assignment for {lab}")
            return

        async with self.lock:
            await self.manage_resource_claims(logger=logger, lab=lab)

    async def manage_resource_claims(self, logger, lab):
        logger.debug(f"Manage ResourceClaims for {self}")

        now = datetime.now(timezone.utc)
        unassigned_lifespan_delta = self.unassigned_lifespan_delta

        resource_claim_count = 0
        unclaimed_ready_count = 0
        provisioning_count = 0
        assigned_count = 0
        failed_count = 0
        recycled_count = self.status.get('recycledCount', 0)

        assigned_lifespan_delta = self.assigned_lifespan_delta

        async for resource_claim_obj in self.list_resource_claims():
            resource_claim_count += 1

            is_claimed = resource_claim_obj.labels.get(Babylon.selfpacedlab_claimed_label) == 'true'

            if is_claimed:
                # Enforce assigned (per-user session) lifespan
                if assigned_lifespan_delta:
                    claimed_at_str = resource_claim_obj.annotations.get(
                        Babylon.selfpacedlab_claimed_at_annotation
                    )
                    if claimed_at_str:
                        claimed_at = datetime.strptime(
                            claimed_at_str, '%Y-%m-%dT%H:%M:%SZ'
                        ).replace(tzinfo=timezone.utc)
                        if claimed_at + assigned_lifespan_delta < now:
                            logger.info(
                                f"Deleting {resource_claim_obj} - assigned lifespan expired "
                                f"(claimed at {claimed_at_str}, TTL {self.assigned_lifespan})"
                            )
                            await resource_claim_obj.delete()
                            await lab.remove_resource_claim_from_status(resource_claim_obj, logger=logger)
                            continue
                assigned_count += 1
                continue

            if not resource_claim_obj.provision_complete:
                if resource_claim_obj.is_failed:
                    failed_count += 1
                else:
                    provisioning_count += 1
                continue

            if resource_claim_obj.is_failed:
                failed_count += 1
                continue

            # Check unassigned lifespan TTL
            if resource_claim_obj.creation_datetime + unassigned_lifespan_delta < now:
                logger.info(
                    f"Recycling {resource_claim_obj} - unassigned lifespan expired "
                    f"(created {resource_claim_obj.creation_timestamp}, TTL {self.unassigned_lifespan})"
                )
                await resource_claim_obj.delete()
                await lab.remove_resource_claim_from_status(resource_claim_obj, logger=logger)
                recycled_count += 1
                continue

            unclaimed_ready_count += 1

        await self.merge_patch_status(
            {
                "resourceClaimCount": resource_claim_count,
                "readyCount": unclaimed_ready_count,
                "provisioningCount": provisioning_count,
                "assignedCount": assigned_count,
                "failedCount": failed_count,
                "recycledCount": recycled_count,
            }
        )

        # Do not provision if lifespan start is in the future
        if lab.lifespan_start and lab.lifespan_start > now:
            return

        # Do not provision if failure threshold is exceeded
        total_attempted = unclaimed_ready_count + provisioning_count + assigned_count + failed_count
        if total_attempted > 0:
            if (
                Babylon.selfpacedlab_fail_percentage_threshold
                <= failed_count / total_attempted * 100
            ):
                logger.warning(
                    f"Failure threshold exceeded for {self}: "
                    f"{failed_count}/{total_attempted} failed"
                )
                return

        # Replenish pool: ensure unclaimed_ready + provisioning >= pool_size
        while (
            unclaimed_ready_count + provisioning_count < self.pool_size
            and provisioning_count < self.concurrency
        ):
            await self.create_resource_claim(logger=logger, lab=lab)
            provisioning_count += 1

    async def set_owner_references(self, logger):
        try:
            lab = await self.get_selfpacedlab()
        except k8sApiException as exception:
            if exception.status == 404:
                raise kopf.TemporaryError(
                    f"SelfPacedLab {self.selfpacedlab_name} was not found.", delay=60
                )
            raise

        if (
            self.owner_references != [lab.as_owner_ref()]
            or self.labels.get(Babylon.selfpacedlab_label) != self.selfpacedlab_name
        ):
            logger.info(f"Setting ownerReferences for {self} to {lab}")
            await self.merge_patch(
                {
                    "metadata": {
                        "labels": {Babylon.selfpacedlab_label: self.selfpacedlab_name},
                        "ownerReferences": [lab.as_owner_ref()],
                    }
                }
            )
