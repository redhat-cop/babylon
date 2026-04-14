from __future__ import annotations
from typing import Any, Mapping

from datetime import datetime

from kubernetes_asyncio.client import (
    ApiException as KubernetesApiException
)

from .k8s_object import K8sObject
from .resourcereference import ResourceReference

class AnarchyRun(K8sObject):
    api_group = "anarchy.gpte.redhat.com"
    api_version = "v1"
    kind = "AnarchyRun"
    plural = "anarchyruns"
    api_group_version = f"{api_group}/{api_version}"

    def __init__(self, client, definition):
        super().__init__(client, definition)
        self.spec = AnarchyRunSpec(definition['spec'])
        self.status = (
            AnarchyRunStatus(definition['status'])
            if 'status' in definition else None
        )

    @property
    def is_active(self) -> bool:
        value = self.metadata.labels.get('anarchy.gpte.redhat.com/runner')
        if value.startswith('anarchy-runner-'):
            return True
        return self.state in {'failed', 'pending'}

    @property
    def is_finished(self) -> bool:
        return self.state in {'canceled', 'successful'}

    @property
    def is_queued(self) -> bool:
        return self.state == 'queued'

    @property
    def runner_pod_name(self) -> str|None:
        value = self.metadata.labels.get('anarchy.gpte.redhat.com/runner')
        if value.startswith('anarchy-runner-'):
            return value
        return None

    @property
    def state(self) -> str|None:
        value = self.metadata.labels.get('anarchy.gpte.redhat.com/runner')
        if value in {'canceled', 'failed', 'pending', 'queued', 'successful'}:
            return value
        if value.startswith('anarchy-runner-'):
            return 'running'
        return None

    async def check_runner_pod_exists(self) -> bool:
        if self.runner_pod_name is None:
            return True
        try:
            await self.client.core_v1_api.read_namespaced_pod(
                name=self.runner_pod_name,
                namespace=self.metadata.namespace,
            )
            return True
        except KubernetesApiException as exception:
            if exception.status == 404:
                return False
            raise

    async def set_runner_state(self, value) -> None:
        await self.patch({
            "metadata": {
                "labels": {
                    "anarchy.gpte.redhat.com/runner": "pending",
                }
            }
        })

class AnarchyRunSpec:
    def __init__(self, definition):
        self.definition = definition

class AnarchyRunStatus:
    def __init__(self, definition):
        self.definition = definition

    @property
    def retry_after_datetime(self) -> datetime|None:
        ts = self.retry_after_timestamp
        if ts is None:
            return None
        return datetime.strptime(ts, '%Y-%m-%dT%H:%M:%S%z') 

    @property
    def retry_after_timestamp(self) -> str|None:
        return self.definition.get('retryAfter')

    @property
    def run_post_datetime(self) -> datetime|None:
        ts = self.run_post_timestamp
        if ts is None:
            return None
        return datetime.strptime(ts, '%Y-%m-%dT%H:%M:%S%z') 

    @property
    def run_post_timestamp(self) -> str|None:
        return self.definition.get('runPostTimestamp')
