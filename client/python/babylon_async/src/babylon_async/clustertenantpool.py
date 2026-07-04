from __future__ import annotations

import json

from hashlib import sha1
from typing import Any, List, Mapping

from .exceptions import BabylonApiException
from .k8s_object import K8sObject

class ClusterTenantPool(K8sObject):
    api_group = "babylon.gpte.redhat.com"
    api_version = "v1"
    kind = "ClusterTenantPool"
    plural = "clustertenantpools"
    api_group_version = f"{api_group}/{api_version}"

    @property
    def cluster_provisioning(self) -> ClusterTenantPoolSpecClusterProvisioning:
        """Configuration for provisioning clusters which provide capacity for tenants."""
        return self.spec.cluster_provisioning

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
    def sandbox_host(self) -> ClusterTenantPoolSpecSandboxHost:
        """Configuration for registering clusters as tenant hosts with the Sandbox API."""
        return self.spec.sandbox_host

    @property
    def spec(self) -> ClusterTenantPoolSpec:
        """Configuration for ClusterTenantPool"""
        return ClusterTenantPoolSpec(self._definition['spec'])

    @property
    def status(self) -> ClusterTenantPoolStatus|None:
        """Status of ClusterTenantPool"""
        if 'status' not in self._definition:
            return None
        return ClusterTenantPoolStatus(self._definition['status'])

    async def add_cluster_to_status(self,
        name:str,
        retries:int=10,
        sandbox_api_state:str="pending"
    ) -> None:
        """Add cluster named by resource claim to status."""
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
                    "resourceClaimName": name,
                    "sandboxApiState": sandbox_api_state,
                }
            })

            try:
                print(f"PATCH {patch}")
                await self.patch_status(patch)
                return
            except BabylonApiException as err:
                print(err)
                if attempt == retries:
                    raise
                if err.status != 422:
                    raise
                await self.refresh()

    async def remove_cluster_from_status(self,
        name:str,
        retries:int=10,
    ) -> None:
        """Remove cluster named by resource claim from status."""
        for attempt in range(retries+1):
            # Loop until successfully removed
            for idx, cluster in reversed(list(enumerate(self.status.clusters))):
                if cluster.resource_claim_name != name:
                    continue
                try:
                    self.patch_status([{
                        "op": "test",
                        "path": f"/status/clusters/{idx}/resourceClaimName",
                        "value": name,
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


class ClusterTenantPoolSpec:
    """Configuration for ClusterTenantPool"""
    def __init__(self, definition):
        self._definition = definition

    @property
    def cluster_provisioning(self) -> ClusterTenantPoolSpecClusterProvisioning:
        """Configuration for provisioning clusters which provide capacity for tenants."""
        return ClusterTenantPoolSpecClusterProvisioning(
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
    def sandbox_host(self) -> ClusterTenantPoolSpecSandboxHost:
        """Configuration for registering clusters as tenant hosts with the Sandbax API."""
        return ClusterTenantPoolSpecSandboxHost(
            self._definition['sandboxHost'],
        )

    @property
    def tenant_pools(self) -> List[ClusterTenantPoolSpecTenantPool]:
        """Configuration to maintain pools of provisioned tenant items."""
        return [
            ClusterTenantPoolSpecTenantPool(item)
            for item in self._definition.get('tenantPools', [])
        ]


class ClusterTenantPoolSpecClusterProvisioning:
    """Configuration for provisioning clusters which provide capacity for tenants."""
    def __init__(self, definition):
        self._definition = definition

    @property
    def provider(self) -> ClusterTenantPoolSpecClusterProvisioningProvider:
        """Configuration for provisioning clusters which provide capacity for tenants."""
        return ClusterTenantPoolSpecClusterProvisioningProvider(
            self._definition['provider'],
        )


class ClusterTenantPoolSpecClusterProvisioningProvider:
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


class ClusterTenantPoolSpecSandboxHost:
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


class ClusterTenantPoolSpecTenantPool:
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
    def provider(self) -> ClusterTenantPoolSpecTenantPoolProvider:
        """ResourceProvider configuration used to provision pooled
        ResourceHandles for the tenant."""
        return ClusterTenantPoolSpecTenantPoolProvider(
            self._definition['provider'],
        )

class ClusterTenantPoolSpecTenantPoolProvider:
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

class ClusterTenantPoolStatus:
    """Status of ClusterTenantPool"""
    def __init__(self, definition):
        self._definition = definition

    @property
    def clusters(self) -> List[ClusterTenantPoolStatusCluster]|None:
        if 'clusters' not in self._definition:
            return None
        return [
            ClusterTenantPoolStatusCluster(item)
            for item in self._definition['clusters']
        ]

class ClusterTenantPoolStatusCluster:
    """Status of cluster in ClusterTenantPool"""
    def __init__(self, definition):
        self._definition = definition

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
