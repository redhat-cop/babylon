"""
babylon-tenant-cluster-pool-manager

- Manage clusters to add capacity to SandboxAPI
"""

import json
import logging

import kopf

from operatorruntime import OperatorRuntime
from clusterstate import ClusterState
from babylon_async import BabylonApiException, ResourceClaim, TenantClusterPool
from configure_kopf_logging import configure_kopf_logging
from infinite_relative_backoff import InfiniteRelativeBackoff
from sandboxapi import OcpSharedClusterConfiguration
from tenantclusteraction import TenantClusterAction

@kopf.on.startup()
async def on_startup(settings: kopf.OperatorSettings, **_):
    """Configure kopf and initalize runtime on startup."""
    await OperatorRuntime.on_startup()

    # Never give up from network errors
    settings.networking.error_backoffs = InfiniteRelativeBackoff()

    # Store last handled configuration in status
    settings.persistence.diffbase_storage = kopf.StatusDiffBaseStorage(field='status.diffBase')

    # Finalizer
    settings.persistence.finalizer = f"{OperatorRuntime.babylon_domain}/cluster-tenant-pool-manager"

    # Store progress in status.
    settings.persistence.progress_storage = kopf.StatusProgressStorage(field='status.kopf.progress')

    # Only create events for warnings and errors
    settings.posting.level = logging.WARNING

    # Disable scanning for crds and namespaces
    settings.scanning.disabled = True

    configure_kopf_logging()

@kopf.on.cleanup()
async def on_cleanup(**_):
    """Handle cleanup."""
    await OperatorRuntime.on_cleanup()

@kopf.on.create(
    TenantClusterPool.api_group, TenantClusterPool.api_version, TenantClusterPool.plural,
    labels={
        OperatorRuntime.babylon_ignore_label: kopf.ABSENT,
    },
)
async def tenant_cluster_pool_create(logger, body, **_):
    """Handle create of TenantClusterPool"""
    tenant_cluster_pool = TenantClusterPool(OperatorRuntime.babylon, body)
    await manage_tenant_cluster_pool(tenant_cluster_pool, logger)

@kopf.on.resume(
    TenantClusterPool.api_group, TenantClusterPool.api_version, TenantClusterPool.plural,
    labels={
        OperatorRuntime.babylon_ignore_label: kopf.ABSENT,
    },
)
async def tenant_cluster_pool_resume(logger, body, **_):
    """Handle resume of TenantClusterPool"""
    tenant_cluster_pool = TenantClusterPool(OperatorRuntime.babylon, body)
    await manage_tenant_cluster_pool(tenant_cluster_pool, logger)

@kopf.on.update(
    TenantClusterPool.api_group, TenantClusterPool.api_version, TenantClusterPool.plural,
    labels={
        OperatorRuntime.babylon_ignore_label: kopf.ABSENT,
    },
)
async def tenant_cluster_pool_update(logger, body, **_):
    """Handle update of TenantClusterPool"""
    tenant_cluster_pool = TenantClusterPool(OperatorRuntime.babylon, body)
    await manage_tenant_cluster_pool(tenant_cluster_pool, logger)

@kopf.timer(
    TenantClusterPool.api_group, TenantClusterPool.api_version, TenantClusterPool.plural,
    idle=30,
    interval=30,
    initial_delay=30,
    labels={
        OperatorRuntime.babylon_ignore_label: kopf.ABSENT,
    },
)
async def tenant_cluster_pool_timer(logger, body, **_):
    """Periocally manage TenantClusterPool"""
    tenant_cluster_pool = TenantClusterPool(OperatorRuntime.babylon, body)
    await manage_tenant_cluster_pool(tenant_cluster_pool, logger)

