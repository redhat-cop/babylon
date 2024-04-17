from datetime import datetime, timezone

import kubernetes_asyncio

from babylon import Babylon

class K8sObject:
    @classmethod
    async def create(cls, definition):
        return cls(
            await Babylon.custom_objects_api.create_namespaced_custom_object(
                group = cls.api_group,
                namespace = definition['metadata']['namespace'],
                plural = cls.plural,
                version = cls.api_version,
                body = definition,
            )
        )

    @classmethod
    async def fetch(cls, name, namespace):
        return cls(await cls.fetch_definition(name, namespace))

    @classmethod
    async def fetch_definition(cls, name, namespace):
        return await Babylon.custom_objects_api.get_namespaced_custom_object(
            group = cls.api_group,
            name = name,
            namespace = namespace,
            plural = cls.plural,
            version = cls.api_version,
        )

    @classmethod
    async def list(cls, namespace, label_selector=None):
        _continue = None
        while True:
            obj_list = await Babylon.custom_objects_api.list_namespaced_custom_object(
                group = cls.api_group,
                label_selector = label_selector,
                namespace = namespace,
                plural = cls.plural,
                version = cls.api_version,
                limit = 20,
                _continue = _continue
            )
            for definition in obj_list.get('items', []):
                yield cls(definition=definition)
            _continue = obj_list['metadata'].get('continue')
            if not _continue:
                return

    def __init__(self, definition):
        self.definition = definition

    def __str__(self):
        return f"{self.kind} {self.name} in {self.namespace}"

    @property
    def annotations(self):
        return self.metadata.get('annotations', {})

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
    def labels(self):
        return self.metadata.get('labels', {})

    @property
    def metadata(self):
        return self.definition['metadata']

    @property
    def name(self):
        return self.metadata['name']

    @property
    def namespace(self):
        return self.metadata['namespace']

    @property
    def spec(self):
        return self.definition['spec']

    @property
    def status(self):
        return self.definition.get('status', {})

    @property
    def uid(self):
        return self.metadata['uid']

    def as_owner_ref(self):
        return {
            "apiVersion": self.api_group_version,
            "controller": True,
            "kind": self.kind,
            "name": self.name,
            "uid": self.uid,
        }

    async def delete(self):
        try:
            definition = await Babylon.custom_objects_api.delete_namespaced_custom_object(
                group = self.api_group,
                name = self.name,
                namespace = self.namespace,
                plural = self.plural,
                version = self.api_version,
            )
            self.definition = definition
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
        self.definition = definition

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
        self.definition = definition
