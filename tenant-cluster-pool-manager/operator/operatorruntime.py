import kubernetes_asyncio
import os

from babylon_async import BabylonClient

from sandboxapi import SandboxAPI

class OperatorRuntime():
    babylon_domain = os.environ.get('BABYLON_DOMAIN', 'babylon.gpte.redhat.com')
    babylon_api_version = os.environ.get('BABYLON_API_VERSION', 'v1')
    poolboy_domain = os.environ.get('POOLBOY_DOMAIN', 'poolboy.gpte.redhat.com')
    poolboy_api_version = os.environ.get('POOLBOY_API_VERSION', 'v1')
    poolboy_namespace = os.environ.get('POOLBOY_NAMESPACE', 'poolboy')

    babylon_ignore_label = f"{babylon_domain}/ignore"
    poolboy_ignore_label = f"{poolboy_domain}/ignore"
    tenant_cluster_action_annotation = f"{babylon_domain}/tenant-cluster-action"
    tenant_cluster_pool_annotation = f"{babylon_domain}/tenant-cluster-pool"
    tenant_cluster_pool_label = f"{babylon_domain}/tenant-cluster-pool"

    sandbox_api_auth_token = os.environ.get('SANDBOX_API_AUTH_TOKEN')
    sandbox_api_url = os.environ.get('SANDBOX_API_URL')

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
        cls.babylon = await BabylonClient.create(api_client=cls.api_client)

        cls.sandbox_api = SandboxAPI(
            cls.sandbox_api_url,
            cls.sandbox_api_auth_token,
        )
        await cls.sandbox_api.connect()
