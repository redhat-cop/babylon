"""Worker sizing for TenantClusterPools cloned for WorkshopProvisions."""
from math import ceil

from babylon_async.tenantclusterpool import \
    TenantClusterPoolSpecSandboxHostWorkerSizing

# Extra sandbox placements registered beyond the requested seat count, so
# that a retried seat can be placed while a failed claim still holds its
# sandbox placement.
SANDBOX_PLACEMENT_BUFFER = 2


def compute_registered_placements(
    count: int,
    max_placements: int,
    buffer: int = SANDBOX_PLACEMENT_BUFFER,
) -> int:
    """Return the sandbox placements to register per cluster for a
    workshop provision with `count` seats.

    The seat count plus a small retry buffer, clamped at the placement
    ceiling of the catalog item.
    """
    return min(count + buffer, max_placements)


def compute_worker_count(
    count: int,
    max_placements: int,
    worker_sizing: TenantClusterPoolSpecSandboxHostWorkerSizing,
) -> int:
    """Return the number of workers to provision for each cluster of a
    workshop provision with `count` seats.

    Each cluster carries at most `max_placements` tenants, so the workers
    are sized for the tenants a single cluster can carry rather than for
    the order total, and the result is clamped between min_workers and
    max_workers.

    As an example, for an 8 seat workshop with max_placements 20 and:

        worker_sizing:
          placements_per_worker: 3
          min_workers: 2
          max_workers: 10

    the tenants per cluster are min(8, 20) = 8, which needs
    ceil(8 / 3) = 3 workers (8/3 is about 2.67 and half a worker cannot
    be provisioned), which is already within the bounds, so 3 workers
    are provisioned per cluster.
    """
    tenants_per_cluster = min(count, max_placements)
    return max(
        worker_sizing.min_workers,
        min(
            ceil(tenants_per_cluster / worker_sizing.placements_per_worker),
            worker_sizing.max_workers,
        ),
    )
