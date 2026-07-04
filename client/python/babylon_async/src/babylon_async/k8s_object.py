from collections.abc import Mapping

from datetime import datetime

from copy import deepcopy
from typing import List

class K8sObject:
    @classmethod
    async def create(cls, client,
        definition:Mapping,
        name:str|None=None,
        namespace:str|None=None,
        owner:K8sObject|None=None
    ):
        if 'metadata' not in definition:
            definition['metadata'] = {}

        if name is not None:
            if name.endswith('*'):
                definition['metadata']['generateName'] = name[:-1]
            else:
                definition['metadata']['name'] = name

        if owner is not None:
            definition['metadata']['ownerReferences'] = [owner.as_owner_reference()]

        definition = await client.create_object(
            definition=definition,
            group=cls.api_group,
            namespace=namespace,
            plural=cls.plural,
            version=cls.api_version,
        )
        return cls(client=client, definition=definition)

    @classmethod
    async def get(cls, client, name:str, namespace:str|None=None, cache:bool=False):
        if cache and hasattr(cls, '__cache__') and (name, namespace) in cls.__cache__:
            return cls.__cache__.get((name, namespace))

        definition = await client.get_object(
            group=cls.api_group,
            name=name,
            namespace=namespace,
            plural=cls.plural,
            version=cls.api_version,
        )
        obj = cls(client=client, definition=definition)
        if cache:
            obj.__cache_put()
        return obj

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

    def __init__(self, client, definition):
        self.client = client
        self._definition = definition

    def __str__(self) -> str:
        if self.namespace is None:
            return f"{self.kind} {self.name}"
        return f"{self.kind} {self.name} in {self.namespace}"

    @property
    def creation_datetime(self) -> datetime:
        return self.metadata.creation_datetime

    @property
    def creation_timestamp(self) -> str:
        return self.metadata.creation_timestamp

    @property
    def metadata(self) -> K8sObjectMetadata:
        return K8sObjectMetadata(
            self._definition['metadata'],
        )

    @property
    def name(self) -> str:
        return self.metadata.name

    @property
    def namespace(self) -> str|None:
        return self.metadata.namespace

    @property
    def uid(self) -> str:
        return self.metadata.uid

    def __cache_put(self) -> None:
        cls = self.__class__
        if not hasattr(cls, '__cache__'):
            setattr(cls, '__cache__', {})
        cls.__cache__[(self.name, self.namespace)] = self

    def as_owner_reference(self,
        block_owner_deletion:bool|None=None,
        controller:bool=True,
    ) -> mapping:
        """Return reference mapping to object for use as owner reference."""
        ret = self.as_reference()
        if block_owner_deletion is not None:
            ret['blockOwnerDeletion'] = block_owner_deletion
        ret['controller'] = controller
        return ret

    def as_reference(self) -> Mapping:
        """Return reference mapping to object."""
        ret = {
            "apiVersion": self.api_group_version,
            "kind": self.kind,
            "name": self.name,
        }
        if self.namespace is not None:
            ret['namespace'] = self.namespace
        return ret

    def get_definition(self) -> Mapping:
        return deepcopy(self._definition)

    def update_definition(self, definition: Mapping) -> None:
        self._definition = definition
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
        self._definition = definition

    @property
    def annotations(self) -> Mapping[str, str]:
        return self._definition.get('annotations', {})

    @property
    def creation_datetime(self) -> datetime:
        return datetime.strptime(self._definition['creationTimestamp'], '%Y-%m-%dT%H:%M:%S%z')

    @property
    def creation_timestamp(self) -> str:
        return self._definition['creationTimestamp']

    @property
    def finalizers(self) -> List[str]|None:
        return self._definition.get('finalizers')

    @property
    def labels(self) -> Mapping[str, str]:
        return self._definition.get('labels', {})

    @property
    def name(self) -> str:
        return self._definition['name']

    @property
    def namespace(self) -> str|None:
        return self._definition.get('namespace')

    @property
    def owner_references(self) -> List[K8sObjectMetadataOwnerReference]|None:
        if 'ownerReferences' not in self._definition:
            return None
        return [
            K8sObjectMetadataOwnerReference(item)
            for item in self._definition['ownerReferences']
        ]

    @property
    def uid(self) -> str:
        return self._definition.get('uid')

class K8sObjectMetadataOwnerReference:
    def __init__(self, definition):
        self._definition = definition

    @property
    def api_version(self) -> str:
        return self._definition['apiVersion']

    @property
    def controller(self) -> bool:
        return self._definition['controller']

    @property
    def kind(self) -> str:
        return self._definition['kind']

    @property
    def name(self) -> str:
        return self._definition['name']

    @property
    def uid(self) -> str:
        return self._definition['uid']
