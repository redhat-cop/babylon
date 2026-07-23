from __future__ import annotations
from typing import Mapping

from .k8s_object import K8sObject

class AgnosticVComponent(K8sObject):
    api_group = "gpte.redhat.com",
    api_version = "v1"
    kind = "AgnosticVComponent"
    plural = "agnosticvcomponents"
    api_group_version = f"{api_group}/{api_version}"

    @property
    def definition(self) -> Mapping:
        """Return merged vars from AgnosticV"""
        return self.spec.definition

    @property
    def spec(self) -> AgnosticVComponentSpec:
        return AgnosticVComponentSpec(self._definition)

    def get_tenant_cluster_pool_definition(self) -> Mapping|None:
        sandbox_host = agnosticv_component.definition.get('__meta__', {}).get('sandbox_host')
        if sandbox_host is None:
            return None
        return {
            "apiVersion": cls.api_group_version,
            "kind": cls.kind,
            "metadata": {
                "name": agnosticv_component.name,
                "namespace": agnosticv_component.namespace,
            },
            "spec": {
                "clusterProvisioning": {
                    "provider": {
                        "name": agnosticv_component.name,
                        "parameterValues": {
                            "purpose": "Tenant Cluster",
                        }
                    }
                }
                "maxClusters": 0,
                "minAvailableSandboxPlacements": 0,
                "minClusters": 0,
                "sandboxHost": deepcopy(sandbox_host),
            },
        }

class AgnosticVComponentSpec:
    def __init__(self, definition):
        self._definition = definition

    @property
    def definition(self) -> Mapping:
        return self._definition['definition']
