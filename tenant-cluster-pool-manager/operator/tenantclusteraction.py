"""
Class to handle actions specified in ResourceClaim annotations.
"""
import json

#pylint: disable=R0903
class TenantClusterAction:
    """Action to perform on tenant cluster

    This may be set in a ResourceClaim annotation to tell the
    tenant-cluster-manager to perform the following actions:

    disable - Disable cluster in the Sandbox API
    enable - Enable cluster in the Sandbox API
    offboard - Offboard cluster from the Sandbox API
    onboard - Onboard offboarded cluster to the Sandbax API

    """
    def __init__(self, json_str:str|None):
        if json_str is None:
            self.action = None
        else:
            action_data = json.loads(json_str)
            self.action = action_data.get('action')
