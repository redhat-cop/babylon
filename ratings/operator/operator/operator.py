#!/usr/bin/env python3

import kopf
import kubernetes
import logging
import os
import requests
import asyncio
from infinite_relative_backoff import InfiniteRelativeBackoff
from catalog_item import CatalogItem

babylon_domain = os.environ.get('BABYLON_DOMAIN', 'babylon.gpte.redhat.com')
babylon_api_version = os.environ.get('BABYLON_API_VERSION', 'v1')
ratings_api = os.environ.get('RATINGS_API', 'babylon-ratings-api')

rating_label = f"{babylon_domain}/rating"

if os.path.exists('/run/secrets/kubernetes.io/serviceaccount'):
    kubernetes.config.load_incluster_config()
else:
    kubernetes.config.load_kube_config()

core_v1_api = kubernetes.client.CoreV1Api()
custom_objects_api = kubernetes.client.CustomObjectsApi()

def set_rating(rating_score, catalog_item, logger):
    custom_objects_api.patch_namespaced_custom_object(
        babylon_domain,
        babylon_api_version,
        catalog_item.namespace,
        'catalogitems',
        catalog_item.name,
        {
            "metadata": {
                "labels": {
                    rating_label: rating_score,
                }
            }
        }
    )

def list_catalog_namespaces(logger, interface_name = None):
    response_namespaces = core_v1_api.list_namespace(
        label_selector = f"babylon.gpte.redhat.com/interface={interface_name}" if interface_name else 'babylon.gpte.redhat.com/catalog'
    )
    namespaces = list(map(lambda n: n.metadata.name, response_namespaces.items))
    logger.info(f"Namespace list: {namespaces}")
    return namespaces

def list_catalog_items(namespace, logger):
    _continue = None
    if not namespace:
        logger.error(f"Namespace invalid: {namespace}")
        return
    logger.info(f"List catalog items for: {namespace}")
    while True:
        catalog_items_list = custom_objects_api.list_namespaced_custom_object(
            babylon_domain, babylon_api_version, namespace, 'catalogitems',
            limit = 20, _continue = _continue
        )
        for catalog_item_definition in catalog_items_list.get('items', []):
            yield CatalogItem(definition=catalog_item_definition)
        _continue = catalog_items_list['metadata'].get('continue')
        if not _continue:
            return

def get_rating(catalog_item, logger):
    response = requests.get(f"{ratings_api}/ratings/v1/catalogitem/{catalog_item.name}")
    logger.info(f"/api/ratings/v1/catalogitem/{catalog_item.name} - {response.status_code}")
    if response.status_code == 200:
        return response.json().get('rating', None)
    return None

def set_ratings(logger):
    for catalog_namespace in list_catalog_namespaces(logger=logger, interface_name=None):
        for catalog_item in list_catalog_items(catalog_namespace, logger=logger):
            rating = get_rating(catalog_item, logger=logger)
            logger.info(f"Get rating of {catalog_item} is {rating}")
            if rating != catalog_item.rating:
                # set_rating(rating, catalog_item=catalog_item, logger=logger)
                logger.info(f"Updated rating ({rating}) for CatalogItem: {catalog_item.name}")

async def every(__seconds: float, func, *args, **kwargs):
    while True:
        func(*args, **kwargs)
        await asyncio.sleep(__seconds)

#----------------------------------------------------------------------------#
# Launch.
#----------------------------------------------------------------------------#
@kopf.on.startup()
async def on_startup(settings: kopf.OperatorSettings, logger, **_):
    logger.info("Booting up")
    event_loop = asyncio.get_event_loop()
    event_loop.create_task(every(300, set_ratings, logger))
    event_loop.run_forever()
