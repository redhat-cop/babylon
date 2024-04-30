import random

from copy import deepcopy
from datetime import datetime, timezone
from pydantic.utils import deep_update

import kubernetes_asyncio

from babylon import Babylon
from cachedkopfobject import CachedKopfObject
from userassignment import UserAssignment

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
    def requester(self):
        return self.annotations.get(Babylon.requester_annotation)

    @property
    def service_url(self):
        return self.annotations.get(Babylon.url_annotation)

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
        await self.merge_patch_status({
            "userCount": {
                "assigned": assigned_user_count,
                "available": available_user_count,
                "total": total_user_count,
            }
        })
