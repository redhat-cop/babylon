from __future__ import annotations
from typing import Any, Mapping

from .k8s_object import K8sObject

class ClusterTenantPool(K8sObject):
    api_group = "babylon.gpte.redhat.com"
    api_version = "v1"
    kind = "ClusterTenantPool"
    plural = "clustertenantpools"
    api_group_version = f"{api_group}/{api_version}"

    def __init__(self, client, definition):
        super().__init__(client, definition)
        self.spec = ClusterTenantPoolSpec(definition['spec'])

    def __str__(self):
        return f"ClusterTenantPool {self.name}"

class ClusterTenantPoolSpec:
    def __init__(self, definition):
        self.__definition = definition
