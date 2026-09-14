from __future__ import annotations

from copy import deepcopy
from datetime import datetime

from typing import Any, List, Mapping

from .exceptions import BabylonApiException
from .k8s_object import K8sObject

class TenantClusterPool(K8sObject):
    api_group = "babylon.gpte.redhat.com"
    api_version = "v1"
    kind = "TenantClusterPool"
    plural = "tenantclusterpools"
    api_group_version = f"{api_group}/{api_version}"

    @classmethod
    def agnosticv_to_definition(cls,
        agnosticv_component: "AgnosticVComponent",
        name: str,
        namespace: str,
    ) -> Mapping:
        sandbox_host = agnosticv_component.definition['__meta__']['sandbox_host']
        return {
            "apiVersion": cls.api_group_version,
            "kind": cls.kind,
            "metadata": {
                "name": name,
                "namespace": namespace,
            },
            "spec": {
                "clusterProvisioning": {
                    "provider": {
                        "name": name,
                        "parameterValues": {
                            "purpose": "Tenant Cluster",
                        }
                    }
                },
                "maxClusters": 0,
                "minAvailableSandboxPlacements": 0,
                "minClusters": 0,
                "sandboxHost": deepcopy(sandbox_host),
            },
        }

    @property
    def cluster_provisioning(self) -> TenantClusterPoolSpecClusterProvisioning:
        """Configuration for provisioning clusters which provide capacity for tenants."""
        return self.spec.cluster_provisioning

    @property
    def clusters(self) -> List[TenantClusterPoolStatusCluster]:
        """Return clusters from status if defined else empty list."""
        status = self.status
        if status is None:
            return []
        return self.status.clusters or []

    @property
    def enabled(self) -> bool:
        """Return whether TenantClusterPool is enabled, default to false."""
        return self.spec.enabled or False

    @property
    def max_clusters(self) -> int|None:
        """Maximum number of clusters to provision. If undefined then no
        maximum is applied."""
        return self.spec.max_clusters

    @property
    def min_available_sandbox_placements(self) -> int:
        """Minimum number of unassigned sandbox placements to maintain
        on shared clusters. A new shared cluster will be provisioned
        if less than this number remain."""
        return self.spec.min_available_sandbox_placements

    @property
    def min_clusters(self) -> int:
        """Minimum number of clusters to provision. If undefined then no
        minimum is applied."""
        return self.spec.min_clusters or 0

    @property
    def sandbox_host(self) -> TenantClusterPoolSpecSandboxHost:
        """Configuration for registering clusters as tenant hosts with the Sandbox API."""
        return self.spec.sandbox_host

    @property
    def spec(self) -> TenantClusterPoolSpec:
        """Configuration for TenantClusterPool"""
        return TenantClusterPoolSpec(self._definition['spec'])

    @property
    def status(self) -> TenantClusterPoolStatus|None:
        """Status of TenantClusterPool"""
        if 'status' not in self._definition:
            return None
        return TenantClusterPoolStatus(self._definition['status'])

    @property
    def tenant_pools(self) -> List[TenantClusterPoolMergedTenantPool]:
        """Merged configuration and status of pools of tenant items."""

        spec_and_status = {}
        for name, spec in (self.spec.tenant_pools or {}).items():
            spec_and_status[name] = [spec, None]

        for name, status in (self.status.tenant_pools or {}).items():
            if name in spec_and_status:
                spec_and_status[name][1] = status
            else:
                spec_and_status[name] = [None, status]

        return [
            TenantClusterPoolMergedTenantPool(key, *value)
            for key, value in spec_and_status.items()
        ]

    async def add_cluster_to_status(self,
        resource_claim_name:str,
        retries:int=10,
        sandbox_api_state:str="pending"
    ) -> None:
        """Add cluster named by resource claim to status."""
        name = resource_claim_name.split('.', 1)[1].replace('.', '-')
        for attempt in range(retries+1):
            # Loop until successfully added
            patch = []
            if self.status is None:
                patch.append({
                    "op": "test",
                    "path": "/status",
                    "value": None,
                })
                patch.append({
                    "op": "add",
                    "path": "/status",
                    "value": {
                        "clusters": [],
                    }
                })
            elif self.status.clusters is None:
                patch.append({
                    "op": "test",
                    "path": "/status/clusters",
                    "value": None,
                })
                patch.append({
                    "op": "add",
                    "path": "/status/clusters",
                    "value": [],
                })

            patch.append({
                "op": "add",
                "path": "/status/clusters/-",
                "value": {
                    "name": name,
                    "resourceClaimName": resource_claim_name,
                    "sandboxApiState": sandbox_api_state,
                }
            })

            try:
                await self.patch_status(patch)
                return
            except BabylonApiException as err:
                if attempt == retries:
                    raise
                if err.status != 422:
                    raise
                await self.refresh()

    async def remove_cluster_from_status(self,
        resource_claim_name:str,
        retries:int=10,
    ) -> None:
        """Remove cluster named by resource claim from status."""
        for attempt in range(retries+1):
            for idx, cluster in reversed(list(enumerate(self.status.clusters))):
                if cluster.resource_claim_name != resource_claim_name:
                    continue
                try:
                    await self.patch_status([{
                        "op": "test",
                        "path": f"/status/clusters/{idx}/resourceClaimName",
                        "value": resource_claim_name,
                    }, {
                        "op": "remove",
                        "path": f"/status/clusters/{idx}",
                    }])
                except BabylonApiException as err:
                    if attempt == retries:
                        raise
                    if err.status != 422:
                        raise
                    await self.refresh()
                    continue
            return

    async def set_cluster_sandbox_api_state(self,
        resource_claim_name:str,
        sandbox_api_state:str,
        retries:int=10,
    ) -> None:
        """Set sandbox api state of cluster in status."""
        for attempt in range(retries+1):
            for idx, cluster in reversed(list(enumerate(self.status.clusters))):
                if cluster.resource_claim_name != resource_claim_name:
                    continue
                try:
                    await self.patch_status([{
                        "op": "test",
                        "path": f"/status/clusters/{idx}/resourceClaimName",
                        "value": resource_claim_name,
                    }, {
                        "op": "add",
                        "path": f"/status/clusters/{idx}/sandboxApiState",
                        "value": sandbox_api_state,
                    }])
                except BabylonApiException as err:
                    if attempt == retries:
                        raise
                    if err.status != 422:
                        raise
                    await self.refresh()
                    continue
            return

    async def update_from_agnosticv(self,
        definition: Mapping,
        dry_run: bool=False
    ) -> bool:
        """Update TenantClusterPool with definition from AgnosticVComponent.
        Return boolean to indicate if definition required update."""
        while True:
            merged = self.get_definition()
            # Specific fields from spec managed from AgnosticV
            merged['spec']['clusterProvisioning'] = definition['spec']['clusterProvisioning']
            merged['spec']['sandboxHost'] = definition['spec']['sandboxHost']
            # All annotations managed from AgnosticV
            merged['metadata']['annotations'] = definition['metadata']['annotations']
            # All labels managed from AgnosticV
            merged['metadata']['labels'] = definition['metadata']['labels']

            # Tenant pool merge, drop deleted catalog items and keep scaling.
            merged['spec']['tenantPools'] = deepcopy(definition['spec'].get('tenantPools', {}))
            for name, tenant_pool in self.tenant_pools.items():
                # If name not in merged then tenant catalog item deleted
                if name in merged['spec']['tenantPools']:
                    merged['spec']['tenantPools'][name]['minAvailable'] = tenant_pool.min_available

            if merged == self._definition:
                return False
            if dry_run:
                return True

            try:
                await self.replace_definition(merged)
                return True
            except BabylonApiException as err:
                if err.status != 409:
                    raise
                await self.refresh()

