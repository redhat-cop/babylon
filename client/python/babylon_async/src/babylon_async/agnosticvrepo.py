from __future__ import annotations

from .k8s_object import K8sObject

class AgnosticVRepo(K8sObject):
    """AgnosticVRepo object"""
    api_group = "gpte.redhat.com"
    api_version = "v1"
    kind = "AgnosticVRepo"
    plural = "agnosticvrepos"
    api_group_version = f"{api_group}/{api_version}"

    @property
    def spec(self) -> AgnosticVRepoSpec:
        """Return AgnosticVRepoSpec"""
        return AgnosticVRepoSpec(self._definition['spec'])

    @property
    def git_ref(self) -> str:
        return self.spec.ref

    @property
    def git_url(self) -> str:
        return self.spec.url

class AgnosticVRepoSpec:
    """Spec section of AgnosticVRepo"""
    def __init__(self, definition):
        self._definition = definition

    @property
    def ref(self) -> str:
        return self._definition['ref']

    @property
    def url(self) -> str:
        return self._definition['url']
