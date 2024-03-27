from datetime import datetime, timezone

import kubernetes_asyncio

from babylon import Babylon

class KopfObject:
    @classmethod
    def from_definition(cls, definition):
        metadata = definition['metadata']
        return cls(
            annotations = metadata.get('annotations', {}),
            labels = metadata.get('labels', {}),
            meta = metadata,
            name = metadata['name'],
            namespace = metadata['namespace'],
            spec = definition['spec'],
            status = definition.get('status', {}),
            uid = metadata['uid'],
            definition = definition,
        )

    @classmethod
    async def fetch(cls, name, namespace):
        return cls.from_definition(await cls.fetch_definition(name=name, namespace=namespace))

    @classmethod
    async def fetch_definition(cls, name, namespace):
        return await Babylon.custom_objects_api.get_namespaced_custom_object(
            group = cls.api_group,
            name = name,
            namespace = namespace,
            plural = cls.plural,
            version = cls.api_version,
        )

    def __init__(self, annotations, labels, meta, name, namespace, spec, status, uid, definition=None, **_):
        self.annotations = annotations
        self.definition = definition
        self.labels = labels
        self.metadata = meta
        self.name = name
        self.namespace = namespace
        self.spec = spec
        self.status = status
        self.uid = uid

    def __str__(self):
        return f"{self.kind} {self.name} in {self.namespace}"

    @property
    def api_group_version(self):
        return f"{self.api_group}/{self.api_version}"

    @property
    def creation_datetime(self):
        return datetime.strptime(
            self.creation_timestamp, '%Y-%m-%dT%H:%M:%SZ'
        ).replace(tzinfo=timezone.utc)

    @property
    def creation_timestamp(self):
        return self.metadata['creationTimestamp']

    @property
    def deletion_timestamp(self):
        return self.metadata.get('deletionTimestamp')

    @property
    def is_deleting(self):
        return 'deletionTimestamp' in self.metadata

    @property
    def owner_references(self):
        return self.metadata.get('ownerReferences')

    def as_owner_ref(self):
        return {
            "apiVersion": self.api_group_version,
            "controller": True,
            "kind": self.kind,
            "name": self.name,
            "uid": self.uid,
        }

    def as_reference(self):
        return {
            "apiVersion": self.api_group_version,
            "kind": self.kind,
            "name": self.name,
            "namespace": self.namespace,
            "uid": self.uid,
        }

    def update(self, annotations, labels, meta, spec, status, uid, **_):
        self.annotations = annotations
        self.definition = None
        self.labels = labels
        self.metadata = meta
        self.spec = spec
        self.status = status
        self.uid = uid

    def update_from_definition(self, definition):
        metadata = definition['metadata']
        self.annotations = metadata.get('annotations', {})
        self.definition = definition
        self.labels = metadata.get('labels', {})
        self.metadata = metadata
        self.spec = definition['spec']
        self.status = definition.get('status', {})
        self.uid = metadata['uid']

    async def delete(self):
        try:
            definition = await Babylon.custom_objects_api.delete_namespaced_custom_object(
                group = self.api_group,
                name = self.name,
                namespace = self.namespace,
                plural = self.plural,
                version = self.api_version,
            )
            self.update_from_definition(definition)
        except kubernetes_asyncio.client.rest.ApiException as exception:
            if exception.status != 404:
                raise

    async def merge_patch(self, patch):
        definition = await Babylon.custom_objects_api.patch_namespaced_custom_object(
            group = self.api_group,
            name = self.name,
            namespace = self.namespace,
            plural = self.plural,
            version = self.api_version,
            body = patch,
            _content_type = 'application/merge-patch+json',
        )
        self.update_from_definition(definition)

    async def merge_patch_status(self, patch):
        definition = await Babylon.custom_objects_api.patch_namespaced_custom_object_status(
            group = self.api_group,
            name = self.name,
            namespace = self.namespace,
            plural = self.plural,
            version = self.api_version,
            body = {"status": patch},
            _content_type = 'application/merge-patch+json',
        )
        self.update_from_definition(definition)

    async def json_patch(self, patch):
        definition = await Babylon.custom_objects_api.patch_namespaced_custom_object(
            group = self.api_group,
            name = self.name,
            namespace = self.namespace,
            plural = self.plural,
            version = self.api_version,
            body = patch,
            _content_type = 'application/json-patch+json',
        )
        self.update_from_definition(definition)

    async def json_patch_status(self, patch):
        definition = await Babylon.custom_objects_api.patch_namespaced_custom_object_status(
            group = self.api_group,
            name = self.name,
            namespace = self.namespace,
            plural = self.plural,
            version = self.api_version,
            body = patch,
            _content_type = 'application/json-patch+json',
        )
        self.update_from_definition(definition)

    async def refresh(self):
        definition = await self.__class__.fetch_definition(name=self.name, namespace=self.namespace)
        self.update_from_definition(definition)

    async def replace(self, definition):
        updated_definition = await Babylon.custom_objects_api.replace_namespaced_custom_object(
            group = self.api_group,
            name = self.name,
            namespace = self.namespace,
            plural = self.plural,
            version = self.api_version,
            body = definition,
        )
        self.update_from_definition(updated_definition)
