from __future__ import annotations
from typing import Any, List, Mapping

from .k8s_object import K8sObject
from .resourcereference import ResourceReference

class ResourcePool(K8sObject):
    api_group = "poolboy.gpte.redhat.com"
    api_version = "v1"
    kind = "ResourcePool"
    plural = "resourcepools"
    api_group_version = f"{api_group}/{api_version}"

    @property
    def spec(self) -> ResourcePoolSpec:
        return ResourcePoolSpec(self._definition['spec'])


class ResourcePoolSpec:
    def __init__(self, definition):
        self._definition = definition

    @property
    def resources(self) -> List[ResourcePoolSpecResource]:
        return [
            ResourcePoolSpecResource(item)
            for item in self._definition.get('resources', [])
        ]

class ResourcePoolSpecResource:
    def __init__(self, definition):
        self._definition = definition

    @property
    def provider(self) -> ResourcePoolSpecResourceProvider:
        return ResourcePoolSpecResourceProvider(self._definition['provider'])

    @property
    def template(self) -> Mapping[str, Any]:
        return self.definition.get('template', {})

class ResourcePoolSpecResourceProvider:
    def __init__(self, definition):
        self._definition = definition

    @property
    def api_version(self) -> str:
        return self._definition.get('apiVersion')

    @property
    def kind(self) -> str:
        return self._definition.get('kind')

    @property
    def name(self) -> str:
        return self._definition.get('name')

    @property
    def namespace(self) -> str:
        return self._definition.get('namespace')