class TenantClusterPoolSpec:
    """Configuration for TenantClusterPool"""
    def __init__(self, definition):
        self._definition = definition

    @property
    def cluster_provisioning(self) -> TenantClusterPoolSpecClusterProvisioning:
        """Configuration for provisioning clusters which provide capacity for tenants."""
        return TenantClusterPoolSpecClusterProvisioning(
            self._definition['clusterProvisioning'],
        )

    @property
    def enabled(self) -> bool|None:
        """Return enabled value from spec"""
        return self._definition.get('enabled')

    @property
    def max_clusters(self) -> int|None:
        """Maximum number of clusters to provision. If undefined then no
        maximum is applied."""
        return self._definition.get('maxClusters')

    @property
    def min_available_sandbox_placements(self) -> int:
        """Minimum number of unassigned sandbox placements to maintain
        on shared clusters. A new shared cluster will be provisioned
        if less than this number remain."""
        return self._definition.get('minAvailableSandboxPlacements', 0)

    @property
    def min_clusters(self) -> int:
        """Maximum number of clusters to provision. If undefined then no
        minimum is applied."""
        return self._definition.get('minClusters', 0)

    @property
    def sandbox_host(self) -> TenantClusterPoolSpecSandboxHost:
        """Configuration for registering clusters as tenant hosts with the Sandbax API."""
        return TenantClusterPoolSpecSandboxHost(
            self._definition['sandboxHost'],
        )

    @property
    def tenant_pools(self) -> Mapping[str, TenantClusterPoolSpecTenantPool]|None:
        """Configuration to maintain pools of provisioned tenant items."""
        if 'tenantPools' not in self._definition:
            return None
        return {
            key: TenantClusterPoolSpecTenantPool(value)
            for key, value in self._definition.get('tenantPools', {}).items()
        }


