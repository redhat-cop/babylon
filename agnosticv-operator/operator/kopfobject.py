import kopf
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
        )

    @classmethod
    async def create(cls, definition):
        definition['apiVersion'] = cls.api_version
        definition['kind'] = cls.kind
        return cls.from_definition(
            await Babylon.custom_objects_api.create_namespaced_custom_object(
                group = cls.api_group,
                namespace = definition['metadata']['namespace'],
                plural = cls.plural,
                version = cls.version,
                body = definition,
            )
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
            version = cls.version,
        )

    @classmethod
    async def list(cls, namespace, label_selector=None, batch_limit=50):
        _continue = None
        while True:
            resp = await Babylon.custom_objects_api.list_namespaced_custom_object(
                group = cls.api_group,
                namespace = namespace,
                plural = cls.plural,
                version = cls.version,
                label_selector = label_selector,
                limit = batch_limit,
                _continue = _continue,
            )
            for definition in resp['items']:
                yield cls.from_definition(definition)
            _continue = resp['metadata'].get('continue')
            if not _continue:
                break



    def __init__(self, annotations, labels, meta, name, namespace, spec, status, uid, **_):
        self.annotations = annotations
        self.labels = labels
        self.metadata = meta
        self.name = name
        self.namespace = namespace
        self.spec = spec
        self.status = status
        self.uid = uid

    def __str__(self):
        return f"{self.kind} {self.name}"

    @property
    def creation_timestamp(self):
        return self.metadata['creationTimestamp']

    @property
    def deletion_timestamp(self):
        return self.metadata.get('deletionTimestamp')

    @property
    def finalizers(self):
        return self.metadata.get('finalizers', [])

    @property
    def is_deleting(self):
        return 'deletionTimestamp' in self.metadata

    def as_owner_ref(self):
        return {
            "apiVersion": self.api_version,
            "controller": True,
            "kind": self.kind,
            "name": self.name,
            "uid": self.uid,
        }

    def as_reference(self):
        return {
            "apiVersion": self.api_version,
            "kind": self.kind,
            "name": self.name,
            "namespace": self.namespace,
            "uid": self.uid,
        }

    def update(self, annotations, labels, meta, spec, status, uid, **_):
        self.annotations = annotations
        self.labels = labels
        self.metadata = meta
        self.spec = spec
        self.status = status
        self.uid = uid

    def update_from_definition(self, definition):
        metadata = definition['metadata']
        self.annotations = metadata.get('annotations', {})
        self.labels = metadata.get('labels', {})
        self.metadata = metadata
        self.spec = definition['spec']
        self.status = definition.get('status', {})
        self.uid = metadata['uid']

    async def delete(self):
        definition = await Babylon.custom_objects_api.delete_namespaced_custom_object(
            group = self.api_group,
            name = self.name,
            namespace = self.namespace,
            plural = self.plural,
            version = self.version,
        )
        if definition['kind'] == self.kind:
            self.update_from_definition(definition)

    async def merge_patch(self, patch):
        definition = await Babylon.custom_objects_api.patch_namespaced_custom_object(
            group = self.api_group,
            name = self.name,
            namespace = self.namespace,
            plural = self.plural,
            version = self.version,
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
            version = self.version,
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
            version = self.version,
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
            version = self.version,
            body = patch,
            _content_type = 'application/json-patch+json',
        )
        self.update_from_definition(definition)

    async def refresh(self):
        definition = await self.__class__.fetch_definition(self.name)
        self.update_from_definition(definition)

    async def raise_error_if_still_exists(self, msg):
        try:
            await self.refresh()
            raise kopf.TemporaryError(msg, delay=60)
        except kubernetes_asyncio.client.rest.ApiException as e:
            if e.status != 404:
                raise
