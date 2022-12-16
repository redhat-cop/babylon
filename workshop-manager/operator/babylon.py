import kubernetes_asyncio
import os

class Babylon():
    babylon_domain = os.environ.get('BABYLON_DOMAIN', 'babylon.gpte.redhat.com')
    babylon_api_version = os.environ.get('BABYLON_API_VERSION', 'v1')
    poolboy_domain = os.environ.get('POOLBOY_DOMAIN', 'poolboy.gpte.redhat.com')
    poolboy_api_version = os.environ.get('POOLBOY_API_VERSION', 'v1')
    poolboy_namespace = os.environ.get('POOLBOY_NAMESPACE', 'poolboy')
    demo_domain = os.environ.get('DEMO_DOMAIN', 'demo.redhat.com')

    catalog_display_name_annotation = f"{babylon_domain}/catalogDisplayName"
    catalog_item_display_name_annotation = f"{babylon_domain}/catalogItemDisplayName"
    catalog_item_name_label = f"{babylon_domain}/catalogItemName"
    catalog_item_namespace_label = f"{babylon_domain}/catalogItemNamespace"
    display_name_annotation = f"{babylon_domain}/displayName"
    finalizer_value = f"{babylon_domain}/workshop-manager"
    lab_ui_label = f"{babylon_domain}/labUserInterface"
    lab_ui_url_annotation = f"{babylon_domain}/labUserInterfaceUrl"
    lab_ui_urls_annotation = f"{babylon_domain}/labUserInterfaceUrls"
    notifier_annotation = f"{babylon_domain}/notifier"
    requester_annotation = f"{babylon_domain}/requester"
    resource_pool_annotation = f"{poolboy_domain}/resource-pool-name"
    url_annotation = f"{babylon_domain}/url"
    workshop_label = f"{babylon_domain}/workshop"
    workshop_id_label = f"{babylon_domain}/workshop-id"
    workshop_provision_label = f"{babylon_domain}/workshop-provision"
    purpose_annotation = f"{demo_domain}/purpose"
    purpose_activity_annotation = f"{demo_domain}/purpose-activity"
    salesforce_id_annotation = f"{demo_domain}/salesforce-id"

    @classmethod
    async def on_cleanup(cls):
        cls.core_v1_api.api_client.close()
        cls.custom_objects_api.api_client.close()

    @classmethod
    async def on_startup(cls):
        if os.path.exists('/run/secrets/kubernetes.io/serviceaccount'):
            kubernetes_asyncio.config.load_incluster_config()
        else:
            await kubernetes_asyncio.config.load_kube_config()

        cls.core_v1_api = kubernetes_asyncio.client.CoreV1Api()
        cls.custom_objects_api = kubernetes_asyncio.client.CustomObjectsApi()
