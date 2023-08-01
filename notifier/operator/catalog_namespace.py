import kubernetes_asyncio

from babylon import Babylon

class CatalogNamespace:
    @classmethod
    async def get(cls, name):
        try:
            namespace = await Babylon.core_v1_api.read_namespace(name)
            return CatalogNamespace(namespace)
        except kubernetes_asyncio.client.rest.ApiException as e:
            if e.status == 404:
                return None
            else:
                raise

    def __init__(self, namespace):
        self.namespace = namespace

    @property
    def name(self):
        return self.namespace.metadata.name

    @property
    def display_name(self):
        return self.namespace.metadata.annotations.get('openshift.io/display-name', self.name)
