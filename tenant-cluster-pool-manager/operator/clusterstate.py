from enum import Enum

class ClusterState(Enum):
    """Simple constant class to define cluster states."""
    # Cluster is deleted or in the process of being deleted
    DELETED = 1
    # Cluster is not available, likely because it is provisioning
    PENDING = 2
    # Cluster is started and should be available
    STARTED = 3
