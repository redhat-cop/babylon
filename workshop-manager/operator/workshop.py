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
    def user_assignments(self):
        return [
            UserAssignment(definition=definition)
            for definition in self.spec.get('userAssignments', [])
        ]

    @property
    def workshop_id(self):
        return self.labels.get(Babylon.workshop_id_label)

    def get_workshop_provisions(self):
        return workshopprovision.WorkshopProvision.get_for_workshop(self)

    async def check_resource_claims(self, logger):
        check_resource_claim_names = []
        for user_assignment in self.user_assignments:
            resource_claim_name = user_assignment.resource_claim_name
            if resource_claim_name and resource_claim_name not in check_resource_claim_names:
                check_resource_claim_names.append(resource_claim_name)

        remove_resource_claim_names = []
        for resource_claim_name in check_resource_claim_names:
            try:
                resource_claim = await resourceclaim.ResourceClaim.fetch(resource_claim_name, self.namespace)
                if self.name != resource_claim.workshop_name:
                    logger.info(f"{resource_claim} was reassigned from Workshop {self.name} to {resource_claim.workshop_name}")
                    remove_resource_claim_names.append(resource_claim.name)
            except kubernetes_asyncio.client.rest.ApiException as exception:
                if exception.status == 404:
                    remove_resource_claim_names.append(resource_claim_name)
                else:
                    pass

        if remove_resource_claim_names:
            await self.remove_resource_claims(logger=logger, resource_claim_names=remove_resource_claim_names)

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

    async def handle_update(self, logger):
        async with self.lock:
            logger.info(f"Handling update for {self}")
            await self.__manage_workshop_id_label(logger=logger)
            await self.manage_workshop_provisions(logger=logger)

    async def handle_resource_claim_deleted(self, logger, resource_claim):
        async with self.lock:
            await self.remove_resource_claims(
                logger=logger, resource_claim_names=[resource_claim.name]
            )

    async def handle_resource_claim_event(self, logger, resource_claim):
        async with self.lock:
            await self.manage_user_assignments_for_resource_claim(
                logger=logger, resource_claim=resource_claim
            )

    async def list_resource_claims(self):
        async for resource_claim in resourceclaim.ResourceClaim.list(
            label_selector = f"{Babylon.workshop_label}={self.name}",
            namespace = self.namespace,
        ):
            yield resource_claim

    async def manage(self, logger):
        async with self.lock:
            await self.check_resource_claims(logger=logger)
            await self.update_status()

    async def manage_user_assignments_for_resource_claim(self, logger, resource_claim):
        if not self.definition:
            await self.refresh()

        while True:
            try:
                await self.__manage_user_assignments_for_resource_claim(logger=logger, resource_claim=resource_claim)
                return
            except kubernetes_asyncio.client.rest.ApiException as exception:
                if exception.status == 409:
                    await self.refresh()
                else:
                    raise

    async def __manage_user_assignments_for_resource_claim(self, logger, resource_claim):
        workshop_definition = deepcopy(self.definition)
        workshop_definition_updated = False

        if self.multiuser_services:
            for user_assignment in resource_claim.get_user_assignments(logger=logger):
                user_assignment_definition = user_assignment.serialize()
                for idx, item in enumerate(workshop_definition['spec'].get('userAssignments', [])):
                    if item.get('resourceClaimName') == resource_claim.name \
                    and item.get('userName') == user_assignment.user_name:
                        updated_item = deep_update(item, user_assignment_definition)
                        if item != updated_item:
                            workshop_definition['spec']['userAssignments'][idx] = updated_item
                            workshop_definition_updated = True
                        break
                else:
                    workshop_definition['spec']['userAssignments'].append(user_assignment_definition)
                    workshop_definition_updated = True
        else:
            user_assignment = resource_claim.as_user_assignment(logger=logger)
            user_assignment_definition = user_assignment.serialize()
            for idx, item in enumerate(workshop_definition['spec'].get('userAssignments', [])):
                if item.get('resourceClaimName') == resource_claim.name:
                    updated_item = deep_update(item, user_assignment_definition)
                    if item != updated_item:
                        workshop_definition['spec']['userAssignments'][idx] = updated_item
                        workshop_definition_updated = True
                    break
            else:
                workshop_definition['spec']['userAssignments'].append(user_assignment_definition)
                workshop_definition_updated = True

        if workshop_definition_updated:
            await self.replace(workshop_definition)
            await self.update_status()
            logger.info(f"Updated {self} for {resource_claim}")

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

    async def remove_resource_claims(self, logger, resource_claim_names):
        if not self.definition:
            try:
                await self.refresh()
            except kubernetes_asyncio.client.rest.ApiException as exception:
                if exception.status == 404:
                    return
                raise

        while True:
            try:
                workshop_definition = deepcopy(self.definition)
                workshop_user_assignments = self.spec.get('userAssignments', [])
                pruned_user_assignments = [
                    item for item in workshop_user_assignments
                    if item.get('resourceClaimName') not in resource_claim_names
                ]
                if pruned_user_assignments != workshop_user_assignments:
                    workshop_definition['spec']['userAssignments'] = pruned_user_assignments
                    await self.replace(workshop_definition)
                return
            except kubernetes_asyncio.client.rest.ApiException as exception:
                if exception.status == 404:
                    return
                if exception.status == 409:
                    await self.refresh()
                else:
                    raise

    async def update_status(self):
        assigned_user_count = 0
        available_user_count = 0
        total_user_count = 0
        for user_assignment in self.spec.get('userAssignments', []):
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
