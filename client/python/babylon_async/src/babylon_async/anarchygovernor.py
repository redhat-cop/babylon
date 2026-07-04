from __future__ import annotations
from typing import List, Mapping

from .k8s_object import K8sObject

class AnarchyGovernor(K8sObject):
    api_group = "anarchy.gpte.redhat.com"
    api_version = "v1"
    kind = "AnarchyGovernor"
    plural = "anarchygovernors"
    api_group_version = f"{api_group}/{api_version}"

    def get_sandboxes(self) -> List[Mapping]:
        return [
            SandboxSpec(item)
            for item in self.spec.job_vars['__meta__'].get('sandboxes', [])
        ]

    @property
    def job_vars(self) -> Mapping:
        return self.spec.job_vars

    @property
    def spec(self) -> AnarchyGovernorSpec:
        return AnarchyGovernorSpec(self._definition)

    @property
    def vars(self) -> Mapping:
        return self.spec.vars

class AnarchyGovernorSpec:
    def __init__(self, definition):
        self._definition = definition

    @property
    def job_vars(self) -> Mapping:
        return self._definition.get('vars', {}).get('job_vars', {})

    @property
    def vars(self) -> Mapping:
        return self._definition.get('vars', {})

class SandboxSpec:
    def __init__(self, definition):
        self._definition = definition

    @property
    def alias(self) -> str|None:
        return self._definition.get('alias')

    @property
    def annotations(self) -> Mapping[str, str]|None:
        return self._definition.get('annotations')

    @property
    def cloud_selector(self) -> Mapping[str, str]|None:
        return self._definition.get('cloud_selector')

    @property
    def kind(self) -> str:
        return self._definition['kind']

    @property
    def namespace_suffix(self) -> str|None:
        return self._definition.get('namespace_suffix')

    @property
    def quota(self) -> Mapping[str, str]|None:
        return self._definition.get('quota')

    @property
    def var(self) -> str|None:
        return self._definition.get('var')
