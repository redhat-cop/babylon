from __future__ import annotations
from typing import Any, Mapping

from .k8s_object import K8sObject
from .resourceprovider import ResourceProvider

class WorkshopProvision(K8sObject):
    api_group = "babylon.gpte.redhat.com"
    api_version = "v1"
    kind = "WorkshopProvision"
    plural = "workshopprovisions"
    api_group_version = f"{api_group}/{api_version}"

    @property
    def parameter_values(self) -> Mapping:
        return self.spec.parameters

    @property
    def resource_provider_name(self) -> str:
        return self.spec.catalog_item.name

    @property
    def spec(self) -> WorkshopProvisionSpec:
        return WorkshopProvisionSpec(self.__definition['spec'])

    @property
    def status(self) -> WorkshopProvisionStatus|None:
        if 'status' not in self.__definition:
            return None
        return WorkshopProvisionStatus(self.__definition['status'])

    async def get_resource_provider(self) -> ResourceProvider:
        return await self.client.get_resource_provider(name=self.resource_provider_name)

class WorkshopProvisionSpec:
    def __init__(self, definition):
        self.__definition = definition

    @property
    def catalog_item(self) -> WorkshopProvisionSpecCatalogItem:
        return WorkshopProvisionSpecCatalogItem(self.__definition['catalogItem'])

    @property
    def parameters(self) -> Mapping:
        return self.__definition.get('parameters')

class WorkshopProvisionSpecCatalogItem:
    def __init__(self, definition):
        self.__definition = definition

    @property
    def name(self) -> str:
        return self.__definition['name']

    @property
    def namespace(self) -> str:
        return self.__definition['namespace']

class WorkshopProvisionStatus:
    def __init__(self, definition):
        self.__definition = definition
