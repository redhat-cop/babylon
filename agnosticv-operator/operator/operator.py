import asyncio
import logging
import os

from typing import List

import kopf

from agnosticvrepo import AgnosticVRepo
from operatorruntime import OperatorRuntime
from catalogitemcontroller import CatalogItemController
from configure_kopf_logging import configure_kopf_logging
from infinite_relative_backoff import InfiniteRelativeBackoff
from webhook_server import WebhookServer

from babylon_async import (
    AgnosticVComponent,
    AnarchyGovernor,
    BabylonApiException,
    CatalogItem,
    ResourceProvider,
    TenantClusterPool,
)

# Global webhook server instance
webhook_server = None
webhook_runner = None

@kopf.on.startup()
async def on_startup(settings: kopf.OperatorSettings, logger, **_):
    global webhook_server, webhook_runner
    
    await OperatorRuntime.on_startup()
    await CatalogItemController.on_startup()

    # Never give up from network errors
    settings.networking.error_backoffs = InfiniteRelativeBackoff()

    # Store last handled configuration in status
    settings.persistence.diffbase_storage = kopf.StatusDiffBaseStorage(field='status.diffBase')

    # Use operator domain as finalizer
    settings.persistence.finalizer = f"agnosticv-operator.{OperatorRuntime.agnosticv_api_group}"

    # Store progress in status. Some objects may be too large to store status in metadata annotations
    settings.persistence.progress_storage = kopf.StatusProgressStorage(field='status.kopf.progress')

    # Only create events for warnings and errors
    settings.posting.level = logging.WARNING

    # Disable scanning for crds and namespaces
    settings.scanning.disabled = True

    # Reduce kopf log verbosity
    configure_kopf_logging()
    
    # Start webhook server if enabled
    webhook_port_env = os.environ.get('WEBHOOK_PORT', '8090')
    webhook_port = int(webhook_port_env)
    webhook_enabled = os.environ.get('WEBHOOK_ENABLED', 'true').lower() == 'true'
    
    logger.info(f"Webhook configuration: WEBHOOK_ENABLED={webhook_enabled}, WEBHOOK_PORT env='{webhook_port_env}', parsed port={webhook_port}")

    if webhook_enabled:
        try:
            webhook_server = WebhookServer(port=webhook_port)
            webhook_runner = await webhook_server.start_server()
            logger.info(f"GitHub webhook server started on port {webhook_port}")
        except Exception as e:
            logger.error(f"Failed to start webhook server: {e}")
            webhook_server = None
            webhook_runner = None

@kopf.on.cleanup()
async def on_cleanup(logger, **_):
    global webhook_server, webhook_runner
    
    # Stop webhook server
    if webhook_runner:
        try:
            await webhook_server.stop_server(webhook_runner)
            logger.info("GitHub webhook server stopped")
        except Exception as e:
            logger.error(f"Error stopping webhook server: {e}")
        webhook_server = None
        webhook_runner = None
    
    await CatalogItemController.on_cleanup()
    await OperatorRuntime.on_cleanup()

@kopf.on.create(AgnosticVComponent.api_group, AgnosticVComponent.api_version, 'agnosticvcomponents')
async def agnosticvcomponent_create(logger, body, **_):
    agnosticv_component = AgnosticVComponent(client=OperatorRuntime.babylon, definition=body)
    await manage_agnosticv_component(agnosticv_component, logger)

@kopf.on.delete(AgnosticVComponent.api_group, AgnosticVComponent.api_version, 'agnosticvcomponents')
async def agnosticvcomponent_delete(logger, body, **_):
    agnosticv_component = AgnosticVComponent(client=OperatorRuntime.babylon, definition=body)
    # FIXME - Implement delete handling?
    # CatalogItems have a separate process to watch for when they reference
    # a component that no longer uses them.

@kopf.on.resume(AgnosticVComponent.api_group, AgnosticVComponent.api_version, 'agnosticvcomponents')
async def agnosticvcomponent_resume(logger, body, **_):
    agnosticv_component = AgnosticVComponent(client=OperatorRuntime.babylon, definition=body)
    await manage_agnosticv_component(agnosticv_component, logger)

@kopf.on.update(AgnosticVComponent.api_group, AgnosticVComponent.api_version, 'agnosticvcomponents')
async def agnosticvcomponent_update(logger, body, **_):
    agnosticv_component = AgnosticVComponent(client=OperatorRuntime.babylon, definition=body)
    await manage_agnosticv_component(agnosticv_component, logger)