class TenantClusterPoolSpecClusterProvisioning:
    """Configuration for provisioning clusters which provide capacity for tenants."""
    def __init__(self, definition):
        self._definition = definition

    @property
    def provider(self) -> TenantClusterPoolSpecClusterProvisioningProvider:
        """Configuration for provisioning clusters which provide capacity for tenants."""
        return TenantClusterPoolSpecClusterProvisioningProvider(
            self._definition['provider'],
        )


class TenantClusterPoolSpecClusterProvisioningProvider:
    """Configuration for provisioning clusters which provide capacity for tenants."""
    def __init__(self, definition):
        self._definition = definition

    @property
    def name(self) -> str:
        """ResourceProvider name"""
        return self._definition['name']

    @property
    def parameter_values(self) -> Mapping[str, Any]:
        """Parameter values used when creating the tenant ResourceHandle"""
        return self._definition.get('parameterValues', {})


class TenantClusterPoolSpecSandboxHost:
    """Configuration for registering clusters as tenant hosts with the Sandbax API."""
    def __init__(self, definition):
        self._definition = definition

    @property
    def annotations(self) -> Mapping[str, str]:
        """Annotations used to onboard provisioned clusters to the sandbox
        API."""
        return self._definition['annotations']

    @property
    def deployer_admin_sa_token_refresh_interval(self) -> str:
        """Admin service account token refresh. Defaults to `3h` if unset."""
        return self._definition.get('deployer_admin_sa_token_refresh_interval', '3h')

    @property
    def deployer_admin_sa_token_target_var(self) -> str:
        """Variable to set in tenant deployment.
        Defaults to `openshift_cluster_admin_token` if unspecified."""
        return self._definition.get(
            'deployer_admin_sa_token_target_var',
            'openshift_cluster_admin_token',
        )

    @property
    def deployer_admin_sa_token_ttl(self) -> str:
        """Service Account token refresh interval.
        Defaults to `6h` if unset."""
        return self._definition.get('deployer_admin_sa_token_ttl', '6h')

    @property
    def max_cpu_usage_percentage(self) -> int|None:
        """Maximum CPU utilization on host to allow tenant placement."""
        return self._definition.get('max_cpu_usage_percentage')

    @property
    def max_memory_usage_percentage(self) -> int|None:
        """Maximum memory utilization on host to allow tenant placement."""
        return self._definition.get('max_memory_usage_percentage')

    @property
    def max_placements(self) -> int:
        """Maximum number of tenant placements supported by this host."""
        return self._definition['max_placements']

    @property
    def quota_required(self) -> bool:
        """Configure whether tenant sandbox request must include quota."""
        return self._definition.get('quota_required', False)


