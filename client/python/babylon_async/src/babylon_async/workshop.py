from __future__ import annotations
from typing import Any, Mapping

from .k8s_object import K8sObject

class Workshop(K8sObject):
    api_group = "babylon.gpte.redhat.com"
    api_version = "v1"
    kind = "Workshop"
    plural = "workshops"
    api_group_version = f"{api_group}/{api_version}"

    def __init__(self, client, definition):
        super().__init__(client, definition)
        self.spec = WorkshopSpec(definition['spec'])
        self.status = (
            WorkshopStatus(definition['status'])
            if 'status' in definition else None
        )

    async def list_workshop_provisions(self) -> Generator[WorkshopProvision, None, None]:
        async for workshop_provision in self.client.list_workshop_provisions(
            label_selector=f"babylon.gpte.redhat.com/workshop={self.name}",
            namespace=self.namespace,
        ):
            yield workshop_provision

class WorkshopSpec:
    def __init__(self, definition):
        self.__definition = definition

class WorkshopStatus:
    def __init__(self, definition):
        self.__definition = definition
