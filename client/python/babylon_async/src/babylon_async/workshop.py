from __future__ import annotations
from typing import Generator

from .k8s_object import K8sObject
from .workshopprovision import WorkshopProvision

class Workshop(K8sObject):
    api_group = "babylon.gpte.redhat.com"
    api_version = "v1"
    kind = "Workshop"
    plural = "workshops"
    api_group_version = f"{api_group}/{api_version}"

    @property
    def spec(self) -> WorkshopSpec:
        return WorkshopSpec(self._definition['spec'])

    @property
    def status(self) -> WorkshopStatus|None:
        if 'status' not in self._definition:
            return None
        return WorkshopStatus(self._definition['status'])

    async def list_workshop_provisions(self) -> Generator[WorkshopProvision, None, None]:
        async for workshop_provision in self.client.list_workshop_provisions(
            label_selector=f"babylon.gpte.redhat.com/workshop={self.name}",
            namespace=self.namespace,
        ):
            yield workshop_provision

class WorkshopSpec:
    def __init__(self, definition):
        self._definition = definition

class WorkshopStatus:
    def __init__(self, definition):
        self._definition = definition