@kopf.on.event(
    ResourceClaim.api_group, ResourceClaim.api_version, ResourceClaim.plural,
    label_selector=f"{OperatorRuntime.tenant_cluster_pool_label},!{OperatorRuntime.poolboy_ignore_label}",
)
async def resource_claim_event(body, labels, logger, namespace, **_):
    """Handle ResourceClaim labeled for ClusterTenantPool"""
    resource_claim = ResourceClaim(OperatorRuntime.babylon, body)
    if resource_claim.is_deleting:
        return
    tenant_cluster_pool_name = labels.get(OperatorRuntime.tenant_cluster_pool_label)
    try:
        tenant_cluster_pool = await OperatorRuntime.babylon.get_tenant_cluster_pool(
            name=tenant_cluster_pool_name,
            namespace=namespace,
        )
    except BabylonApiException as err:
        if err.status == 404:
            logger.warning(
                "%s labeled for TenantClusterPool %s, but no such pool found.",
                resource_claim, tenant_cluster_pool_name
            )
            return
        raise

    for cluster in tenant_cluster_pool.clusters:
        if cluster.resource_claim_name == resource_claim.name:
            await manage_tenant_cluster_pool_cluster_with_resource_claim(
                tenant_cluster_pool, cluster, resource_claim, logger,
            )
            break
    else:
        logger.warning(
            "%s has label indicating it belongs to %s, but does not appear in status.",
            resource_claim,
            tenant_cluster_pool,
        )

async def clear_tenant_cluster_action(resource_claim: ResourceClaim) -> None:
    """Clear tenant cluster action annotation"""
    await resource_claim.patch({
        "metadata": {
            "annotations": {
                OperatorRuntime.tenant_cluster_action_annotation: None,
            }
        }
    })

async def ensure_tenant_cluster_pool_metadata_is_set(
    tenant_cluster_pool:TenantClusterPool,
    resource_claim:ResourceClaim,
    role:str,
    logger,
) -> None:
    """Set labels an annotations on ResourceClaim for TenantClusterPool

    Role should be either "cluster" or "tenant"
    """
    if resource_claim.labels.get(OperatorRuntime.tenant_cluster_pool_label) != tenant_cluster_pool.name:
        logger.warning(
            "Setting label %s on %s to %s",
            OperatorRuntime.tenant_cluster_pool_label,
            resource_claim,
            tenant_cluster_pool.name,
        )
        await resource_claim.set_labels({
            OperatorRuntime.tenant_cluster_pool_label: tenant_cluster_pool.name,
        })
    annotation_str = json.dumps({
        "name": tenant_cluster_pool.name,
        "role": role,
    }, separators=(',', ':'))
    if resource_claim.annotations.get(OperatorRuntime.tenant_cluster_pool_annotation) != annotation_str:
        logger.warning(
            "Setting annotation %s on %s to %s",
            OperatorRuntime.tenant_cluster_pool_annotation,
            resource_claim,
            annotation_str,
        )
        await resource_claim.set_annotations({
            OperatorRuntime.tenant_cluster_pool_annotation: annotation_str,
        })

async def handle_tenant_cluster_deleted(
    tenant_cluster_pool: TenantClusterPool,
    cluster,
    logger,
) -> None:
    """Handle ResourceClaim for tenant cluster deleted."""
    if cluster.sandbox_api_state != "removed":
        logger.warning(
            "ResourceClaim %s for %s is deleting but has not been removed for the sandbox api",
            cluster.resource_claim_name,
            tenant_cluster_pool,
        )
        await OperatorRuntime.sandbox_api.remove_ocp_shared_cluster_configuration(cluster.name)
    else:
        logger.info(
            "ResourceClaim %s for %s deleted",
            cluster.resource_claim_name,
            tenant_cluster_pool,
        )
    await tenant_cluster_pool.remove_cluster_from_status(cluster.resource_claim_name)


