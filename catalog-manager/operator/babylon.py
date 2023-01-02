import kubernetes_asyncio
import os
import requests

from rating import Rating

class Babylon():
    babylon_domain = os.environ.get('BABYLON_DOMAIN', 'babylon.gpte.redhat.com')
    babylon_api_version = os.environ.get('BABYLON_API_VERSION', 'v1')
    ratings_api = os.environ.get('RATINGS_API', 'http://babylon-ratings.babylon-ratings.svc.cluster.local:8080')

    catalog_display_name_annotation = f"{babylon_domain}/catalogDisplayName"
    catalog_item_display_name_annotation = f"{babylon_domain}/catalogItemDisplayName"
    catalog_item_name_label = f"{babylon_domain}/catalogItemName"
    catalog_item_namespace_label = f"{babylon_domain}/catalogItemNamespace"
    display_name_annotation = f"{babylon_domain}/displayName"
    catalog_item_rating_label = f"{babylon_domain}/rating"
    catalog_item_total_ratings = f"{babylon_domain}/totalRatings"

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

def get_rating_from_api(catalog_item, logger):
    try:
        response = requests.get(f"{Babylon.ratings_api}/ratings/v1/catalogitem/{catalog_item.name}")
        if response.status_code == 200:
            logger.info(f"/api/ratings/v1/catalogitem/{catalog_item.name} - {response.status_code}")
            return Rating(response.json().get('rating_score', None), response.json().get('total_ratings', 0))
        logger.warn(f"/api/ratings/v1/catalogitem/{catalog_item.name} - {response.status_code}")
    except:
        logger.error(f"Error: Invalid connection with {Babylon.ratings_api}")
        pass
    return Rating(None, 0)