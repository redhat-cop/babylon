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

    async def remove_cluster_from_status(self, name:str) -> None:
        """Remove cluster named by resource claim from status."""
        while True:
            # Loop until successfully removed
            found = False
            for idx, cluster in reversed(list(enumerate(self.status.clusters))):
                if cluster.resource_claim_name != name:
                    continue
                found = True
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
                    if err.status != 422:
                        raise
            if not found:
                # Cluster did not appear in status, so consider it removed.
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
    def resource_provider(self) -> ClusterTenantPoolSpecClusterProvisioningResourceProvider:
        """Configuration for provisioning clusters which provide capacity for tenants."""
        return ClusterTenantPoolSpecClusterProvisioningResourceProvider(
            self._definition['resourceProvider'],
        )


class ClusterTenantPoolSpecClusterProvisioningResourceProvider:
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
                "name": self.resource_provider.name,
                "parameterValues": self.resource_provider.parameter_values,
            }).encode('utf-8')
        ).hexdigest()

    @property
    def resource_provider(self) -> ClusterTenantPoolSpecTenantPoolResourceProvider:
        """ResourceProvider configuration used to provision pooled
        ResourceHandles for the tenant."""
        return ClusterTenantPoolSpecTenantPoolResourceProvider(
            self._definition['resourceProvider'],
        )

class ClusterTenantPoolSpecTenantPoolResourceProvider:
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
