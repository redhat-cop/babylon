import os
import kubernetes_asyncio
import yaml

class Babylon():
    agnosticv_api_group = os.environ.get('AGNOSTICV_API_GROUP', 'gpte.redhat.com')
    agnosticv_version = os.environ.get('AGNOSTICV_VERSION', 'v1')
    anarchy_api_group = os.environ.get('ANARCHY_API_GROUP', 'anarchy.gpte.redhat.com')
    anarchy_version = os.environ.get('ANARCHY_VERSION', 'v1')
    catalog_api_group = os.environ.get('CATALOG_API_GROUP', 'babylon.gpte.redhat.com')
    catalog_version = os.environ.get('CATALOG_VERSION', 'v1')
    resource_broker_api_group = os.environ.get('RESOURCE_BROKER_API_GROUP', 'poolboy.gpte.redhat.com')
    resource_broker_version = os.environ.get('RESOURCE_BROKER_VERSION', 'v1')
    resource_broker_namespace = os.environ.get('RESOURCE_BROKER_NAMESPACE', 'poolboy')
    default_polling_interval = os.environ.get('POLLING_INTERVAL', '1m')
    execution_environment_allow_list = yaml.safe_load(os.environ.get('EXECUTION_ENVIRONMENT_ALLOW_LIST', '[]'))

    agnosticv_repo_label = f"{agnosticv_api_group}/AgnosticVRepo"
    anarchy_api_version = f"{anarchy_api_group}/{anarchy_version}"
    catalog_api_version = f"{catalog_api_group}/{catalog_version}"
    last_update_annotation = f"{agnosticv_api_group}/last-update"
    resource_broker_api_version = f"{resource_broker_api_group}/{resource_broker_version}"

    @classmethod
    async def on_cleanup(cls):
        await cls.api_client.close()

    @classmethod
    async def on_startup(cls):
        if os.path.exists('/run/secrets/kubernetes.io/serviceaccount'):
            kubernetes_asyncio.config.load_incluster_config()
            with open('/run/secrets/kubernetes.io/serviceaccount/namespace') as f:
                cls.namespace = f.read()
        else:
            await kubernetes_asyncio.config.load_kube_config()
            if 'OPERATOR_NAMESPACE' in os.environ:
                cls.namespace = os.environ['OPERATOR_NAMESPACE']
            else:
                raise Exception(
                    'Unable to determine operator namespace. '
                    'Please set OPERATOR_NAMESPACE environment variable.'
                )

        cls.api_client = kubernetes_asyncio.client.ApiClient()
        cls.core_v1_api = kubernetes_asyncio.client.CoreV1Api(cls.api_client)
        cls.custom_objects_api = kubernetes_asyncio.client.CustomObjectsApi(cls.api_client)
