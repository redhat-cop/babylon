import asyncio

from babylon import Babylon
from kopfobject import KopfObject

class CachedKopfObject(KopfObject):
    @classmethod
    def load(cls, name, namespace, **kwargs):
        key = (namespace, name)
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
                cls.cache[(obj.namespace, obj.name)] = obj
            _continue = obj_list['metadata'].get('continue')
            if not _continue:
                return

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.lock = asyncio.Lock()
