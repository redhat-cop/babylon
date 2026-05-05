from __future__ import annotations
from typing import Any, Mapping

from datetime import datetime

from kubernetes_asyncio.client import (
    ApiException as KubernetesApiException
)

from .k8s_object import K8sObject
from .resourcereference import ResourceReference

class AnarchyGovernor(K8sObject):
    api_group = "anarchy.gpte.redhat.com"
    api_version = "v1"
    kind = "AnarchyGovernor"
    plural = "anarchygovernors"
    api_group_version = f"{api_group}/{api_version}"

    def __init__(self, client, definition):
        super().__init__(client, definition)
        self.spec = AnarchyGovernorSpec(definition['spec'])

    @property
    def job_vars(self) -> Mapping:
        return self.spec.job_vars

    @property
    def vars(self) -> Mapping:
        return self.spec.vars

class AnarchyGovernorSpec:
    def __init__(self, definition):
        self.__definition = definition

    @property
    def job_vars(self) -> Mapping:
        return self.__definition.get('vars', {}).get('job_vars', {})

    @property
    def vars(self) -> Mapping:
        return self.__definition.get('vars', {})
