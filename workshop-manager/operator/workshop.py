import random

from datetime import datetime, timezone

from kubernetes_asyncio.client.exceptions import ApiException as k8sApiException
from kubernetes_asyncio.client.models import RbacV1Subject, V1ObjectMeta, V1PolicyRule, V1Role, V1RoleBinding, V1RoleRef
from pydantic.utils import deep_update

from babylon import Babylon
from cachedkopfobject import CachedKopfObject
from serviceaccess import ServiceAccess

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
    def workshop_id(self):
        return self.labels.get(Babylon.workshop_id_label)

    def get_workshop_provisions(self):
        return workshopprovision.WorkshopProvision.get_for_workshop(self)

    def get_service_access(self) -> ServiceAccess|None:
        service_access_json = self.annotations.get(Babylon.service_access_annotation)
        if service_access_json is None:
            return None
        return ServiceAccess.load(service_access_json)

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
            await self.__manage_service_access(logger=logger)

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
            await self.__manage_service_access(logger=logger)
            await self.update_status()

    async def handle_update(self, logger):
        async with self.lock:
            logger.info(f"Handling update for {self}")
            await self.__manage_workshop_id_label(logger=logger)
            await self.manage_workshop_provisions(logger=logger)
            await self.__manage_service_access(logger=logger)
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

    async def __manage_service_access(self, logger) -> None:
        """Manage role and role binding for access to this workshop and related objects."""
        service_access = self.get_service_access()
        if service_access is None:
            await self.__delete_service_access(logger=logger)
            return
        await self.__manage_service_access_role(logger=logger)
        await self.__manage_service_access_role_binding(logger=logger, service_access=service_access)

    async def __manage_service_access_role(self, logger) -> None:
        """Manage role for access to this workshop and related objects."""
        current_state = None
        try:
            current_state = await Babylon.rbac_authorization_api.read_namespaced_role(self.name, self.namespace)
        except k8sApiException as exception:
            if exception.status != 404:
                logger.exception("Failed to get service access role for %s", self)
                return

        role = V1Role(
            api_version="rbac.authorization.k8s.io/v1",
            kind="Role",
            metadata=(
                V1ObjectMeta(name=self.name, namespace=self.namespace)
                if current_state is None else current_state.metadata
            ),
        )
        role.metadata.owner_references = [self.as_owner_ref_object()]
        role.rules = [
            V1PolicyRule(
                api_groups=[self.api_group],
                resource_names=[self.name],
                resources=[self.plural],
                verbs=['get', 'patch', 'update'],
            ),
        ]
        if len(self.resource_claim_names) > 0:
            role.rules.append(
                V1PolicyRule(
                    api_groups=[resourceclaim.ResourceClaim.api_group],
                    resource_names=self.resource_claim_names,
                    resources=[resourceclaim.ResourceClaim.plural],
                    verbs=['delete', 'get', 'patch', 'update'],
                )
            )
        if len(self.workshop_provision_names) > 0:
            role.rules.append(
                V1PolicyRule(
                    api_groups=[workshopprovision.WorkshopProvision.api_group],
                    resource_names=self.workshop_provision_names,
                    resources=[workshopprovision.WorkshopProvision.plural],
                    verbs=['delete', 'get', 'patch', 'update'],
                )
            )
        if len(self.workshop_user_assignment_names) > 0:
            role.rules.append(
                V1PolicyRule(
                    api_groups=[workshopuserassignment.WorkshopUserAssignment.api_group],
                    resource_names=self.workshop_user_assignment_names,
                    resources=[workshopuserassignment.WorkshopUserAssignment.plural],
                    verbs=['delete', 'get', 'patch', 'update'],
                )
            )

        if current_state is None:
            try:
                await Babylon.rbac_authorization_api.create_namespaced_role(self.namespace, role)
                logger.info("Created service access role for %s", self)
            except k8sApiException:
                logger.exception("Failed to create service access role for %s", self)
        elif role != current_state:
            try:
                await Babylon.rbac_authorization_api.replace_namespaced_role(self.name, self.namespace, role)
                logger.info("Updated service access role for %s", self)
            except k8sApiException:
                logger.exception("Failed to update service access role for %s", self)

    async def __manage_service_access_role_binding(self, logger, service_access) -> None:
        """Manage role binding for access to this workshop and related objects."""
        current_state = None
        try:
            current_state = await Babylon.rbac_authorization_api.read_namespaced_role_binding(self.name, self.namespace)
        except k8sApiException as exception:
            if exception.status != 404:
                logger.exception("Failed to get service access role binding for %s", self)
                return

        role_binding = V1RoleBinding(
            api_version="rbac.authorization.k8s.io/v1",
            kind="RoleBinding",
            metadata=(
                V1ObjectMeta(name=self.name, namespace=self.namespace)
                if current_state is None else current_state.metadata
            ),
            role_ref=V1RoleRef(api_group="rbac.authorization.k8s.io", kind="Role", name=self.name),
        )
        role_binding.metadata.owner_references = [self.as_owner_ref_object()]
        role_binding.subjects = [
            RbacV1Subject(
                api_group="rbac.authorization.k8s.io",
                kind="User",
                name=user_name,
            ) for user_name in service_access.users
        ]
        if current_state is None:
            try:
                await Babylon.rbac_authorization_api.create_namespaced_role_binding(self.namespace, role_binding)
                logger.info("Created service access role binding for %s", self)
            except k8sApiException:
                logger.exception("Failed to create service access role binding for %s", self)
        elif role_binding != current_state:
            try:
                await Babylon.rbac_authorization_api.replace_namespaced_role_binding(self.name, self.namespace, role_binding)
                logger.info("Updated service access role binding for %s", self)
            except k8sApiException:
                logger.exception("Failed to update service access role binding for %s", self)

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
        await self.__manage_service_access_role(logger=logger)

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
        await self.__manage_service_access_role(logger=logger)

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
        await self.__manage_service_access_role(logger=logger)

    async def remove_workshop_provision_from_status(self, workshop_provision, logger):
        if workshop_provision.name not in self.status.get('workshopProvisions', {}):
            return
        await self.merge_patch_status({
            "workshopProvisions": {
                workshop_provision.name: None
            }
        })
        logger.info("Removed %s from %s status", workshop_provision, self)
        await self.__manage_service_access_role(logger=logger)

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
