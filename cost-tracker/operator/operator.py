#!/usr/bin/env python3

import kopf
import kubernetes
import logging
import os

from infinite_relative_backoff import InfiniteRelativeBackoff
from resource_claim import ResourceClaim

babylon_domain = os.environ.get('BABYLON_DOMAIN', 'babylon.gpte.redhat.com')
babylon_api_version = os.environ.get('BABYLON_API_VERSION', 'v1')
poolboy_domain = os.environ.get('POOLBOY_DOMAIN', 'poolboy.gpte.redhat.com')
poolboy_api_version = os.environ.get('POOLBOY_API_VERSION', 'v1')

if os.path.exists('/run/secrets/kubernetes.io/serviceaccount'):
    kubernetes.config.load_incluster_config()
else:
    kubernetes.config.load_kube_config()

core_v1_api = kubernetes.client.CoreV1Api()
custom_objects_api = kubernetes.client.CustomObjectsApi()

@kopf.on.startup()
def configure(settings: kopf.OperatorSettings, **_):
    # Never give up from network errors
    settings.networking.error_backoffs = InfiniteRelativeBackoff()

    # Only create events for warnings and errors
    settings.posting.level = logging.WARNING

    # Disable scanning for CustomResourceDefinitions
    settings.scanning.disabled = True

@kopf.on.event(poolboy_domain, poolboy_api_version, 'resourceclaims')
def resourceclaim_event(event, logger, **_):
    resource_claim_definition = event.get('object')
    if not resource_claim_definition \
    or resource_claim_definition.get('kind') != 'ResourceClaim':
        logger.warning(event)
        return

    resource_claim = ResourceClaim(definition=resource_claim_definition)
