"""Tests for TenantClusterPool worker sizing configuration.

Covers the worker_sizing accessors added to the babylon_async client and
the worker count and registered placement calculations extracted into
operator/worker_sizing.py, which the workshop-manager uses when cloning
a TenantClusterPool for a WorkshopProvision.
"""

import sys
import unittest
from math import ceil
from pathlib import Path

# Make the workshop-manager operator modules importable.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'operator'))

# Use the babylon_async client from this repository rather than any
# installed release so that local changes are what gets tested.
sys.path.insert(0, str(
    Path(__file__).resolve().parents[2] / 'client' / 'python' / 'babylon_async' / 'src'
))

from babylon_async.tenantclusterpool import (
    TenantClusterPool,
    TenantClusterPoolSpecSandboxHost,
    TenantClusterPoolSpecSandboxHostWorkerSizing,
)
from worker_sizing import compute_registered_placements, compute_worker_count


def worker_sizing_values(**overrides):
    """Worker sizing definition values for the example coefficients
    from the private-maas cluster item (placements_per_worker=2,
    min_workers=2, max_workers=12)."""
    values = {
        'placements_per_worker': 2,
        'min_workers': 2,
        'max_workers': 12,
    }
    values.update(overrides)
    return values


def make_worker_sizing(**overrides):
    """TenantClusterPoolSpecSandboxHostWorkerSizing with example values."""
    return TenantClusterPoolSpecSandboxHostWorkerSizing(
        worker_sizing_values(**overrides)
    )


def worker_sizing_definition(**overrides):
    """Sandbox host definition as it appears on a TenantClusterPool for
    an item which declares worker sizing."""
    return {
        'annotations': {
            'cloud': 'aws-dedicated-shared',
            'lab': 'private-maas',
        },
        'max_placements': 20,
        'worker_sizing': worker_sizing_values(**overrides),
    }


class ComputeWorkerCountTest(unittest.TestCase):
    """compute_worker_count for the example coefficients
    (placements_per_worker=2, min_workers=2, max_workers=12)."""

    def setUp(self):
        self.worker_sizing = make_worker_sizing()

    def test_sizing_table(self):
        # (seats, expected workers per cluster) with max_placements=20
        cases = [
            (1, 2),    # floor: cluster viability, not demand
            (2, 2),
            (4, 2),    # honest size for a small order
            (5, 3),    # ceil: cannot provision half a worker
            (8, 4),
            (12, 6),
            (20, 10),  # full cluster by density
            (24, 10),  # per-cluster load, not order total (12 would be wrong)
            (40, 10),  # two clusters
            (60, 10),  # three clusters: 3 x 10, the clamp must not saturate
            (100, 10),  # five clusters
        ]
        for seats, expected in cases:
            with self.subTest(seats=seats):
                self.assertEqual(
                    compute_worker_count(seats, 20, self.worker_sizing),
                    expected,
                )

    def test_min_workers_floor(self):
        # Demand below the floor is raised: the cluster must stay viable
        # even for a single seat.
        sparse = make_worker_sizing(
            placements_per_worker=10, min_workers=3, max_workers=8,
        )
        self.assertEqual(compute_worker_count(1, 20, sparse), 3)

    def test_max_workers_ceiling(self):
        # Demand above the ceiling is clamped: one tenant per worker wants
        # 20 workers for a full cluster but must never exceed max_workers.
        heavy = make_worker_sizing(
            placements_per_worker=1, min_workers=2, max_workers=12,
        )
        self.assertEqual(compute_worker_count(20, 20, heavy), 12)
        self.assertEqual(compute_worker_count(100, 20, heavy), 12)

    def test_multi_cluster_order_sizes_per_cluster(self):
        # Regression test: the worker count must be derived from the
        # tenants a single cluster can carry, not from the order total.
        self.assertEqual(
            compute_worker_count(60, 20, self.worker_sizing), 10,
        )