@kopf.on.create(AgnosticVRepo.api_group, AgnosticVRepo.version, 'agnosticvrepos')
async def agnosticvrepo_create(logger, **kwargs):
    agnosticv_repo = AgnosticVRepo.load(**kwargs)
    async with agnosticv_repo.lock:
        await agnosticv_repo.handle_create(logger=logger)

@kopf.on.delete(AgnosticVRepo.api_group, AgnosticVRepo.version, 'agnosticvrepos')
async def agnosticvrepo_delete(logger, **kwargs):
    agnosticv_repo = AgnosticVRepo.load(**kwargs)
    async with agnosticv_repo.lock:
        await agnosticv_repo.handle_delete(logger=logger)

@kopf.on.resume(AgnosticVRepo.api_group, AgnosticVRepo.version, 'agnosticvrepos')
async def agnosticvrepo_resume(logger, **kwargs):
    agnosticv_repo = AgnosticVRepo.load(**kwargs)
    async with agnosticv_repo.lock:
        await agnosticv_repo.handle_resume(logger=logger)

@kopf.on.update(AgnosticVRepo.api_group, AgnosticVRepo.version, 'agnosticvrepos')
async def agnosticvrepo_update(logger, **kwargs):
    agnosticv_repo = AgnosticVRepo.load(**kwargs)
    async with agnosticv_repo.lock:
        await agnosticv_repo.handle_update(logger=logger)

@kopf.daemon(AgnosticVRepo.api_group, AgnosticVRepo.version, 'agnosticvrepos', cancellation_timeout=1)
async def agnoticvrepo_daemon(logger, stopped, **kwargs):
    agnosticv_repo = AgnosticVRepo.load(**kwargs)
    try:
        while not stopped:
            logger.info(f"Sleeping {agnosticv_repo.polling_interval}")
            await asyncio.sleep(agnosticv_repo.polling_interval)
            if stopped:
                break
            async with agnosticv_repo.lock:
                await agnosticv_repo.manage_components(
                    changed_only = True,
                    logger = logger,
                )
    except asyncio.CancelledError:
        pass

async def manage_agnosticv_component(agnosticv_component: AgnosticVComponent, logger) -> None:
    """Manage all configuraton configured from AgnosticV"""
    anarchy_governor, deprecated_anarchy_governors = await manage_anarchy_governor(
        agnosticv_component, logger
    )
    catalog_item = await manage_catalog_item(
        agnosticv_component, logger
    )
    resource_provider = await manage_resource_provider(
        agnosticv_component, logger
    )
    tenant_cluster_pool = await manage_tenant_cluster_pool(
        agnosticv_component, logger
    )

    await agnosticv_component.patch_status({
        "status": {
            "anarchyGovernor": {
                "name": anarchy_governor.name,
                "namespace": anarchy_governor.namespace,
                "uid": anarchy_governor.uid,
            } if anarchy_governor else None,
            "catalogItem": {
                "name": catalog_item.name,
                "namespace": catalog_item.namespace,
                "uid": catalog_item.uid,
            } if catalog_item else None,
            "deprecatedAnarchyGovernors": [
                {
                    "name": item.name,
                    "namespace": item.namespace,
                    "uid": item.uid,
                } for item in deprecated_anarchy_governors
            ] if len(deprecated_anarchy_governors) > 0 else None,
            "resourceProvider": {
                "name": resource_provider.name,
                "namespace": resource_provider.namespace,
                "uid": resource_provider.uid,
            } if resource_provider else None,
            "tenantClusterPool": {
                "name": tenant_cluster_pool.name,
                "namespace": tenant_cluster_pool.namespace,
                "uid": tenant_cluster_pool.uid,
            } if tenant_cluster_pool else None,
        }
    })

async def manage_anarchy_governor(
    agnosticv_component: AgnosticVComponent, logger
) -> (AnarchyGovernor|None, List[AnarchyGovernor]):
    anarchy_governor_definition = agnosticv_component.get_anarchy_governor_definition(
        environment_level=OperatorRuntime.environment_level,
    )
    if anarchy_governor_definition is None:
        return None, []
    anarchy_governor_name = anarchy_governor_definition['metadata']['name']
    anarchy_governor_namespace = anarchy_governor_definition['metadata']['namespace']

    anarchy_governor = None
    try:
        anarchy_governor = await OperatorRuntime.babylon.get_anarchy_governor(
            name=anarchy_governor_name,
            namespace=anarchy_governor_namespace,
        )
    except BabylonApiException as exception:
        if exception.status != 404:
            raise

    if anarchy_governor is None:
        anarchy_governor = await OperatorRuntime.babylon.create_anarchy_governor(
            definition=anarchy_governor_definition,
        )
        logger.info("Created %s", anarchy_governor)
    elif await anarchy_governor.update_from_agnosticv(anarchy_governor_definition):
        logger.info("Updated %s", anarchy_governor)

    deprecated_anarchy_governors = []
    for item in agnosticv_component.deprecated_anarchy_governors:
        try:
            deprecated_anarchy_governor = await OperatorRuntime.babylon.get_anarchy_governor(
                name=item.name,
                namespace=item.namespace,
            )
            await deprecated_anarchy_governor.update_from_agnosticv(anarchy_governor_definition)
            deprecated_anarchy_governors.append(deprecated_anarchy_governor)
        except BabylonApiException as exception:
            if exception.status != 404:
                raise

    return anarchy_governor, deprecated_anarchy_governors

