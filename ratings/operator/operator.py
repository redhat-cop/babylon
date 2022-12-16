#!/usr/bin/env python3

import kopf
import kubernetes
import logging
import os

from infinite_relative_backoff import InfiniteRelativeBackoff
from catalog_item import CatalogItem

babylon_domain = os.environ.get('BABYLON_DOMAIN', 'babylon.gpte.redhat.com')
babylon_api_version = os.environ.get('BABYLON_API_VERSION', 'v1')

rating_label = f"{babylon_domain}/rating"

if os.path.exists('/run/secrets/kubernetes.io/serviceaccount'):
    kubernetes.config.load_incluster_config()
else:
    kubernetes.config.load_kube_config()

core_v1_api = kubernetes.client.CoreV1Api()
custom_objects_api = kubernetes.client.CustomObjectsApi()

def set_rating_label(rating_score, catalog_item):
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

@kopf.on.startup()
def configure(settings: kopf.OperatorSettings, **_):
    # Never give up from network errors
    settings.networking.error_backoffs = InfiniteRelativeBackoff()

    # Only create events for warnings and errors
    settings.posting.level = logging.WARNING

    # Disable scanning for CustomResourceDefinitions
    settings.scanning.disabled = True


## TODO: decide in which object trigger
@kopf.on.event(poolboy_domain, poolboy_api_version, 'resourceclaims')
def resourceclaim_event(event, logger, **_):
    resource_claim_definition = event.get('object')
    if not resource_claim_definition \
    or resource_claim_definition.get('kind') != 'ResourceClaim':
        logger.warning(event)
        return

    catalog_item = CatalogItem(definition=catalog_item_definition)
    if not catalog_item:
        return

    ## TODO: get rating from db
    if not cost_tracker_json:
        set_rating_label(rating, catalog_item=catalog_item)
        logger.info("Updated rating label")
        return