class ComputeRegisteredPlacementsTest(unittest.TestCase):
    def test_registered_placements(self):
        # (seats, expected registered placements per cluster)
        # with the default buffer of 2 and max_placements=20
        cases = [
            (4, 6),    # seats plus retry buffer
            (12, 14),
            (18, 20),  # clamped at the item ceiling
            (20, 20),
            (60, 20),  # multi-cluster orders register the full ceiling
        ]
        for seats, expected in cases:
            with self.subTest(seats=seats):
                self.assertEqual(
                    compute_registered_placements(seats, 20),
                    expected,
                )

    def test_cluster_count_same_from_ceiling_and_registered_placements(self):
        # The cluster count is ceil(seats / placements per cluster).
        # Whether the catalog item ceiling or the registered placements
        # are used, the result is the same for every seat count, so right
        # sizing the registered placements does not change the number of
        # clusters.
        for seats in (1, 4, 12, 18, 19, 20, 21, 25, 40, 60, 100):
            registered = compute_registered_placements(seats, 20)
            with self.subTest(seats=seats):
                self.assertEqual(ceil(seats / 20), ceil(seats / registered))


class WorkerSizingAccessorTest(unittest.TestCase):
    """The worker_sizing accessor on TenantClusterPoolSpecSandboxHost."""

    def test_returns_none_when_not_configured(self):
        host = TenantClusterPoolSpecSandboxHost({
            'annotations': {'lab': 'private-maas'},
            'max_placements': 20,
        })
        self.assertIsNone(host.worker_sizing)

    def test_returns_wrapper_when_configured(self):
        host = TenantClusterPoolSpecSandboxHost(worker_sizing_definition())
        self.assertIsInstance(
            host.worker_sizing,
            TenantClusterPoolSpecSandboxHostWorkerSizing,
        )

    def test_reads_fields(self):
        host = TenantClusterPoolSpecSandboxHost(worker_sizing_definition())
        self.assertEqual(host.worker_sizing.placements_per_worker, 2)
        self.assertEqual(host.worker_sizing.min_workers, 2)
        self.assertEqual(host.worker_sizing.max_workers, 12)

    def test_min_and_max_workers_are_distinct_fields(self):
        # min_workers and max_workers must read different keys: an error
        # making both read the same value inverts the clamp.
        host = TenantClusterPoolSpecSandboxHost(
            worker_sizing_definition(min_workers=3, max_workers=9)
        )
        self.assertEqual(host.worker_sizing.min_workers, 3)
        self.assertEqual(host.worker_sizing.max_workers, 9)


class TenantClusterPoolWorkerSizingTest(unittest.TestCase):
    """worker_sizing access through the TenantClusterPool object."""

    @staticmethod
    def tenant_cluster_pool(worker_sizing=None):
        """Build a TenantClusterPool like the reference pool in
        shared-clusters for the private-maas cluster item."""
        sandbox_host = {
            'annotations': {
                'cloud': 'aws-dedicated-shared',
                'lab': 'private-maas',
            },
            'max_placements': 20,
        }
        if worker_sizing is not None:
            sandbox_host['worker_sizing'] = worker_sizing
        return TenantClusterPool(client=None, definition={
            'apiVersion': 'babylon.gpte.redhat.com/v1',
            'kind': 'TenantClusterPool',
            'metadata': {
                'name': 'agd-v2.private-maas-cluster.prod',
                'namespace': 'shared-clusters',
            },
            'spec': {
                'clusterProvisioning': {
                    'provider': {
                        'name': 'agd-v2.private-maas-cluster.prod',
                        'parameterValues': {'purpose': 'Tenant Cluster'},
                    },
                },
                'enabled': False,
                'maxClusters': 0,
                'minClusters': 0,
                'minAvailableSandboxPlacements': 0,
                'sandboxHost': sandbox_host,
            },
        })

    def test_spec_sandbox_host_worker_sizing(self):
        pool = self.tenant_cluster_pool(worker_sizing_values())
        self.assertEqual(pool.spec.sandbox_host.worker_sizing.max_workers, 12)

    def test_pool_level_worker_sizing(self):
        pool = self.tenant_cluster_pool(worker_sizing_values())
        self.assertEqual(pool.worker_sizing.min_workers, 2)

    def test_worker_sizing_none_without_configuration(self):
        pool = self.tenant_cluster_pool()
        self.assertIsNone(pool.worker_sizing)

    def test_compute_worker_count_from_pool(self):
        # End to end over the real objects: pool definition to pool to
        # accessor to sizing calculation, as the workshop-manager performs
        # it when cloning a TenantClusterPool.
        pool = self.tenant_cluster_pool(worker_sizing_values())
        worker_sizing = pool.spec.sandbox_host.worker_sizing
        self.assertEqual(compute_worker_count(4, 20, worker_sizing), 2)
        self.assertEqual(compute_worker_count(60, 20, worker_sizing), 10)


if __name__ == '__main__':
    unittest.main()
