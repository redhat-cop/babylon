import kubernetes_asyncio
import os

class Babylon():
    babylon_domain = os.environ.get('BABYLON_DOMAIN', 'babylon.gpte.redhat.com')
    babylon_api_version = os.environ.get('BABYLON_API_VERSION', 'v1')

    @classmethod
    async def on_cleanup(cls):
        await cls.core_v1_api.api_client.close()
        await cls.custom_objects_api.api_client.close()

    @classmethod
    async def on_startup(cls):
        if os.path.exists('/run/secrets/kubernetes.io/serviceaccount'):
            kubernetes_asyncio.config.load_incluster_config()
        else:
            await kubernetes_asyncio.config.load_kube_config()

        cls.core_v1_api = kubernetes_asyncio.client.CoreV1Api()
        cls.custom_objects_api = kubernetes_asyncio.client.CustomObjectsApi()
