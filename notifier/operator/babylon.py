import kubernetes_asyncio
import os

class Babylon():
    babylon_domain = os.environ.get('BABYLON_DOMAIN', 'babylon.gpte.redhat.com')
    babylon_api_version = os.environ.get('BABYLON_API_VERSION', 'v1')
    resource_broker_domain = os.environ.get('RESOURCE_BROKER_DOMAIN', 'poolboy.gpte.redhat.com')
    resource_broker_api_version = os.environ.get('RESOURCE_BROKER_API_VERSION', 'v1')
    email_recipient_annotation = os.environ.get('EMAIL_RECIPIENT_ANNOTATION')

    babylon_ignore_label = f"{babylon_domain}/ignore"
    notifier_config_annotation = f"{babylon_domain}/notifierConfig"
    resource_broker_ignore_label = f"{resource_broker_domain}/ignore"

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
        cls.custom_objects_api = kubernetes_asyncio.client.CustomObjectsApi(cls.api_client)
