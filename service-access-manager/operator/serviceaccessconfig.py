from kubernetes_asyncio.client import ApiException as k8sApiException

from babylon import Babylon
from resourceclaim import ResourceClaim
from workshop import Workshop
from workshopprovision import WorkshopProvision
from workshopuserassignment import WorkshopUserAssignment
from kopfobject import KopfObject
from openshiftuser import OpenShiftUser
from serviceaccess import ServiceAccess
from usernamespace import UserNamespace

from kubernetes_asyncio.client.models import RbacV1Subject, V1ObjectMeta, V1PolicyRule, V1Role, V1RoleBinding, V1RoleRef

class ServiceAccessConfig(KopfObject):
    api_group = Babylon.babylon_domain
    api_version = Babylon.babylon_api_version
    kind = 'ServiceAccessConfig'
    plural = 'serviceaccessconfigs'

    class User:
        def __init__(self, name):
            self.name = name

    @property
    def object_name(self):
        return self.spec['name']

    @property
    def object_kind(self):
        return self.spec['kind']

    @property
    def users(self):
        return [
            self.User(name=item['name']) for item in self.spec.get('users', [])
        ]

    async def __delete_role(self, logger) -> None:
        """Delete service access role for this workshop."""
        try:
            await Babylon.rbac_authorization_api.delete_namespaced_role(self.name, self.namespace)
            logger.info("Deleted role for %s", self)
        except k8sApiException as exception:
            if exception.status != 404:
                logger.exception("Failed to delete role for %s", self)

    async def __delete_role_binding(self, logger) -> None:
        """Delete service access role binding for this workshop."""
        try:
            await Babylon.rbac_authorization_api.delete_namespaced_role_binding(self.name, self.namespace)
            logger.info("Deleted role binding for %s", self)
        except k8sApiException as exception:
            if exception.status != 404:
                logger.exception("Failed to delete role binding for %s", self)

    async def __delete_serviceaccesses(self, logger):
        async for service_access in ServiceAccess.list(
            label_selector=f"{Babylon.babylon_domain}/service-access-config={self.uid}",
        ):
            logger.info("Deleting %s for %s", service_access, self)
            await service_access.delete()

    async def __fetch_role(self, logger):
        try:
            return await Babylon.rbac_authorization_api.read_namespaced_role(self.name, self.namespace)
        except k8sApiException as exception:
            if exception.status != 404:
                raise
            return None

    async def __handle_delete_kind_resource_claim(self, logger):
        """Handle cleanup of ResourceClaim on delete of ServiceAccessConfig."""
        try:
            resource_claim = await ResourceClaim.fetch(
                name=self.object_name,
                namespace=self.namespace,
            )
        except k8sApiException as exception:
            if exception.status == 404:
                return
            raise
        # Don't bother with cleanup if resource_claim is already deleting.
        if 'deletionTimestamp' in resource_claim.metadata:
            return
        service_access_configs = resource_claim.status.get('serviceAccessConfigs', [])
        if self.name in service_access_configs:
            service_access_configs.remove(self.name)
            await resource_claim.merge_patch_status({"serviceAccessConfigs": service_access_configs})

    async def __handle_delete_kind_workshop(self, logger):
        """Handle cleanup of Workshop on delete of ServiceAccessConfig."""
        try:
            workshop = await Workshop.fetch(
                name=self.object_name,
                namespace=self.namespace,
            )
        except k8sApiException as exception:
            if exception.status == 404:
                return
            raise
        # Don't bother with cleanup if resource_claim is already deleting.
        if 'deletionTimestamp' in workshop.metadata:
            return
        service_access_configs = workshop.status.get('serviceAccessConfigs', [])
        if self.name in service_access_configs:
            service_access_configs.remove(self.name)
            await workshop.merge_patch_status({"serviceAccessConfigs": service_access_configs})

    async def __manage(self, logger):
        if self.object_kind == 'ResourceClaim':
            await self.__manage_resource_claim_access(logger)
        elif self.object_kind == 'Workshop':
            await self.__manage_workshop_access(logger)
        await self.__manage_service_accesses(logger)

    async def __manage_resource_claim_access(self, logger):
        try:
            resource_claim = await ResourceClaim.fetch(
                name=self.object_name,
                namespace=self.namespace,
            )
        except k8sApiException as exception:
            if exception.status == 404:
                logger.info("Deleting %s after deletion of ResourceClaim %s", self, self.object_name)
                await self.delete()
                return
            raise
        if resource_claim.deletion_timestamp is not None:
            logger.info("Deleting %s after deletion of %s", self, resource_claim)
            await self.delete()
            return
        await self.__manage_resource_claim_access_with_object(resource_claim, logger)

    async def __manage_resource_claim_access_with_object(self, resource_claim, logger):
        await self.__manage_resource_claim_service_access_config_reference(resource_claim, logger)
        await self.__manage_resource_claim_access_role(resource_claim, logger)
        await self.__manage_role_binding(resource_claim, logger)

    async def __manage_resource_claim_access_role(self, resource_claim, logger):
        """Manage role for access to ResourceClaim."""
        current_state = await self.__fetch_role(logger)

        role = V1Role(
            api_version="rbac.authorization.k8s.io/v1",
            kind="Role",
            metadata=(
                V1ObjectMeta(name=self.name, namespace=self.namespace)
                if current_state is None else current_state.metadata
            ),
        )
        role.metadata.owner_references = [self.as_owner_reference()]
        role.rules = [
            V1PolicyRule(
                api_groups=[resource_claim.api_group],
                resource_names=[resource_claim.name],
                resources=[resource_claim.plural],
                verbs=['get', 'patch', 'update'],
            ),
        ]
        if current_state is None:
            try:
                await Babylon.rbac_authorization_api.create_namespaced_role(self.namespace, role)
                logger.info("Created service access role for %s", resource_claim)
            except k8sApiException:
                logger.exception("Failed to create service access role for %s", resource_claim)
        elif role != current_state:
            try:
                await Babylon.rbac_authorization_api.replace_namespaced_role(self.name, self.namespace, role)
                logger.info("Updated service access role for %s", resource_claim)
            except k8sApiException:
                logger.exception("Failed to update service access role for %s", resource_claim)

    async def __manage_resource_claim_service_access_config_reference(self, resource_claim, logger):
        """Make sure ResourceClaim has reference to ServiceAccessConfig in status."""
        service_access_configs = resource_claim.status.get('serviceAccessConfigs')
        if service_access_configs is None:
            await resource_claim.merge_patch_status({"serviceAccessConfigs": [self.name]})
            logger.info("Added %s to %s status", self, resource_claim)
        elif self.name not in service_access_configs:
            service_access_configs.append(self.name)
            await resource_claim.merge_patch_status({"serviceAccessConfigs": service_access_configs})
            logger.info("Added %s to %s status", self, resource_claim)

    async def __manage_role_binding(self, obj, logger):
        """Manage role binding for this service access config role."""
        current_state = None
        try:
            current_state = await Babylon.rbac_authorization_api.read_namespaced_role_binding(
                self.name, self.namespace
            )
        except k8sApiException as exception:
            if exception.status != 404:
                logger.exception("Failed to get service access role binding for %s", obj)
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
        role_binding.metadata.owner_references = [self.as_owner_reference()]
        role_binding.subjects = [
            RbacV1Subject(
                api_group="rbac.authorization.k8s.io",
                kind="User",
                name=user.name,
            ) for user in self.users
        ]
        if current_state is None:
            try:
                await Babylon.rbac_authorization_api.create_namespaced_role_binding(
                    self.namespace, role_binding
                )
                logger.info("Created service access role binding for %s", obj)
            except k8sApiException as exception:
                if exception.status != 409:
                    logger.exception("Failed to create service access role binding for %s", obj)
        elif role_binding != current_state:
            try:
                await Babylon.rbac_authorization_api.replace_namespaced_role_binding(self.name, self.namespace, role_binding)
                logger.info("Updated service access role binding for %s", obj)
            except k8sApiException:
                logger.exception("Failed to update service access role binding for %s", obj)

    async def __manage_service_accesses(self, logger):
        """Manage ServiceAccess objects which report to users about access granted by this ServiceAccessConfig."""
        for user in self.users:
            try:
                ocp_user = await OpenShiftUser.fetch(user.name)
            except k8sApiException as exception:
                if exception.status == 404:
                    logger.warning("%s references nonexistent OpenShift User: %s", self, user.name)
                else:
                    logger.exception("Error fetching OpenShift User %s for %s", user.name, self)
                continue

            user_namespace = await UserNamespace.get_for_user(ocp_user)
            if user_namespace is None:
                logger.warning("Unable to find namespace for %s", ocp_user.name)
                continue

            try:
                service_access = await ServiceAccess.create({
                    "apiVersion": f"{ServiceAccess.api_group}/{ServiceAccess.api_version}",
                    "kind": ServiceAccess.kind,
                    "metadata": {
                        "labels": {
                            f"{Babylon.babylon_domain}/service-access-config": self.uid,
                        },
                        "name": self.uid,
                        "namespace": user_namespace.name,
                    },
                    "spec": {
                        "kind": self.object_kind,
                        "name": self.object_name,
                        "namespace": self.namespace,
                        "serviceAccessConfigName": self.name,
                    }
                })
                logger.info("Created %s for %s", service_access, self)
            except k8sApiException as exception:
                if exception.status != 409:
                    logger.exception("Error creating ServiceAccess for %s in %s", self, user_namespace.name)

    async def __manage_workshop_access(self, logger):
        try:
            workshop = await Workshop.fetch(
                name=self.object_name,
                namespace=self.namespace,
            )
        except k8sApiException as exception:
            if exception.status == 404:
                logger.info("Deleting %s after deletion of Workshop %s", self, self.object_name)
                await self.delete()
                return
            raise
        if workshop.deletion_timestamp is not None:
            logger.info("Deleting %s after deletion of %s", self, workshop)
            await self.delete()
            return
        await self.__manage_workshop_access_with_object(workshop, logger)

    async def __manage_workshop_access_with_object(self, workshop, logger):
        await self.__manage_workshop_service_access_config_reference(workshop, logger)
        await self.__manage_workshop_access_role(workshop, logger)
        await self.__manage_role_binding(workshop, logger)

    async def __manage_workshop_service_access_config_reference(self, workshop, logger):
        """Make sure Workshop has reference to ServiceAccessConfig in status."""
        service_access_configs = workshop.status.get('serviceAccessConfigs')
        if service_access_configs is None:
            await workshop.merge_patch_status({"serviceAccessConfigs": [self.name]})
            logger.info("Added %s to %s status", self, workshop)
        elif self.name not in service_access_configs:
            service_access_configs.append(self.name)
            await workshop.merge_patch_status({"serviceAccessConfigs": service_access_configs})
            logger.info("Added %s to %s status", self, workshop)

    async def __manage_workshop_access_role(self, workshop, logger):
        """Manage role for access to workshop and related objects."""
        current_state = await self.__fetch_role(logger)

        role = V1Role(
            api_version="rbac.authorization.k8s.io/v1",
            kind="Role",
            metadata=(
                V1ObjectMeta(name=self.name, namespace=self.namespace)
                if current_state is None else current_state.metadata
            ),
        )
        role.metadata.owner_references = [self.as_owner_reference()]
        role.rules = [
            V1PolicyRule(
                api_groups=[workshop.api_group],
                resource_names=[workshop.name],
                resources=[workshop.plural],
                verbs=['get', 'patch', 'update'],
            ),
        ]
        if len(workshop.resource_claim_names) > 0:
            role.rules.append(
                V1PolicyRule(
                    api_groups=[ResourceClaim.api_group],
                    resource_names=workshop.resource_claim_names,
                    resources=[ResourceClaim.plural],
                    verbs=['delete', 'get', 'patch', 'update'],
                )
            )
        if len(workshop.workshop_provision_names) > 0:
            role.rules.append(
                V1PolicyRule(
                    api_groups=[WorkshopProvision.api_group],
                    resource_names=workshop.workshop_provision_names,
                    resources=[WorkshopProvision.plural],
                    verbs=['delete', 'get', 'patch', 'update'],
                )
            )
        if len(workshop.workshop_user_assignment_names) > 0:
            role.rules.append(
                V1PolicyRule(
                    api_groups=[WorkshopUserAssignment.api_group],
                    resource_names=workshop.workshop_user_assignment_names,
                    resources=[WorkshopUserAssignment.plural],
                    verbs=['delete', 'get', 'patch', 'update'],
                )
            )

        if current_state is None:
            try:
                await Babylon.rbac_authorization_api.create_namespaced_role(self.namespace, role)
                logger.info("Created service access role for %s", workshop)
            except k8sApiException as exception:
                if exception.status != 409:
                    logger.exception("Failed to create service access role for %s", workshop)
        elif role != current_state:
            try:
                await Babylon.rbac_authorization_api.replace_namespaced_role(self.name, self.namespace, role)
                logger.info("Updated service access role for %s", workshop)
            except k8sApiException:
                logger.exception("Failed to update service access role for %s", workshop)

    async def handle_create(self, logger):
        logger.debug(f"Handling create {self}")
        await self.__manage(logger)

    async def handle_delete(self, logger):
        logger.debug(f"Handling delete {self}")
        if self.object_kind == 'ResourceClaim':
            await self.__handle_delete_kind_resource_claim(logger)
        elif self.object_kind == 'Workshop':
            await self.__handle_delete_kind_workshop(logger)
        await self.__delete_serviceaccesses(logger)
        await self.__delete_role_binding(logger)
        await self.__delete_role(logger)

    async def handle_resource_claim_event(self, resource_claim, logger):
        logger.debug(f"Handling event on %s for %s", resource_claim, self)
        await self.__manage_resource_claim_access_with_object(resource_claim, logger)

    async def handle_resume(self, logger):
        logger.debug(f"Handling resume {self}")
        await self.__manage(logger)

    async def handle_timer(self, logger):
        logger.debug(f"Handling timer {self}")
        await self.__manage(logger)

    async def handle_update(self, logger):
        logger.debug(f"Handling update {self}")
        await self.__manage(logger)

    async def handle_update(self, logger):
        logger.debug(f"Handling update {self}")
        await self.__manage(logger)

    async def handle_workshop_event(self, workshop, logger):
        logger.debug(f"Handling event on %s for %s", workshop, self)
        await self.__manage_workshop_access_with_object(workshop, logger)
