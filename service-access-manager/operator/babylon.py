import kubernetes_asyncio
import os

class Babylon():
    babylon_domain = os.environ.get('BABYLON_DOMAIN', 'babylon.gpte.redhat.com')
    babylon_api_version = os.environ.get('BABYLON_API_VERSION', 'v1')
    poolboy_domain = os.environ.get('POOLBOY_DOMAIN', 'poolboy.gpte.redhat.com')
    poolboy_api_version = os.environ.get('POOLBOY_API_VERSION', 'v1')
    poolboy_namespace = os.environ.get('POOLBOY_NAMESPACE', 'poolboy')
    workshop_label = f"{babylon_domain}/workshop"

    babylon_ignore_label = f"{babylon_domain}/ignore"
    resource_broker_ignore_label = f"{poolboy_domain}/ignore"
    service_access_annotation = f"{babylon_domain}/service-access"

    @classmethod
    async def on_cleanup(cls):
        await cls.api_client.close()

    @classmethod
    async def on_startup(cls):
        if os.path.exists('/run/secrets/kubernetes.io/serviceaccount'):
            kubernetes_asyncio.config.load_incluster_config()
        else:
            await kubernetes_asyncio.config.load_kube_config()

        cls.api_client = kubernetes_asyncio.client.ApiClient()
        cls.core_v1_api = kubernetes_asyncio.client.CoreV1Api(cls.api_client)
        cls.rbac_authorization_api = kubernetes_asyncio.client.RbacAuthorizationV1Api(cls.api_client)
        cls.custom_objects_api = kubernetes_asyncio.client.CustomObjectsApi(cls.api_client)
