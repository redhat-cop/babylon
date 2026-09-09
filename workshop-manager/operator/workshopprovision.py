import re
from datetime import datetime, timezone
from math import ceil

import kopf
from kubernetes_asyncio.client.exceptions import ApiException as k8sApiException
from pydantic.utils import deep_update
from strgen import StringGenerator

from babylon_async import BabylonApiException

import catalogitem
import resourceclaim
import resourceprovider
import workshop as workshop_import
from operatorruntime import OperatorRuntime
from cachedkopfobject import CachedKopfObject

LAB_KEY_GENERATOR = StringGenerator("[a-z0-9]{32}")

class WorkshopProvision(CachedKopfObject):
    api_group = OperatorRuntime.babylon_domain
    api_version = OperatorRuntime.babylon_api_version
    kind = 'WorkshopProvision'
    plural = 'workshopprovisions'

    cache = {}

    @classmethod
    def get_for_workshop(cls, workshop):
        return [
            workshop_provision
            for workshop_provision in cls.cache.values()
            if workshop_provision.workshop_namespace == workshop.namespace
            and workshop_provision.workshop_name == workshop.name
        ]

    @property
    def action_schedule_start(self):
        start_timestamp = self.action_schedule_start_timestamp
        if not start_timestamp:
            return None
        return datetime.strptime(start_timestamp, '%Y-%m-%dT%H:%M:%SZ').replace(
            tzinfo=timezone.utc
        )

    @property
    def action_schedule_start_timestamp(self):
        return self.spec.get('actionSchedule', {}).get('start')

    @property
    def action_schedule_stop(self):
        stop_timestamp = self.action_schedule_stop_timestamp
        if not stop_timestamp:
            return None
        return datetime.strptime(stop_timestamp, '%Y-%m-%dT%H:%M:%SZ').replace(
            tzinfo=timezone.utc
        )

    @property
    def action_schedule_stop_timestamp(self):
        return self.spec.get('actionSchedule', {}).get('stop')

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
    def has_tenant_cluster_pools(self) -> bool:
        return 'tenantClusterPools' in self.status

    @property
    def ignore(self):
        return OperatorRuntime.babylon_ignore_label in self.labels

    @property
    def lab_key(self) -> str|None:
        return self.status.get('labKey')

    @property
    def lifespan_end(self):
        end_timestamp = self.spec.get('lifespan', {}).get('end')
        if not end_timestamp:
            return None
        return datetime.strptime(end_timestamp, '%Y-%m-%dT%H:%M:%SZ').replace(
            tzinfo=timezone.utc
        )

    @property
    def lifespan_start(self):
        start_timestamp = self.spec.get('lifespan', {}).get('start')
        if not start_timestamp:
            return None
        return datetime.strptime(start_timestamp, '%Y-%m-%dT%H:%M:%SZ').replace(
            tzinfo=timezone.utc
        )

    @property
    def parameters(self):
        return self.spec.get('parameters', {})

    @property
    def resource_pool(self) -> str|None:
        return self.spec.get('resourcePool')

    @property
    def start_delay(self):
        return self.spec.get('startDelay', 10)

    @property
    def workshop_name(self):
        return self.spec.get('workshopName', self.labels.get(OperatorRuntime.workshop_label))

    @property
    def workshop_namespace(self):
        return self.namespace

    async def create_resource_claim(self, logger, workshop):
        logger.debug(
            f"Creating ResourceClaim for {self.name} in namespace {self.namespace}"
        )
        resource_provider = await resourceprovider.ResourceProvider.fetch(
            name=self.catalog_item_name,
            namespace=OperatorRuntime.poolboy_namespace,
        )
        try:
            catalog_item = await catalogitem.CatalogItem.fetch(
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
            "apiVersion": f"{OperatorRuntime.poolboy_domain}/{OperatorRuntime.poolboy_api_version}",
            "kind": "ResourceClaim",
            "metadata": {
                "annotations": {
                    OperatorRuntime.catalog_display_name_annotation: catalog_item.catalog_display_name,
                    OperatorRuntime.catalog_item_display_name_annotation: catalog_item.display_name,
                    OperatorRuntime.notifier_annotation: "disable",
                },
                "generateName": f"{catalog_item.name}-",
                "labels": {
                    OperatorRuntime.catalog_item_name_label: catalog_item.name,
                    OperatorRuntime.catalog_item_namespace_label: catalog_item.namespace,
                    OperatorRuntime.workshop_label: workshop.name,
                    OperatorRuntime.workshop_id_label: workshop.workshop_id,
                    OperatorRuntime.workshop_uid_label: workshop.uid,
                    OperatorRuntime.workshop_provision_label: self.name,
                },
                "namespace": f"{self.namespace}",
                "ownerReferences": [self.as_owner_ref()],
            },
            "spec": {
                "provider": {
                    "name": catalog_item.name,
                    "parameterValues": {
                        key: value
                        for key, value in self.parameters.items()
                        if resource_provider.has_parameter(key)
                    },
                }
            },
        }

        if self.auto_detach_condition:
            resource_claim_definition['spec']['autoDetach'] = {
                "when": self.auto_detach_condition
            }

        if self.resource_pool is not None:
            resource_claim_definition['metadata']['annotations'][
                OperatorRuntime.resource_pool_annotation
            ] = self.resource_pool

        if workshop.asset_uuid:
            resource_claim_definition['metadata']['labels'][
                OperatorRuntime.asset_uuid_label
            ] = workshop.asset_uuid

        if workshop.requester:
            resource_claim_definition['metadata']['annotations'][
                OperatorRuntime.requester_annotation
            ] = workshop.requester

        if workshop.ordered_by:
            resource_claim_definition['metadata']['annotations'][
                OperatorRuntime.ordered_by_annotation
            ] = workshop.ordered_by

        if workshop.white_gloved:
            resource_claim_definition['metadata']['labels'][
                OperatorRuntime.white_glove_label
            ] = workshop.white_gloved

        if catalog_item.lab_ui_type:
            resource_claim_definition['metadata']['labels'][OperatorRuntime.lab_ui_label] = (
                catalog_item.lab_ui_type
            )

        if self.action_schedule_start_timestamp:
            resource_claim_definition['spec']['provider']['parameterValues'][
                'start_timestamp'
            ] = self.action_schedule_start_timestamp

        if self.action_schedule_stop_timestamp:
            resource_claim_definition['spec']['provider']['parameterValues'][
                'stop_timestamp'
            ] = self.action_schedule_stop_timestamp

        for catalog_item_parameter in catalog_item.parameters:
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
                OperatorRuntime.purpose_annotation
            ] = self.parameters['purpose']

        if 'purpose_activity' in self.parameters:
            resource_claim_definition['metadata']['annotations'][
                OperatorRuntime.purpose_activity_annotation
            ] = self.parameters['purpose_activity']

        if 'salesforce_id' in self.parameters:
            resource_claim_definition['metadata']['annotations'][
                OperatorRuntime.salesforce_id_annotation
            ] = self.parameters['salesforce_id']

        if 'salesforce_items' in self.parameters:
            resource_claim_definition['metadata']['annotations'][
                OperatorRuntime.salesforce_items_annotation
            ] = self.parameters['salesforce_items']

        resource_claim = await resourceclaim.ResourceClaim.create(
            resource_claim_definition
        )

        if workshop.service_url:
            url_prefix = re.sub(r'^(https?://[^/]+).*', r'\1', workshop.service_url)
            await resource_claim.merge_patch(
                {
                    "metadata": {
                        "annotations": {
                            OperatorRuntime.url_annotation: f"{url_prefix}/services/{resource_claim.namespace}/{resource_claim.name}"
                        }
                    }
                }
            )

        logger.info(f"Created {resource_claim} for {self}")
        await workshop.add_resource_claim_to_status(resource_claim, logger=logger)
        return resource_claim

    async def __create_tenant_cluster_pools(self, logger) -> None:
        """Create any TenantClusterPools needed for this WorkshopProvision."""
        workshop = await self.get_workshop()
        try:
            catalog_item = await OperatorRuntime.babylon.get_catalog_item(
                name=self.catalog_item_name,
                namespace=self.catalog_item_namespace,
            )
        except BabylonApiException as exception:
            if exception.status == 404:
                logger.error(
                    "Unable to check if TenantClusterPools should be created for %s: "
                    "CatalogItem %s not found in namespace %s",
                    self, self.catalog_item_name,  self.catalog_item_namespace,
                )
            raise

        tenant_cluster_component_names = catalog_item.get_tenant_cluster_component_names()
        if len(tenant_cluster_component_names) == 0:
            return

        await self.__set_lab_key(logger=logger)

        for component_name in tenant_cluster_component_names:
            # Get reference TenantClusterPool definition from shared-clusters namespace
            try:
                shared_tenant_cluster_pool = await OperatorRuntime.babylon.get_tenant_cluster_pool(
                    name=component_name,
                    namespace="shared-clusters",
                )
            except BabylonApiException as exception:
                if exception.status == 404:
                    logger.error(
                        "Unable to create TenantClusterPool for %s, "
                        "Shared TenantClusterPool %s not found in shared-clusters",
                        self, component_name,
                    )
                raise

            # Clone reference definition
            definition = shared_tenant_cluster_pool.get_definition()

            # Discard dynamic fields
            definition['metadata'].pop('creationTimestamp', None)
            definition['metadata'].pop('finalizers', None)
            definition['metadata'].pop('generation', None)
            definition['metadata'].pop('managedFields', None)
            definition['metadata'].pop('resourceVersion', None)
            definition['metadata'].pop('uid', None)
            definition.pop('status', None)

            # Ask k8s to generate name based on WorkshopProvision name
            del definition['metadata']['name']
            definition['metadata']['generateName'] = f"{self.name}-"

            # Set namespace to match WorkshopProvision
            definition['metadata']['namespace'] = self.namespace

            # Set WorkshopProvision as owner to setup automatic deletion
            definition['metadata']['ownerReferences'] = [self.as_owner_ref()]

            # Set Workshop and WorkshopProvision labels
            definition['metadata']['labels'].update({
                OperatorRuntime.workshop_label: workshop.name,
                OperatorRuntime.workshop_id_label: workshop.workshop_id,
                OperatorRuntime.workshop_uid_label: workshop.uid,
                OperatorRuntime.workshop_provision_label: self.name,
            })

            # Add lab key to lab annotation
            sandbox_annotations = definition['spec']['sandboxHost']['annotations']
            sandbox_annotations['lab'] += f":{self.lab_key}"

            # Add sandbox annotations for Workshop and WorkshopProvision information
            sandbox_annotations['workshop_name'] = workshop.name
            sandbox_annotations['workshop_namespace'] = workshop.namespace
            sandbox_annotations['workshop_provision_name'] = self.name

            # Ensure TenantClusterPool is enabled
            definition['spec']['enabled'] = True

            # Set tenant cluster pool sizing
            cluster_count = ceil(
                self.count / shared_tenant_cluster_pool.sandbox_host.max_placements
            )
            definition['spec']['maxClusters'] = cluster_count
            definition['spec']['minAvailableSandboxPlacements'] = 0
            definition['spec']['minClusters'] = cluster_count

            tenant_cluster_pool = await OperatorRuntime.babylon.create_tenant_cluster_pool(definition)

            await self.merge_patch_status({
                "tenantClusterPools": self.status.get('tenantClusterPools', []) + [{
                    "name": tenant_cluster_pool.name,
                }]
            })

    async def delete_all_resource_claims(self, logger):
        logger.info(f"Deleting all ResourceClaims for {self}")
        async for resource_claim in self.list_resource_claims():
            logger.info(f"Deleting {resource_claim}")
            await resource_claim.delete()

    async def get_workshop(self):
        return await workshop_import.Workshop.get(
            name=self.workshop_name, namespace=self.namespace
        )

    async def handle_create(self, logger):
        async with self.lock:
            await self.set_owner_references(logger=logger)
            await self.__create_tenant_cluster_pools(logger=logger)

    async def handle_delete(self, logger):
        try:
            workshop = await self.get_workshop()
            await workshop.remove_workshop_provision_from_status(self, logger=logger)
        except k8sApiException as exception:
            if exception.status != 404:
                logger.exception(
                    "Failed to remove from workshop %s status while handling delete for %s",
                    self.workshop_name,
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
        async for resource_claim in resourceclaim.ResourceClaim.list(
            label_selector=f"{OperatorRuntime.workshop_label}={self.workshop_name},"
            f"{OperatorRuntime.workshop_provision_label}={self.name}",
            namespace=self.namespace,
        ):
            # Ignore ResourceClaims that are being deleted (have deletionTimestamp)
            if resource_claim.deletion_timestamp is not None:
                continue
            yield resource_claim

    async def manage(self, logger):
        try:
            workshop = await self.get_workshop()
        except k8sApiException as exception:
            if exception.status == 404:
                raise kopf.TemporaryError(
                    "Workshop {self.workshop_name} was not found.", delay=60
                )
            raise

        await workshop.add_workshop_provision_to_status(self, logger=logger)

        if not workshop.workshop_id:
            logger.info(f"Waiting for workshop id assignment for {workshop}")
            return

        async with self.lock:
            await self.manage_action_schedule_and_lifespan(
                logger=logger, workshop=workshop
            )
            tenant_cluster_pool_capacity = await self.__manage_tenant_cluster_pools(
                logger=logger,
            )
            await self.manage_resource_claims(
                logger=logger,
                tenant_cluster_pool_capacity=tenant_cluster_pool_capacity,
                workshop=workshop,
            )

    async def manage_action_schedule_and_lifespan(self, logger, workshop):
        patch = {}

        if (
            workshop.action_schedule_start
            and workshop.action_schedule_start != self.action_schedule_start
        ):
            patch = deep_update(
                patch,
                {
                    "spec": {
                        "actionSchedule": {
                            "start": workshop.action_schedule_start.strftime('%FT%TZ')
                        }
                    }
                },
            )

        if (
            workshop.action_schedule_stop
            and workshop.action_schedule_stop != self.action_schedule_stop
        ):
            patch = deep_update(
                patch,
                {
                    "spec": {
                        "actionSchedule": {
                            "stop": workshop.action_schedule_stop.strftime('%FT%TZ')
                        }
                    }
                },
            )

        if workshop.lifespan_end and workshop.lifespan_end != self.lifespan_end:
            patch = deep_update(
                patch,
                {
                    "spec": {
                        "lifespan": {"end": workshop.lifespan_end.strftime('%FT%TZ')}
                    }
                },
            )

        if workshop.lifespan_start and workshop.lifespan_start != self.lifespan_start:
            patch = deep_update(
                patch,
                {
                    "spec": {
                        "lifespan": {
                            "start": workshop.lifespan_start.strftime('%FT%TZ')
                        }
                    }
                },
            )

        if patch:
            await self.merge_patch(patch)

    async def manage_resource_claims(self,
        logger,
        tenant_cluster_pool_capacity: int,
        workshop,
    ):
        logger.debug(f"Manage ResourceClaims for {self}")

        resource_claim_count = 0
        provisioning_count = 0
        failed_count = 0
        active_count = 0
        detached_count = 0

        async for resource_claim in self.list_resource_claims():
            resource_claim_count += 1
            await resource_claim.adjust_action_schedule_and_lifetime(
                lifespan_end=self.lifespan_end,
                logger=logger,
                start_datetime=self.action_schedule_start,
                stop_datetime=self.action_schedule_stop,
            )
            if resource_claim.provision_complete:
                if resource_claim.is_failed:
                    failed_count += 1
                else:
                    active_count += 1
            else:
                provisioning_count += 1
            if resource_claim.is_detached:
                detached_count += 1

        # Store counts in WorkshopProvision status
        # We don't know how many failed resourceclaims were deleted, so can't
        # accurately count retries
        await self.merge_patch_status(
            {
                "resourceClaimCount": resource_claim_count,
                "failedCount": failed_count,
                "retryCount": failed_count,
                "activeCount": active_count,
                "provisioningCount": provisioning_count,
            }
        )

        # Do not start any provisions if lifespan start is in the future
        if self.lifespan_start and self.lifespan_start > datetime.now(timezone.utc):
            return

        # Do not start any provisions if failure threshold is exceeded
        if self.count != 0:
            if (
                OperatorRuntime.workshop_fail_percentage_threshold
                <= failed_count / self.count * 100
            ):
                return

        # Check TenantClusterPool capacity
        if (
            self.has_tenant_cluster_pools and
            tenant_cluster_pool_capacity <= resource_claim_count - detached_count
        ):
            return

        # Start provisions up to count and within concurrency limit
        if (
            resource_claim_count < (self.count + failed_count)
            and provisioning_count < self.concurrency
        ):
            await self.create_resource_claim(logger=logger, workshop=workshop)

    async def __set_lab_key(self, logger):
        """Set secure lab key in status.
        This value is used for associating TenantClusterPools with the WorkshopProvision."""
        if self.status and 'labKey' in self.status:
            return
        await self.merge_patch_status({
            "labKey": LAB_KEY_GENERATOR.render()
        })

    async def set_owner_references(self, logger):
        try:
            workshop = await self.get_workshop()
        except k8sApiException as exception:
            if exception.status == 404:
                raise kopf.TemporaryError(
                    "Workshop {self.workshop_name} was not found.", delay=60
                )
            raise

        if (
            self.owner_references != [workshop.as_owner_ref()]
            or self.labels.get(OperatorRuntime.workshop_label) != self.workshop_name
        ):
            logger.info(f"Setting ownerReferences for {self} to {workshop}")
            await self.merge_patch(
                {
                    "metadata": {
                        "labels": {OperatorRuntime.workshop_label: self.workshop_name},
                        "ownerReferences": [workshop.as_owner_ref()],
                    }
                }
            )

    async def __manage_tenant_cluster_pools(self, logger) -> int:
        """Manage scaling of tenant cluster pools and return available capacity."""
        if not self.has_tenant_cluster_pools:
            return 0

        overall_capacity = None
        for entry in self.status['tenantClusterPools']:
            try:
                tenant_cluster_pool = await OperatorRuntime.babylon.get_tenant_cluster_pool(
                    name=entry['name'],
                    namespace=self.namespace,
                )
            except BabylonApiException:
                logger.exception(
                    "Failed to get TenantClusterPool %s for %s",
                    entry['name'], self,
                )
                continue

            # Scale up TenantClusterPool if needed
            cluster_count = ceil(self.count / tenant_cluster_pool.sandbox_host.max_placements)
            if (
                tenant_cluster_pool.min_clusters < cluster_count or
                tenant_cluster_pool.max_clusters < cluster_count
            ):
                logger.info("Scaling %s to %s clusters", tenant_cluster_pool, cluster_count)
                await tenant_cluster_pool.patch({
                    "spec": {
                        "maxClusters": cluster_count,
                        "minClusters": cluster_count,
                    }
                })

            # Super simple capacity logic!
            # Just loop over clusters and status and add max_placements capacity if available.
            # Actually checking the sandbox api would produce race conditions and is unnecessarily
            # complicated because the TenantClusterPool is dedicated to this WorkshopProvision.
            capacity = 0
            for cluster in tenant_cluster_pool.status.clusters:
                if cluster.sandbox_api_state == 'available':
                    capacity += tenant_cluster_pool.sandbox_host.max_placements

            # Probably WorkshopProvisions will only have a single TenantClusterPool, so this
            # may never come up, but if there are multiple then this would mean that each
            # tenant spans two TenantClusterPools and so all must have capacity to provision
            # tenants.
            if overall_capacity is None or capacity < overall_capacity:
                overall_capacity = capacity

        return overall_capacity or 0
