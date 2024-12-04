import kubernetes_asyncio
import os

class Babylon():
    babylon_domain = os.environ.get('BABYLON_DOMAIN', 'babylon.gpte.redhat.com')
    babylon_api_version = os.environ.get('BABYLON_API_VERSION', 'v1')
    poolboy_domain = os.environ.get('POOLBOY_DOMAIN', 'poolboy.gpte.redhat.com')
    poolboy_api_version = os.environ.get('POOLBOY_API_VERSION', 'v1')
    poolboy_namespace = os.environ.get('POOLBOY_NAMESPACE', 'poolboy')
    demo_domain = os.environ.get('DEMO_DOMAIN', 'demo.redhat.com')
    gpte_domain = os.environ.get('GPTE_DOMAIN', 'gpte.redhat.com')

    asset_uuid_label = f"{gpte_domain}/asset-uuid"
    babylon_ignore_label = f"{babylon_domain}/ignore"
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
    ordered_by_annotation = f"{demo_domain}/orderedBy"
    white_glove_label = f"{demo_domain}/white-glove"
    purpose_annotation = f"{demo_domain}/purpose"
    purpose_activity_annotation = f"{demo_domain}/purpose-activity"
    requester_annotation = f"{demo_domain}/requester"
    resource_broker_ignore_label = f"{poolboy_domain}/ignore"
    resource_claim_label = f"{poolboy_domain}/resource-claim"
    resource_pool_annotation = f"{poolboy_domain}/resource-pool-name"
    url_annotation = f"{babylon_domain}/url"
    workshop_label = f"{babylon_domain}/workshop"
    workshop_id_label = f"{babylon_domain}/workshop-id"
    workshop_uid_label = f"{babylon_domain}/workshop-uid"
    workshop_provision_label = f"{babylon_domain}/workshop-provision"
    salesforce_id_annotation = f"{demo_domain}/salesforce-id"
    user_name_label = f"{babylon_domain}/user-name"

    workshop_fail_percentage_threshold = int(os.environ.get('WORKSHOP_FAIL_PERCENTAGE_THRESHOLD', 60))

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
