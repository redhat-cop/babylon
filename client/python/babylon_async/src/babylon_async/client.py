from __future__ import annotations

from typing import Any, Generator, List, Mapping

import os

import kubernetes_asyncio
from inflection import singularize
from kubernetes_asyncio.client import (
    ApiClient, CoreV1Api, CustomObjectsApi,
    ApiException as KubernetesApiException
)

from .anarchygovernor import AnarchyGovernor
from .anarchyrun import AnarchyRun
from .anarchysubject import AnarchySubject
from .catalogitem import CatalogItem
from .exceptions import BabylonApiException
from .namespace import Namespace
from .resourceclaim import ResourceClaim
from .resourcepool import ResourcePool
from .resourceprovider import ResourceProvider
from .user import User
from .workshop import Workshop
from .workshopprovision import WorkshopProvision

class BabylonClient:
    @classmethod
    async def create(cls, api_client:ApiClient=None) -> BabylonClient:
        client = cls(api_client=api_client)
        await client.init()
        return client

    def __init__(self, api_client:ApiClient=None):
        self.api_client = api_client
        self.core_v1_api:CoreV1Api|None = None
        self.custom_objects_api:CustomObjectsApi|None = None
        self.is_admin:bool = False

    async def __aenter__(self) -> None:
        await self.init()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        await self.close()

    async def close(self):
        await self.api_client.close()

    async def init(self) -> None:
        if self.api_client is None:
            if os.path.exists('/run/secrets/kubernetes.io/serviceaccount'):
                # If running in a container then use incluster config
                kubernetes_asyncio.config.load_incluster_config()
            else:
                # Default to using user's kube config
                await kubernetes_asyncio.config.load_kube_config()

            self.api_client = ApiClient()

        self.core_v1_api = CoreV1Api(self.api_client)
        self.custom_objects_api = CustomObjectsApi(self.api_client)
        await self.__init_is_admin()

    async def __init_is_admin(self) -> None:
        """Check if user has admin rights in babylon and set is_admin flag."""
        self.is_admin = await self.check_access(
            group="anarchy.gpte.redhat.com",
            plural="anarchysubjects",
            verb="update",
        )

    async def check_access(self,
        group:str,
        plural:str,
        verb:str,
        namespace:str|None=None,
    ) -> bool:
        resource_attributes = {
            "group": group,
            "resource": plural,
            "verb": verb,
        }
        if namespace is not None:
            resource_attributes['namespace'] = namespace
        (data, status, _) = await self.api_client.call_api(
            '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews',
            'POST',
            auth_settings=['BearerToken'],
            body={
                "apiVersion": "authorization.k8s.io/v1",
                "kind": "SelfSubjectAccessReview",
                "spec": {
                    "resourceAttributes": resource_attributes,
                },
            },
            response_types_map={
                201: "object",
                401: None,
            },
        )
        if status == 201:
            return data.get('status', {}).get('allowed', False)

        reason = f"Failed to check access to {verb} {plural}.{group}"
        if namespace is not None:
            reason += f" in {namespace}"
        raise BabylonApiException(status, reason)

    #async def order_service(self,
    #    catalog_item: CatalogItem,
    #    user: User,
    #    parameters:Mapping={},
    #) -> ResourceClaim:
    #    pass

    # Generic methods
    async def create_object(self,
        definition:Mapping[str,Any],
        plural:str,
        version:str,
        group:str|None=None,
        namespace:str|None=None,
    ) -> Mapping:
        try:
            if group is None:
                singular = singularize(plural)
                if namespace is None:
                    return self.api_client.sanitize_for_serialization(
                        await getattr(self.core_v1_api, f"create_{singular}")(definition)
                    )
                return self.api_client.sanitize_for_serialization(
                    await getattr(
                        self.core_v1_api, f"create_namespaced_{singular}"
                    )(namespace, definition)
                )
            if namespace is None:
                return await self.custom_objects_api.create_cluster_custom_object(
                    body=definition,
                    group=group,
                    plural=plural,
                    version=version,
                )
            return await self.custom_objects_api.create_namespaced_custom_object(
                body=definition,
                group=group,
                namespace=namespace,
                plural=plural,
                version=version,
            )
        except KubernetesApiException as exception:
            raise BabylonApiException(kubernetes_api_exception=exception) from exception

    async def delete_object(self,
        name:str,
        plural:str,
        version:str,
        group:str|None=None,
        namespace:str|None=None,
    ) -> Mapping:
        try:
            if group is None:
                singular = singularize(plural)
                if namespace is None:
                    return self.api_client.sanitize_for_serialization(
                        await getattr(self.core_v1_api, f"delete_{singular}")(name)
                    )
                return self.api_client.sanitize_for_serialization(
                    await getattr(
                        self.core_v1_api, f"delete_namespaced_{singular}"
                    )(name, namespace)
                )
            if namespace is None:
                return await self.custom_objects_api.delete_cluster_custom_object(
                    group=group,
                    name=name,
                    plural=plural,
                    version=version,
                )
            return await self.custom_objects_api.delete_namespaced_custom_object(
                group=group,
                name=name,
                namespace=namespace,
                plural=plural,
                version=version,
            )
        except KubernetesApiException as exception:
            raise BabylonApiException(kubernetes_api_exception=exception) from exception

    async def get_object(self,
        plural:str,
        name:str,
        version:str,
        group:str|None=None,
        namespace:str|None=None,
    ) -> Mapping:
        try:
            if group is None:
                singular = singularize(plural)
                if namespace is None:
                    return self.api_client.sanitize_for_serialization(
                        await getattr(self.core_v1_api, f"read_{singular}")(name)
                    )
                return self.api_client.sanitize_for_serialization(
                    getattr(self.core_v1_api, f"read_namespaced_{singular}")(name, namespace)
                )
            if namespace is None:
                return await self.custom_objects_api.get_cluster_custom_object(
                    group=group,
                    name=name,
                    plural=plural,
                    version=version,
                )
            return await self.custom_objects_api.get_namespaced_custom_object(
                group=group,
                name=name,
                namespace=namespace,
                plural=plural,
                version=version,
            )
        except KubernetesApiException as exception:
            raise BabylonApiException(kubernetes_api_exception=exception) from exception

    async def list_object(self,
        plural:str,
        version:str,
        batch_size:int=50,
        label_selector:str|None=None,
        group:str|None=None,
        namespace:str|None=None,
    ) -> Generator[Mapping, None, None]:
        # FIXME - wrap with a try/except
        _continue = None
        method = None
        if group is None:
            singular = singularize(plural)
            if namespace is None:
                try:
                    method = getattr(self.core_v1_api, f"list_{singular}")
                except AttributeError:
                    method = getattr(self.core_v1_api, f"list_{singular}_for_all_namespaces")
            else:
                method = getattr(self.core_v1_api, f"list_namespaced_{singular}")(namespace)

        while True:
            if method is None:
                if namespace is None:
                    obj_list = await self.custom_objects_api.list_cluster_custom_object(
                        _continue=_continue,
                        group=group,
                        label_selector=label_selector,
                        limit=batch_size,
                        plural=plural,
                        version=version,
                    )
                else:
                    obj_list = await self.custom_objects_api.list_namespaced_custom_object(
                        _continue=_continue,
                        group=group,
                        label_selector=label_selector,
                        limit=batch_size,
                        namespace=namespace,
                        plural=plural,
                        version=version,
                    )
            else:
                if namespace is None:
                    obj_list = self.api_client.sanitize_for_serialization(
                        await method(_continue=_continue)
                    )
                else:
                    obj_list = self.api_client.sanitize_for_serialization(
                        await method(namespace=namespace, _continue=_continue)
                    )
            for definition in obj_list.get('items', []):
                yield definition
            _continue = obj_list['metadata'].get('continue')
            if not _continue:
                return

    async def patch_object(self,
        group:str,
        plural:str,
        name:str,
        version:str,
        patch:Mapping|List[Mapping],
        namespace:str|None=None,
    ) -> Mapping:
        # FIXME - wrap with a try/except
        content_type = (
            'application/json-patch+json'
            if isinstance(patch, list) else
            'application/merge-patch+json'
        )
        if namespace is None:
            return await self.custom_objects_api.patch_cluster_custom_object(
                group=group,
                name=name,
                plural=plural,
                version=version,
                body=patch,
                _content_type=content_type,
            )
        return await self.custom_objects_api.patch_namespaced_custom_object(
            group=group,
            name=name,
            namespace=namespace,
            plural=plural,
            version=version,
            body=patch,
            _content_type=content_type,
        )

    async def patch_object_status(self,
        group:str,
        plural:str,
        name:str,
        version:str,
        patch:Mapping|List[Mapping],
        namespace:str|None=None,
    ) -> Mapping:
        # FIXME - wrap with a try/except
        content_type = (
            'application/json-patch+json'
            if isinstance(patch, list) else
            'application/merge-patch+json'
        )
        if namespace is None:
            return await self.custom_objects_api.patch_cluster_custom_object_status(
                group=group,
                name=name,
                plural=plural,
                version=version,
                body=patch,
                _content_type=content_type,
            )
        return await self.custom_objects_api.patch_namespaced_custom_object_status(
            group=group,
            name=name,
            namespace=namespace,
            plural=plural,
            version=version,
            body=patch,
            _content_type=content_type,
        )

    # AnarchyGovernor methods
    async def get_anarchy_governor(self,
        name:str,
        namespace:str,
    ) -> AnarchyGovernor:
        return await AnarchyGovernor.get(client=self, name=name, namespace=namespace)


    # AnarchyRun methods
    async def get_anarchy_run(self,
        name:str,
        namespace:str,
    ) -> AnarchyRun:
        return await AnarchyRun.get(
            client=self,
            name=name,
            namespace=namespace,
        )

    async def list_anarchy_runs(self,
        label_selector:str=None,
        namespace:str=None,
    ) -> Generator[AnarchyRun, None, None]:
        async for anarchy_run in AnarchyRun.list(
            client=self,
            label_selector=label_selector,
            namespace=namespace
        ):
            yield anarchy_run

    async def list_anarchy_runs_for_anarchy_subject(self,
        anarchy_subject:AnarchySubject,
    ) -> Generator[AnarchyRun, None, None]:
        async for anarchy_run in self.list_anarchy_runs(
            label_selector=f"anarchy.gpte.redhat.com/subject={anarchy_subject.name}",
            namespace=anarchy_subject.namespace,
        ):
            yield anarchy_run

    # AnarchySubject methods
    async def list_anarchy_subjects(self,
        label_selector:str=None,
        namespace:str=None,
    ) -> Generator[AnarchySubject, None, None]:
        async for anarchy_subject in AnarchySubject.list(
            client=self,
            label_selector=label_selector,
            namespace=namespace,
        ):
            yield anarchy_subject

    # CatalogItem methods
    async def get_catalog_item(self, name:str, namespace:str) -> CatalogItem:
        return await CatalogItem.get(client=self, name=name, namespace=namespace)

    async def list_catalog_items(self,
        label_selector:str|None=None,
        namespace:str|None=None,
    ) -> Generator[CatalogItem, None, None]:
        async for catalog_item in CatalogItem.list(
            client=self,
            label_selector=label_selector,
            namespace=namespace,
        ):
            yield catalog_item

    # Namespace methods
    async def get_current_user_service_namespace(self) -> Namespace:
        # Getting the current user service namespace involves checking access
        # and some guesswork. If the user is not an admin they will net be able
        # to list either namespaces or projects.
        n = 0
        user = await self.get_user('~')
        base_name = "user-" + user.metadata.name.replace('.', '-').replace('@', '-')
        while n < 10:
            name = base_name if n==0 else f"{base_name}-{n}"
            if self.is_admin:
                try:
                    return await self.get_namespace(name)
                except BabylonApiException as exception:
                    if exception.status != 404:
                        raise
            else:
                if await self.check_access(
                    group=ResourceClaim.api_group,
                    namespace=name,
                    plural=ResourceClaim.plural,
                    verb="update",
                ):
                    return Namespace(self, {"metadata": {"name": name}})

            n += 1
        raise BabylonApiException(404, "No service namespace found for current user.")

    async def get_user_service_namespace(self, user:User) -> Namespace:
        pass

    # Namespace methods
    async def get_namespace(self,
        name:str,
    ) -> Namespace:
        return await Namespace.get(client=self, name=name)

    async def list_namespaces(self,
        label_selector:str|None=None,
    ) -> Generator[Namespace, None, None]:
        async for namespace in Namespace.list(
            client=self,
            label_selector=label_selector,
        ):
            yield namespace

    # ResourceClaim methods
    async def create_resource_claim(self,
        namespace:str,
        provider_name:str,
        auto_detach:bool=False,
        name:str|None=None,
        owner:K8sObject|None=None,
        parameter_values:Mapping[str,Any]={},
    ):
        return await ResourceClaim.create(
            auto_detach=auto_detach,
            client=self,
            name=name,
            namespace=namespace,
            owner=owner,
            parameter_values=parameter_values,
            provider_name=provider_name,
        )

    async def get_resource_claim(self, name:str, namespace:str) -> ResourceClaim:
        return await ResourceClaim.get(client=self, name=name, namespace=namespace)

    async def list_resource_claims(self,
        label_selector:str|None=None,
        namespace:str|None=None,
    ) -> Generator[ResourceClaim, None, None]:
        async for resource_claim in ResourceClaim.list(
            client=self,
            label_selector=label_selector,
            namespace=namespace,
        ):
            yield resource_claim

    # ResourcePool methods
    async def get_resource_pool(self, name:str) -> ResourcePool:
        return await ResourcePool.get(client=self, name=name, namespace="poolboy")

    async def list_resource_pools(self,
        label_selector:str|None=None,
    ) -> Generator[ResourcePool, None, None]:
        async for resource_pool in ResourcePool.list(
            client=self,
            label_selector=label_selector,
            namespace="poolboy",
        ):
            yield resource_pool

    # ResourceProvider methods
    async def get_resource_provider(self, name:str, cache:bool=False) -> ResourceProvider:
        return await ResourceProvider.get(cache=cache, client=self, name=name, namespace="poolboy")

    async def list_resource_providers(self,
        label_selector:str|None=None,
    ) -> Generator[ResourceProvider, None, None]:
        async for resource_provider in ResourceProvider.list(
            client=self,
            label_selector=label_selector,
            namespace="poolboy",
        ):
            yield resource_provider

    # User methods
    async def get_current_user(self) -> User:
        return await User.get(client=self, name='~')

    async def get_user(self, name:str) -> User:
        return await User.get(client=self, name=name)

    # Workshop methods
    async def list_workshops(self,
        label_selector:str=None,
        namespace:str=None,
    ) -> Generator[Workshop, None, None]:
        async for workshop in Workshop.list(
            client=self,
            label_selector=label_selector,
            namespace=namespace
        ):
            yield workshop

    # WorkshopProvision methods
    async def list_workshop_provisions(self,
        label_selector:str=None,
        namespace:str=None,
    ) -> Generator[WorkshopProvision, None, None]:
        async for workshop_provision in WorkshopProvision.list(
            client=self,
            label_selector=label_selector,
            namespace=namespace
        ):
            yield workshop_provision
