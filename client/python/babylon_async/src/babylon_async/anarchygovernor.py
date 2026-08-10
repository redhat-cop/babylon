from __future__ import annotations
from copy import deepcopy
from typing import List, Mapping

from .exceptions import BabylonApiException
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
        return AnarchyGovernorSpec(self._definition['spec'])

    @property
    def vars(self) -> Mapping:
        return self.spec.vars

    async def update_from_agnosticv(self,
        definition: Mapping,
        dry_run: bool=False
    ) -> bool:
        """Update AnarchyGovernor with definition from AgnosticVComponent.
        Return boolean to indicate if definition required update."""
        while True:
            merged = self.get_definition()
            # All of spec managed from AgnosticV
            merged['spec'] = definition['spec']
            # All annotations managed from AgnosticV
            merged['metadata']['annotations'] = definition['metadata']['annotations']
            # All labels managed from AgnosticV
            merged['metadata']['labels'] = definition['metadata']['labels']

            if merged == self._definition:
                return False
            if dry_run:
                return True

            try:
                await self.replace_definition(merged)
                return True
            except BabylonApiException as err:
                if err.status != 409:
                    raise
                await self.refresh()

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