class TenantClusterPoolSpecTenantPool:
    """Configuration to keep a pool of provisioned tenant items."""
    def __init__(self, definition):
        self._definition = definition

    @property
    def min_available(self) -> int:
        """Minimum number of unbound ResourceHandles to maintain pooled and
        available for ResourceClaims."""
        return self._definition.get('minAvailable', 0)

    @property
    def provider(self) -> TenantClusterPoolSpecTenantPoolProvider:
        """ResourceProvider configuration used to provision pooled
        ResourceHandles for the tenant."""
        return TenantClusterPoolSpecTenantPoolProvider(
            self._definition['provider'],
        )

class TenantClusterPoolSpecTenantPoolProvider:
    """ResourceProvider configuration used to provision pooled ResourceHandles
    for the tenant."""
    def __init__(self, definition):
        self._definition = definition

    @property
    def name(self) -> str:
        """ResourceProvider name"""
        return self._definition['name']

    @property
    def parameter_values(self) -> Mapping[str, Any]:
        """Parameter values used when creating the tenant ResourceHandle"""
        return self._definition.get('parameterValues', {})

class TenantClusterPoolStatus:
    """Status of TenantClusterPool"""
    def __init__(self, definition):
        self._definition = definition

    @property
    def clusters(self) -> List[TenantClusterPoolStatusCluster]|None:
        """Return clusters from status if defined."""
        if 'clusters' not in self._definition:
            return None
        return [
            TenantClusterPoolStatusCluster(item)
            for item in self._definition['clusters']
        ]

    @property
    def tenant_pools(self) -> Mapping[str, TenantClusterPoolStatusTenantPool]|None:
        """Configuration to maintain pools of provisioned tenant items."""
        if 'tenantPools' not in self._definition:
            return None
        return {
            key: TenantClusterPoolStatusTenantPool(value)
            for key, value in self._definition.get('tenantPools', {}).items()
        }

class TenantClusterPoolStatusCluster:
    """Status of cluster in TenantClusterPool"""
    def __init__(self, definition):
        self._definition = definition

    @property
    def name(self) -> str:
        """ResourceClaim name used to request the cluster."""
        return self._definition['name']

    @property
    def resource_claim_name(self) -> str:
        """ResourceClaim name used to request the cluster."""
        return self._definition['resourceClaimName']

    @property
    def sandbox_api_state(self) -> str:
        """Sandbox API state may be:

        pending - Cluster is being provisioned and will be
        registered with the SandboxAPI when ready.

        available - Cluster has been on-boarded to the
        SandboxAPI and is available for placements.

        disabled - Cluster is currently disabled in the
        SandboxAPI.

        removed - Cluster was found removed from the
        SandboxAPI. As this indicates a manual override the
        cluster will not be made available again by the
        babylon-cluster-tenant-pool-manager."""

        return self._definition['sandboxApiState']

class TenantClusterPoolStatusTenantPool:
    """Status of provisioned tenant items."""
    def __init__(self, definition):
        self._definition = definition

    @property
    def resource_handles(self) -> Mapping[str, TenantClusterPoolStatusTenantPoolResourceHandle]:
        """State of ResourceHandles associated to TenantPool."""
        return {
            key: TenantClusterPoolStatusTenantPoolResourceHandle(value)
            for key, value in self._definition.get('resourceHandles', {}).items()
        }