async def handle_tenant_cluster_offboard(
    tenant_cluster_pool: TenantClusterPool,
    cluster,
    resource_claim: ResourceClaim,
    logger,
) -> None:
    """Handle offboarding cluster from sandbox api."""
    await OperatorRuntime.sandbox_api.remove_ocp_shared_cluster_configuration(cluster.name)
    await tenant_cluster_pool.set_cluster_sandbox_api_state(
        resource_claim_name=cluster.resource_claim_name,
        sandbox_api_state="removed",
    )
    logger.info(
        "Cluster %s for %s removed from sandbox API",
        cluster.name,
        tenant_cluster_pool,
    )
    await clear_tenant_cluster_action(resource_claim)

#pylint: disable=R0913
#pylint: disable=R0917
async def handle_tenant_cluster_with_sandbox_config(
    tenant_cluster_action: TenantClusterAction,
    tenant_cluster_pool: TenantClusterPool,
    cluster,
    resource_claim: ResourceClaim,
    sandbox_config: OcpSharedClusterConfiguration,
    logger,
) -> (int, int):
    """Handle a tentant cluster that is registered in the sandbox API

    Return number of available placements and cluster state."""

    if tenant_cluster_action.action == 'offboard':
        await handle_tenant_cluster_offboard(
            tenant_cluster_pool, cluster, resource_claim, logger,
        )
        return ClusterState.STARTED, 0

    if tenant_cluster_action.action == 'disable':
        if sandbox_config.valid:
            await OperatorRuntime.sandbox_api.disable_ocp_shared_cluster_configuration(
                cluster.name,
            )
            logger.info(
                "Disabling %s cluster %s",
                tenant_cluster_pool, cluster.name
            )
        else:
            logger.debug(
                "Cluster %s for %s is already disabled",
                cluster.name, tenant_cluster_pool
            )
        await clear_tenant_cluster_action(resource_claim)
        await tenant_cluster_pool.set_cluster_sandbox_api_state(
            resource_claim_name=cluster.resource_claim_name,
            sandbox_api_state="removed",
        )
        return ClusterState.STARTED, 0

    if tenant_cluster_action.action == 'enable':
        if not sandbox_config.valid:
            logger.info(
                "Enabling %s cluster %s",
                tenant_cluster_pool, cluster.name
            )
            await OperatorRuntime.sandbox_api.enable_ocp_shared_cluster_configuration(
                cluster.name,
            )
        else:
            logger.debug(
                "Cluster %s for %s is already enabled",
                cluster.name, tenant_cluster_pool
            )
        await tenant_cluster_pool.set_cluster_sandbox_api_state(
            resource_claim_name=cluster.resource_claim_name,
            sandbox_api_state="available",
        )
        await clear_tenant_cluster_action(resource_claim)
    elif not sandbox_config.valid:
        if cluster.sandbox_api_state != 'disabled':
            logger.info(
                "Cluster %s for %s found disabled",
                cluster.name, tenant_cluster_pool,
            )
            await tenant_cluster_pool.set_cluster_sandbox_api_state(
                resource_claim_name=cluster.resource_claim_name,
                sandbox_api_state="disabled",
            )
        return ClusterState.STARTED, 0

    if cluster.sandbox_api_state != 'available':
        logger.info(
            "Cluster %s for %s found enabled",
            cluster.name, tenant_cluster_pool,
        )
        await tenant_cluster_pool.set_cluster_sandbox_api_state(
            resource_claim_name=cluster.resource_claim_name,
            sandbox_api_state="available",
        )

    placements = await OperatorRuntime.sandbox_api.get_ocp_shared_cluster_configuration_placements(cluster.name)
    return ClusterState.STARTED, sandbox_config.max_placements - len(placements)

