from __future__ import annotations
from typing import Any, Generator, Mapping

from .k8s_object import K8sObject
from .resourcereference import ResourceReference

class AnarchySubject(K8sObject):
    api_group = "anarchy.gpte.redhat.com"
    api_version = "v1"
    kind = "AnarchySubject"
    plural = "anarchysubjects"
    api_group_version = f"{api_group}/{api_version}"

    def __init__(self, client, definition):
        super().__init__(client, definition)
        self.spec = AnarchySubjectSpec(definition['spec'])
        self.status = (
            AnarchySubjectStatus(definition['status'])
            if 'status' in definition else None
        )

    async def get_anarchy_run(self, name:str) -> AnarchyRun:
        return await self.client.get_anarchy_run(
            name=name,
            namespace=self.namespace,
        )

    async def list_anarchy_runs(self) -> Generator[AnarchyRun, None, None]:
        async for anarchy_run in self.client.list_anarchy_runs_for_anarchy_subject(self):
            yield anarchy_run

class AnarchySubjectSpec:
    def __init__(self, definition):
        self.definition = definition

class AnarchySubjectStatus:
    def __init__(self, definition):
        self.__definition = definition

    @property
    def runs(self) -> AnarchySubjectStatusRuns:
        return AnarchySubjectStatusRuns(self.__definition.get('runs', {}))

class AnarchySubjectStatusRuns:
    def __init__(self, definition):
        self.__definition = definition

    @property
    def active(self) -> list[AnarchySubjectStatusRunsActive]:
        return [
            ResourceReference(item) for item in self.__definition.get('active', [])
        ]
