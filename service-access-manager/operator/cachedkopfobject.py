import asyncio

from babylon import Babylon
from kopfobject import KopfObject

class CachedKopfObject(KopfObject):
    @classmethod
    def cache_key_from_kwargs(cls, name, namespace, **kwargs):
        return (namespace, name)

    @classmethod
    def load(cls, name, namespace, **kwargs):
        key = cls.cache_key_from_kwargs(name=name, namespace=namespace, **kwargs)
        obj = cls.cache.get(key)
        if obj:
            obj.update(**kwargs)
            return obj

        obj = cls(name=name, namespace=namespace, **kwargs)
        obj.cache[key] = obj
        return obj

    @classmethod
    async def get(cls, name, namespace):
        key = (namespace, name)
        if key in cls.cache:
            return cls.cache[key]
        obj = await cls.fetch(name, namespace)
        cls.cache[key] = obj
        return obj

    @classmethod
    async def list(cls, namespace, label_selector=None):
        async for definition in cls.list_definitions(namespace=namespace, label_selector=label_selector):
            cache_key = cls.cache_key_from_kwargs(
                name = definition['metadata']['name'],
                namespace = definition['metadata'].get('namespace'),
                spec = definition.get('spec'),
            )
            obj = cls.cache.get(cache_key)
            if obj:
                obj.update_from_definition(definition)
            else:
                obj = cls.from_definition(definition)
                cls.cache[obj.cache_key] = obj
            yield obj

    @classmethod
    async def preload(cls):
        _continue = None
        while True:
            obj_list = await Babylon.custom_objects_api.list_cluster_custom_object(
                group = cls.api_group,
                plural = cls.plural,
                version = cls.api_version,
                limit = 20,
                _continue = _continue
            )
            for definition in obj_list.get('items', []):
                obj = cls.from_definition(definition)
                cls.cache[obj.cache_key] = obj
            _continue = obj_list['metadata'].get('continue')
            if not _continue:
                return

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.lock = asyncio.Lock()

    @property
    def cache_key(self):
        return (self.namespace, self.name)

    async def delete(self):
        await super().delete()
        self.cache.pop(self.cache_key)
