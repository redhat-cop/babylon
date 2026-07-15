from __future__ import annotations

import json

from hashlib import sha1
from typing import Any, List, Mapping

from .exceptions import BabylonApiException
from .k8s_object import K8sObject

class TenantClusterPool(K8sObject):
    api_group = "babylon.gpte.redhat.com"
    api_version = "v1"
    kind = "TenantClusterPool"
    plural = "tenantclusterpools"
    api_group_version = f"{api_group}/{api_version}"

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
    def tenant_pools(self) -> List[TenantClusterPoolSpecTenantPool]:
        """Configuration to maintain pools of provisioned tenant items."""
        return [
            TenantClusterPoolSpecTenantPool(item)
            for item in self._definition.get('tenantPools', [])
        ]


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
    def hash_identifier(self) -> str:
        """Short hash identifier for the tenant pool."""
        return sha1(
            json.dumps({
                "name": self.provider.name,
                "parameterValues": self.provider.parameter_values,
            }).encode('utf-8')
        ).hexdigest()

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
