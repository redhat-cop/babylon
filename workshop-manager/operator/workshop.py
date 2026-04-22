import random

from datetime import datetime, timezone

from kubernetes_asyncio.client.exceptions import ApiException as k8sApiException
from kubernetes_asyncio.client.models import RbacV1Subject, V1ObjectMeta, V1PolicyRule, V1Role, V1RoleBinding, V1RoleRef
from pydantic.utils import deep_update

from babylon import Babylon
from cachedkopfobject import CachedKopfObject

import resourceclaim
import workshopprovision
import workshopuserassignment


class Workshop(CachedKopfObject):
    api_group = Babylon.babylon_domain
    api_version = Babylon.babylon_api_version
    kind = 'Workshop'
    plural = 'workshops'

    cache = {}

    @property
    def action_schedule_start(self):
        start_timestamp = self.spec.get('actionSchedule', {}).get('start')
        if not start_timestamp:
            return None
        return datetime.strptime(start_timestamp, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)

    @property
    def action_schedule_stop(self):
        stop_timestamp = self.spec.get('actionSchedule', {}).get('stop')
        if not stop_timestamp:
            return None
        return datetime.strptime(stop_timestamp, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)

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
        return datetime.strptime(
            start_timestamp, '%Y-%m-%dT%H:%M:%SZ'
        ).replace(tzinfo=timezone.utc)

    @property
    def lifespan_end(self):
        end_timestamp = self.spec.get('lifespan', {}).get('end')
        if not end_timestamp:
            return None
        return datetime.strptime(
            end_timestamp, '%Y-%m-%dT%H:%M:%SZ'
        ).replace(tzinfo=timezone.utc)

    @property
    def multiuser_services(self):
        return self.spec.get('multiuserServices', False)

    @property
    def ordered_by(self):
        return self.annotations.get(Babylon.ordered_by_annotation)

    @property
    def requester(self):
        return self.annotations.get(Babylon.requester_annotation)

    @property
    def resource_claim_names(self) -> list[str]:
        """Return names of ResourceClaim objects associated with this Workshop"""
        return list(self.status.get('resourceClaims', {}).keys())

    @property
    def service_url(self):
        return self.annotations.get(Babylon.url_annotation)

    @property
    def white_gloved(self):
        return self.labels.get(Babylon.white_glove_label)

    @property
    def workshop_provision_names(self) -> list[str]:
        """Return names of WorkshopProvision objects associated with this Workshop"""
        return list(self.status.get('workshopProvisions', {}).keys())

    @property
    def workshop_user_assignment_names(self) -> list[str]:
        """Return names of WorkshopUserAssignment objects associated with this Workshop"""
        return list(self.status.get('userAssignments', {}).keys())

    @property
    def seats_on_demand(self):
        return self.spec.get('seatsOnDemand')

    @property
    def seats_on_demand_enabled(self):
        return self.seats_on_demand is not None

    @property
    def seat_expiration(self):
        if not self.seats_on_demand:
            return None
        return self.seats_on_demand.get('seatExpiration')

    @property
    def seats_on_demand_resource_pool_config(self):
        if not self.seats_on_demand:
            return None
        return self.seats_on_demand.get('resourcePool', {})

    @property
    def seats_on_demand_resource_pool_name(self):
        config = self.seats_on_demand_resource_pool_config
        if not config:
            return None
        return config.get('name', f"{self.name}-pool")

    @property
    def workshop_id(self):
        return self.labels.get(Babylon.workshop_id_label)

    def get_workshop_provisions(self):
        return workshopprovision.WorkshopProvision.get_for_workshop(self)

    async def delete_all_resource_claims(self, logger):
        logger.info(f"Deleting all ResourceClaims for {self}")
        async for resource_claim in self.list_resource_claims():
            logger.info(f"Deleting {resource_claim}")
            await resource_claim.delete()

    async def delete_all_workshop_provisions(self, logger):
        logger.info(f"Deleting all WorkshopProvisions for {self}")
        for workshop_provision in self.get_workshop_provisions():
            logger.info(f"Deleting {workshop_provision}")
            await workshop_provision.delete()

    async def handle_create(self, logger):
        async with self.lock:
            logger.info(f"Handling create for {self}")
            await self.__manage_workshop_id_label(logger=logger)
            await self.manage_workshop_provisions(logger=logger)

    async def handle_delete(self, logger):
        async with self.lock:
            logger.info(f"Handling delete for {self}")
            await self.delete_all_workshop_provisions(logger=logger)
            await self.delete_all_resource_claims(logger=logger)

    async def handle_resume(self, logger):
        async with self.lock:
            logger.info(f"Handling resume for {self}")
            await self.__manage_workshop_id_label(logger=logger)
            await self.manage_workshop_provisions(logger=logger)
            await self.update_status()

    async def handle_update(self, logger):
        async with self.lock:
            logger.info(f"Handling update for {self}")
            await self.__manage_workshop_id_label(logger=logger)
            await self.manage_workshop_provisions(logger=logger)
            await self.update_status()

    async def list_resource_claims(self):
        async for resource_claim in resourceclaim.ResourceClaim.list(
            label_selector = f"{Babylon.workshop_label}={self.name}",
            namespace = self.namespace,
        ):
            yield resource_claim

    async def manage(self, logger):
        async with self.lock:
            await self.update_status()

    async def __delete_service_access(self, logger) -> None:
        """Delete service access role and role binding for this workshop."""
        await self.__delete_service_access_role(logger)
        await self.__delete_service_access_role_binding(logger)

    async def __delete_service_access_role(self, logger) -> None:
        """Delete service access role for this workshop."""
        try:
            await Babylon.rbac_authorization_api.delete_namespaced_role(self.name, self.namespace)
            logger.info("Deleted service access role for %s", self)
        except k8sApiException as exception:
            if exception.status != 404:
                logger.exception("Failed to delete service access role for %s", self)

    async def __delete_service_access_role_binding(self, logger) -> None:
        """Delete service access role binding for this workshop."""
        try:
            await Babylon.rbac_authorization_api.delete_namespaced_role_binding(self.name, self.namespace)
            logger.info("Deleted service access role binding for %s", self)
        except k8sApiException as exception:
            if exception.status != 404:
                logger.exception("Failed to delete service access role binding for %s", self)

    async def __manage_workshop_id_label(self, logger):
        """
        Generate a unique workshop id label for workshop to provide a short URL for access.
        """
        if self.workshop_id:
            return

        while True:
            workshop_id = ''.join(random.choice('23456789abcdefghjkmnpqrstuvwxyz') for i in range(6))
            # Check if id is in use
            workshop_list = [ workshop for workshop in self.cache.values() if workshop.workshop_id == workshop_id ]
            if not workshop_list:
                break

        await self.merge_patch({
            "metadata": {
                "labels": {
                    Babylon.workshop_id_label: workshop_id,
                }
            }
        })
        logger.info(f"Assigned workshop id {workshop_id} to {self}")
        return

    async def add_resource_claim_to_status(self, resource_claim, logger):
        if resource_claim.name in self.status.get('resourceClaims', {}):
            return
        await self.merge_patch_status({
            "resourceClaims": {
                resource_claim.name: {
                    "uid": resource_claim.uid
                }
            }
        })
        logger.info("Added %s to %s status", resource_claim, self)

    async def add_workshop_provision_to_status(self, workshop_provision, logger):
        if workshop_provision.name in self.status.get('workshopProvisions', {}):
            return
        await self.merge_patch_status({
            "workshopProvisions": {
                workshop_provision.name: {
                    "uid": workshop_provision.uid
                }
            }
        })
        logger.info("Added %s to %s status", workshop_provision, self)

    async def manage_workshop_provisions(self, logger):
        for workshop_provision in self.get_workshop_provisions():
            async with workshop_provision.lock:
                patch = {}
                if self.action_schedule_start \
                and self.action_schedule_start != workshop_provision.action_schedule_start:
                    patch = deep_update(patch, {
                        "spec": {"actionSchedule": {"start": self.action_schedule_start.strftime('%FT%TZ')}}
                    })

                if self.action_schedule_stop \
                and self.action_schedule_stop != workshop_provision.action_schedule_stop:
                    patch = deep_update(patch, {
                        "spec": {"actionSchedule": {"stop": self.action_schedule_stop.strftime('%FT%TZ')}}
                    })

                if self.lifespan_end \
                and self.lifespan_end != workshop_provision.lifespan_end:
                    patch = deep_update(patch, {
                        "spec": {"lifespan": {"end": self.lifespan_end.strftime('%FT%TZ')}}
                    })

                if self.lifespan_start \
                and self.lifespan_start != workshop_provision.lifespan_start:
                    patch = deep_update(patch, {
                        "spec": {"lifespan": {"start": self.lifespan_start.strftime('%FT%TZ')}}
                    })

                if patch:
                    await workshop_provision.merge_patch(patch)

    async def remove_resource_claim_from_status(self, resource_claim, logger):
        if resource_claim.name not in self.status.get('resourceClaims', {}):
            return
        await self.merge_patch_status({
            "resourceClaims": {
                resource_claim.name: None
            }
        })
        logger.info("Removed %s from %s status", resource_claim, self)

    async def remove_workshop_provision_from_status(self, workshop_provision, logger):
        if workshop_provision.name not in self.status.get('workshopProvisions', {}):
            return
        await self.merge_patch_status({
            "workshopProvisions": {
                workshop_provision.name: None
            }
        })
        logger.info("Removed %s from %s status", workshop_provision, self)

    async def update_status(self):
        assigned_user_count = 0
        available_user_count = 0
        total_user_count = 0

        for user_assignment in self.status.get('userAssignments', {}).values():
            total_user_count += 1
            if 'assignment' in user_assignment:
                assigned_user_count += 1
            else:
                available_user_count += 1

        # Collect WorkshopProvision counts
        total_failed_count = 0
        total_resource_claim_count = 0
        total_retry_count = 0
        total_ordered_count = 0

        for workshop_provision in self.get_workshop_provisions():
            provision_status = workshop_provision.status or {}
            total_failed_count += provision_status.get('failedCount', 0)
            total_resource_claim_count += provision_status.get('resourceClaimCount', 0)
            total_retry_count += provision_status.get('retryCount', 0)
            total_ordered_count += workshop_provision.count

        await self.merge_patch_status({
            "userCount": {
                "assigned": assigned_user_count,
                "available": available_user_count,
                "total": total_user_count,
            },
            "provisionCount": {
                "ordered": total_ordered_count,
                "failed": total_failed_count,
                "active": total_resource_claim_count,
                "retries": total_retry_count,
            }
        })