async def manage_catalog_item(
    agnosticv_component: AgnosticVComponent, logger
) -> CatalogItem|None:
    if agnosticv_component.catalog_disable:
        return None

    try:
        agnosticv_repo = await agnosticv_component.get_agnosticv_repo()
    except BabylonApiException as exception:
        if exception.status != 404:
            raise
        logger.warning("Failed to get AgnosticVRepo for %s", agnosticv_component)
        return None

    try:
        linked_agnosticv_components = await agnosticv_component.get_linked_agnosticv_components(
            recurse=True,
        )
    except BabylonApiException as exception:
        if exception.status != 404:
            raise
        logger.warning("Failed to get linked components for %s", agnosticv_component)
        return None

    catalog_item_definition = agnosticv_component.get_catalog_item_definition(
        agnosticv_repo=agnosticv_repo,
        linked_agnosticv_components=linked_agnosticv_components,
    )
    if catalog_item_definition is None:
        return None
    catalog_item_name = catalog_item_definition['metadata']['name']
    catalog_item_namespace = catalog_item_definition['metadata']['namespace']
    catalog_item = None
    try:
        catalog_item = await OperatorRuntime.babylon.get_catalog_item(
            name=catalog_item_name,
            namespace=catalog_item_namespace,
        )
    except BabylonApiException as exception:
        if exception.status != 404:
            raise

    if catalog_item is None:
        catalog_item = await OperatorRuntime.babylon.create_catalog_item(
            definition=catalog_item_definition,
        )
        logger.info("Created %s", catalog_item)
        return
    if await catalog_item.update_from_agnosticv(catalog_item_definition):
        logger.info("Updated %s", catalog_item)

    return catalog_item

async def manage_resource_provider(
    agnosticv_component: AgnosticVComponent, logger
) -> ResourceProvider|None:
    resource_provider_definition = agnosticv_component.get_resource_provider_definition()
    if resource_provider_definition is None:
        return None
    resource_provider_name = resource_provider_definition['metadata']['name']
    resource_provider = None
    try:
        resource_provider = await OperatorRuntime.babylon.get_resource_provider(
            name=resource_provider_name,
        )
    except BabylonApiException as exception:
        if exception.status != 404:
            raise

    if resource_provider is None:
        resource_provider = await OperatorRuntime.babylon.create_resource_provider(
            definition=resource_provider_definition,
        )
        logger.info("Created %s", resource_provider)
        return
    if await resource_provider.update_from_agnosticv(resource_provider_definition):
        logger.info("Updated %s", resource_provider)

    return resource_provider

async def manage_tenant_cluster_pool(
    agnosticv_component: AgnosticVComponent, logger
) -> TenantClusterPool|None:
    tenant_cluster_pool_definition = agnosticv_component.get_tenant_cluster_pool_definition(
        environment_level=OperatorRuntime.environment_level,
    )
    if tenant_cluster_pool_definition is None:
        return None
    tenant_cluster_pool_name = tenant_cluster_pool_definition['metadata']['name']
    tenant_cluster_pool_namespace = tenant_cluster_pool_definition['metadata']['namespace']
    tenant_cluster_pool = None
    try:
        tenant_cluster_pool = await OperatorRuntime.babylon.get_tenant_cluster_pool(
            name=tenant_cluster_pool_name,
            namespace=tenant_cluster_pool_namespace,
        )
    except BabylonApiException as exception:
        if exception.status != 404:
            raise

    if tenant_cluster_pool is None:
        tenant_cluster_pool = await OperatorRuntime.babylon.create_tenant_cluster_pool(
            definition=tenant_cluster_pool_definition,
        )
        logger.info("Created %s", tenant_cluster_pool)
        return
    if await tenant_cluster_pool.update_from_agnosticv(tenant_cluster_pool_definition):
        logger.info("Updated %s", tenant_cluster_pool)

    return tenant_cluster_pool