async def handle_tenant_cluster_without_sandbox_config(
    tenant_cluster_action: TenantClusterAction,
    tenant_cluster_pool: TenantClusterPool,
    cluster,
    resource_claim: ResourceClaim,
    logger,
) -> (int, int):
    """Handle a tentant cluster that is not currently in the sandbox API

    Return number of available placements and cluster state."""

    if (
        cluster.sandbox_api_state == 'removed' and
        tenant_cluster_action.action != 'onboard'
    ):
        # Cluster is listed as removed as expected.
        return ClusterState.STARTED, 0

    if (
        cluster.sandbox_api_state != 'pending' and
        tenant_cluster_action.action != 'onboard'
    ):
        # Cluster has been manually removed from the sandbox api
        logger.warning(
            "Cluster %s for %s found removed from sandbox api",
            cluster.name,
            tenant_cluster_pool,
        )
        await tenant_cluster_pool.set_cluster_sandbox_api_state(
            resource_claim_name=cluster.resource_claim_name,
            sandbox_api_state="removed",
        )
        return ClusterState.STARTED, 0

    # Cluster is not in the sandbox api, but should be.
    await OperatorRuntime.sandbox_api.create_ocp_shared_cluster_configuration(
        annotations=tenant_cluster_pool.sandbox_host.annotations,
        api_url=resource_claim.provision_data['openshift_api_url'],
        ingress_domain=resource_claim.provision_data['openshift_cluster_ingress_domain'],
        deployer_admin_sa_token_refresh_interval=tenant_cluster_pool.sandbox_host.deployer_admin_sa_token_refresh_interval,
        deployer_admin_sa_token_target_var=tenant_cluster_pool.sandbox_host.deployer_admin_sa_token_target_var,
        deployer_admin_sa_token_ttl=tenant_cluster_pool.sandbox_host.deployer_admin_sa_token_ttl,
        max_placements=tenant_cluster_pool.sandbox_host.max_placements,
        max_cpu_usage_percentage=tenant_cluster_pool.sandbox_host.max_cpu_usage_percentage,
        max_memory_usage_percentage=tenant_cluster_pool.sandbox_host.max_memory_usage_percentage,
        name=cluster.name,
        quota_required=tenant_cluster_pool.sandbox_host.quota_required,
        token=resource_claim.provision_data['openshift_cluster_admin_token'],
    )
    logger.info("Onboarded cluster %s for %s to sandbox api", cluster.name, tenant_cluster_pool)
    await tenant_cluster_pool.set_cluster_sandbox_api_state(
        resource_claim_name=cluster.resource_claim_name,
        sandbox_api_state="available",
    )
    if tenant_cluster_action.action == 'onboard':
        await clear_tenant_cluster_action(resource_claim)
    return ClusterState.STARTED, tenant_cluster_pool.sandbox_host.max_placements


async def manage_tenant_cluster_pool_cluster(tenant_cluster_pool, cluster, logger) -> (int, int):
    """Manage cluster for TenantClusterPool
    Return cluster state and number of available placements"""
    try:
        resource_claim = await OperatorRuntime.babylon.get_resource_claim(
            name=cluster.resource_claim_name,
            namespace=tenant_cluster_pool.namespace,
        )
    except BabylonApiException as err:
        if err.status != 404:
            raise
        await handle_tenant_cluster_deleted(tenant_cluster_pool, cluster, logger)
        return ClusterState.DELETED, 0

    return await manage_tenant_cluster_pool_cluster_with_resource_claim(
        tenant_cluster_pool, cluster, resource_claim, logger,
    )

async def manage_tenant_cluster_pool(tenant_cluster_pool, logger) -> None:
    """Manage TenantClusterePool"""

    # First manage current clusters...
    (available_placement_count, cluster_count, have_cluster_pending
    ) = await manage_tenant_cluster_pool_clusters(
        tenant_cluster_pool, logger
    )

    if (
        # Don't provision if at or above max cluster count
        (
            tenant_cluster_pool.max_clusters is None or
            cluster_count < tenant_cluster_pool.max_clusters
        )
        and
        (
            # If below minimum cluster count then provision a cluster
            cluster_count < tenant_cluster_pool.min_clusters
            or
            # Only provision a cluster to reach available placement count if there
            # isn't a pending cluster.
            (
                not have_cluster_pending and
                available_placement_count < tenant_cluster_pool.min_available_sandbox_placements
            )
        )
    ):
        await provision_cluster_for_tenant_cluster_pool(tenant_cluster_pool, logger)

