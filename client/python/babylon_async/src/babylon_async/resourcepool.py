from __future__ import annotations
from typing import Any, Mapping

from datetime import datetime, timedelta

import pytimeparse

from .k8s_object import K8sObject
from .resourcereference import ResourceReference

class ResourcePool(K8sObject):
    api_group = "poolboy.gpte.redhat.com"
    api_version = "v1"
    kind = "ResourcePool"
    plural = "resourcepools"
    api_group_version = f"{api_group}/{api_version}"

    def __init__(self, client, definition):
        super().__init__(client, definition)
        self.spec = ResourcePoolSpec(definition['spec'])

    def __str__(self):
        return f"ResourcePool {self.name}"

class ResourcePoolSpec:
    def __init__(self, definition):
        self.definition = definition
        self.resources = [
            ResourcePoolSpecResource(item) for item in definition.get('resources', [])
        ]

class ResourcePoolSpecResource:
    def __init__(self, definition):
        self.definition = definition
        self.provider = ResourcePoolSpecResourceProvider(definition['provider'])

    @property
    def template(self) -> Mapping[str, Any]:
        return self.definition.get('template', {})

class ResourcePoolSpecResourceProvider:
    def __init__(self, definition):
        self.__definition = definition

    @property
    def api_version(self) -> str:
        return self.__definition.get('apiVersion')

    @property
    def kind(self) -> str:
        return self.__definition.get('kind')

    @property
    def name(self) -> str:
        return self.__definition.get('name')

    @property
    def namespace(self) -> str:
        return self.__definition.get('namespace')