class TenantClusterPoolStatusTenantPoolResourceHandle:
    """Status of pooled tenant item ResourceHandle."""
    def __init__(self, definition):
        self._definition = definition

    @property
    def creation_datetime(self) -> datetime:
        """Return datetime object representing when ResourceHandle was created."""
        return datetime.strptime(self.creation_timestamp, '%Y-%m-%dT%H:%M:%S%z')

    @property
    def creation_timestamp(self) -> str:
        """Return timestamp when ResourceHandle was created."""
        return self._definition['creationTimestamp']

    @property
    def has_sandbox_placement(self) -> bool:
        """Flag indicating if the ResourceHandle has a sandbox placement"""
        return 'sandboxPlacement' in self._definition

    @property
    def is_claimed(self) -> bool:
        """Flag indicating if the ResourceHandle is bound to a ResourceClaim."""
        return 'resourceClaim' in self._definition

    @property
    def resource_claim(self) -> TenantClusterPoolStatusTenantPoolResourceHandleResourceClaim|None:
        """ResourceClaim bound to tenant ResourceHandle if claimed"""
        if not self.is_claimed:
            return None
        return TenantClusterPoolStatusTenantPoolResourceHandleResourceClaim(
            self._definition['resourceClaim']
        )

    @property
    def sandbox_placement(self) -> TenantClusterPoolStatusTenantPoolResourceHandleSandboxPlacement|None:
        """Select data for sandbox placement associated with ResourceHandle"""
        if not self.has_sandbox_placement:
            return None
        return TenantClusterPoolStatusTenantPoolResourceHandleSandboxPlacement(
            self._definition['sandboxPlacement']
        )

class TenantClusterPoolStatusTenantPoolResourceHandleResourceClaim:
    """ResourceClaim information for tenant ResourceHandle"""
    def __init__(self, definition):
        self._definition = definition

    @property
    def name(self) -> str:
        return self._definition['name']

    @property
    def namespace(self) -> str:
        return self._definition['namespace']

class TenantClusterPoolStatusTenantPoolResourceHandleSandboxPlacement:
    """SandboxPlacement information for tenant ResourceHandle"""
    def __init__(self, definition):
        self._definition = definition

    @property
    def annotations(self) -> Mapping[str, str]:
        """Annotations for the sandbox placement"""
        return self._definition['annotations']

    @property
    def id(self) -> int:
        """Sandbox placement id"""
        return self._definition['id']

    @property
    def service_uuid(self) -> str:
        """Service UUID for the sandbox placement. From the AnarchySubject uuid."""
        return self._definition['service_uuid']

    @property
    def status(self) -> str:
        """Sandbox string from the sandbox placement"""
        return self._definition['status']

class TenantClusterPoolMergedTenantPool:
    """Combined spec and status representation of TenantPool"""
    def __init__(self,
        name:str,
        spec:TenantClusterPoolSpecTenantPool|None,
        status:TenantClusterPoolStatusTenantPool|None,
    ):
        self.name = name
        self.spec = spec
        self.status = status

    @property
    def is_deleted(self) -> bool:
        """Indication that tenant pool is defined is status but removed from spec."""
        return self.spec is None

    @property
    def min_available(self) -> int:
        """Minimum number of unbound ResourceHandles to maintain pooled and
        available for ResourceClaims."""
        if self.spec is None:
            return 0
        return self.spec.min_available

    @property
    def provider(self) -> TenantClusterPoolSpecTenantPoolProvider|None:
        """ResourceProvider configuration used to provision pooled
        ResourceHandles for the tenant."""
        if self.spec is None:
            return None
        return self.spec.provider

    @property
    def resource_handles(self) -> Mapping[str, TenantClusterPoolStatusTenantPoolResourceHandle]:
        """State of ResourceHandles associated to TenantPool."""
        if self.status is None:
            return {}
        return self.status.resource_handles