async def manage_tenant_cluster_pool_cluster_with_resource_claim(
    tenant_cluster_pool:TenantClusterPool,
    cluster,
    resource_claim:ResourceClaim,
    logger,
) -> (int, int):
    """Manage cluster for TenantClusterPool with associated ResourceClaim.
    Return whether to count the cluster as still existing and number of available placements.

    This method is called from both the ResourceClaim event watcher as well
    as TenantClusterPool management."""

    if resource_claim.is_deleting:
        await handle_tenant_cluster_deleted(tenant_cluster_pool, cluster, logger)
        return ClusterState.DELETED, 0

    await ensure_tenant_cluster_pool_metadata_is_set(
        tenant_cluster_pool,
        resource_claim,
        "cluster",
        logger,
    )

    if resource_claim.state in ('provision-failed', 'provision-error'):
        logger.warning(
            "Cluster %s for %s is %s!",
            cluster.resource_claim_name,
            tenant_cluster_pool,
            resource_claim.state,
        )
        await resource_claim.delete()
        await tenant_cluster_pool.remove_cluster_from_status(cluster.resource_claim_name)
        return ClusterState.DELETED, 0

    await resource_claim.disable_autostop()
    await resource_claim.disable_autodestroy()

    if resource_claim.state != 'started':
        return ClusterState.PENDING, 0

    sandbox_config = await OperatorRuntime.sandbox_api.get_ocp_shared_cluster_configuration(cluster.name)

    tenant_cluster_action = TenantClusterAction(
        resource_claim.annotations.get(OperatorRuntime.tenant_cluster_action_annotation)
    )

    if sandbox_config is None:
        return await handle_tenant_cluster_without_sandbox_config(
            tenant_cluster_action, tenant_cluster_pool, cluster, resource_claim, logger,
        )

    return await handle_tenant_cluster_with_sandbox_config(
        tenant_cluster_action, tenant_cluster_pool, cluster, resource_claim, sandbox_config, logger,
    )


async def manage_tenant_cluster_pool_clusters(tenant_cluster_pool, logger):
    """Manage clusers associated with TenantClusterPool"""
    total_available_placement_count = 0
    cluster_count = 0
    have_cluster_pending = False
    for cluster in tenant_cluster_pool.clusters:
        cluster_state, available_placement_count = await manage_tenant_cluster_pool_cluster(
            tenant_cluster_pool, cluster, logger
        )
        if cluster_state == ClusterState.DELETED:
            continue
        cluster_count += 1
        total_available_placement_count += available_placement_count
        if cluster_state == ClusterState.PENDING:
            have_cluster_pending = True

    return total_available_placement_count, cluster_count, have_cluster_pending

async def provision_cluster_for_tenant_cluster_pool(tenant_cluster_pool, logger):
    """Provision a new cluster for TenantClusterPool"""
    logger.info("Provisioning cluster for %s", tenant_cluster_pool)
    resource_claim = await OperatorRuntime.babylon.create_resource_claim(
        labels={
            OperatorRuntime.tenant_cluster_pool_label: tenant_cluster_pool.name,
        },
        name=f"{tenant_cluster_pool.name}-*",
        namespace=tenant_cluster_pool.namespace,
        owner=tenant_cluster_pool,
        provider_name=tenant_cluster_pool.cluster_provisioning.provider.name,
        parameter_values=tenant_cluster_pool.cluster_provisioning.provider.parameter_values,
    )
    await tenant_cluster_pool.add_cluster_to_status(resource_claim.name)
    logger.info("Created %s for %s", resource_claim, tenant_cluster_pool)
