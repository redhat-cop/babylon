from collections.abc import Mapping

from datetime import datetime

from copy import deepcopy
from typing import List, TypedDict

class K8sObject:
    def __init__(self, client, definition):
        self.client = client
        self.definition = definition
        self.metadata = K8sObjectMetadata(definition['metadata'])

    def __str__(self) -> str:
        if self.namespace is None:
            return f"{self.kind} {self.name}"
        return f"{self.kind} {self.name} in {self.namespace}"

    @classmethod
    async def get(cls, client, name:str, namespace:str|None=None):
        definition = await client.get_object(
            group=cls.api_group,
            name=name,
            namespace=namespace,
            plural=cls.plural,
            version=cls.api_version,
        )
        return cls(client=client, definition=definition)

    @classmethod
    async def list(cls,
        client,
        label_selector:str|None=None,
        namespace:str|None=None,
    ) -> Mapping:
        async for definition in client.list_object(
            group=cls.api_group,
            label_selector=label_selector,
            namespace=namespace,
            plural=cls.plural,
            version=cls.api_version,
        ):
            yield cls(client=client, definition=definition)

    @property
    def name(self) -> str:
        return self.metadata.name

    @property
    def namespace(self) -> str|None:
        return self.metadata.namespace

    @property
    def uid(self) -> str:
        return self.metadata.uid

    def update_definition(self, definition: Mapping) -> None:
        self.definition = definition
        self.metadata = K8sObjectMetadata(definition['metadata'])

    async def patch(self, patch: Mapping|List[Mapping]) -> None:
        """Apply patch to object and update definition."""
        definition = await self.client.patch_object(
            group=self.api_group,
            name=self.metadata.name,
            namespace=self.metadata.namespace,
            patch=patch,
            plural=self.plural,
            version=self.api_version,
        )
        self.update_definition(definition)

    async def patch_status(self, patch: Mapping|List[Mapping]) -> None:
        """Apply json patch to object and update definition."""
        definition = await self.client.patch_object_status(
            group=self.api_group,
            name=self.metadata.name,
            namespace=self.metadata.namespace,
            patch=patch,
            plural=self.plural,
            version=self.api_version,
        )
        self.update_definition(definition)

class K8sObjectMetadata:
    def __init__(self, definition):
        self.definition = definition
        self.owner_references = (
            [K8sObjectMetadataOwnerReference(item) for item in definition['ownerReferences']]
            if 'ownerReferences' in definition else None
        )

    @property
    def annotations(self) -> Mapping[str, str]:
        return self.definition.get('annotations', {})

    @property
    def creation_datetime(self) -> datetime:
        return datetime.strptime(self.definition['creationTimestamp'], '%Y-%m-%dT%H:%M:%S%z') 

    @property
    def creation_timestamp(self) -> str:
        return self.definition['creationTimestamp']

    @property
    def finalizers(self) -> List[str]|None:
        return self.definition.get('finalizers')

    @property
    def labels(self) -> Mapping[str, str]:
        return self.definition.get('labels', {})

    @property
    def name(self) -> str:
        return self.definition['name']

    @property
    def namespace(self) -> str|None:
        return self.definition.get('namespace')

    @property
    def uid(self) -> str:
        return self.definition.get('uid')

class K8sObjectMetadataOwnerReference:
    def __init__(self, definition):
        self.definition = definition

    @property
    def api_version(self) -> str:
        return self.definition['apiVersion']

    @property
    def controller(self) -> bool:
        return self.definition['controller']

    @property
    def kind(self) -> str:
        return self.definition['kind']

    @property
    def name(self) -> str:
        return self.definition['name']

    @property
    def uid(self) -> str:
        return self.definition['uid']
