from __future__ import annotations

from .k8s_object import K8sObject

class Namespace(K8sObject):
    api_group = None
    api_version = "v1"
    kind = "Namespace"
    plural = "namespaces"
    api_group_version = "v1"

    def __init__(self, client, definition:Mapping):
        super().__init__(client, definition)
