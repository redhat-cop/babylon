from datetime import datetime, timedelta, timezone
import json

class CostTrackerState:
    @staticmethod
    def deserialize(json_string):
        return CostTrackerState(**json.loads(json_string))

    def __init__(self, estimatedCost=None, lastUpdate=None, lastRequest=None, **_):
        self.estimated_cost = estimatedCost if estimatedCost else None

        self.last_update = datetime.strptime(
            lastUpdate, '%Y-%m-%dT%H:%M:%SZ'
        ).replace(tzinfo=timezone.utc) if lastUpdate else None

        self.last_request = datetime.strptime(
            lastRequest, '%Y-%m-%dT%H:%M:%SZ'
        ).replace(tzinfo=timezone.utc) if lastRequest else None

    @property
    def update_is_requested(self):
        if not self.last_request:
            return False
        if not self.last_update:
            return True
        return self.last_request > self.last_update

    def serialize(self):
        data = {}
        if self.estimated_cost:
            data['estimatedCost'] = self.estimated_cost
        if self.last_update:
            data['lastUpdate'] = self.last_update.strftime('%Y-%m-%dT%H:%M:%SZ')
        if self.last_request:
            data['lastRequest'] = self.last_request.strftime('%Y-%m-%dT%H:%M:%SZ')
        return json.dumps(data)

    def set_estimated_cost(self, estimated_cost):
        self.estimated_cost = estimated_cost
        self.last_update = datetime.now(timezone.utc)
        # Set last request to last update if it was set to a future timestamp.
        # This prevents the update to cause a busy loop of repeated updates.
        if self.last_request > self.last_update:
            self.last_request = self.last_update
