import re

from anarchy_subject import AnarchySubject
from aws_sandbox_cost import get_aws_sandbox_cost
from datetime import datetime, timezone

class ResourceClaim:
    def __init__(self, definition):
        self.definition = definition

    @property
    def annotations(self):
        return self.metadata.get('annotations', {})

    @property
    def creation_datetime(self):
        return datetime.strptime(
            self.creation_timestamp, '%Y-%m-%dT%H:%M:%SZ'
        ).replace(tzinfo=timezone.utc)

    @property
    def creation_timestamp(self):
        return self.metadata['creationTimestamp']

    @property
    def guid(self):
        resourceHandleName = self.definition.get('status', {}).get('resourceHandle', {}).get('name')
        return re.sub(r'^guid-', '', resourceHandleName) if resourceHandleName else None

    @property
    def metadata(self):
        return self.definition['metadata']

    @property
    def name(self):
        return self.metadata['name']

    @property
    def namespace(self):
        return self.metadata['namespace']

    @property
    def status(self):
        return self.definition.get('status')

    @property
    def status_resources(self):
        return self.status.get('resources', [])

    @property
    def supports_cost_tracking(self):
        if not self.status:
            return False

        # If any resource in the claim is an AnarchySubject with an AWS sandbox then
        # cost tracking is supported.
        for status_resource in self.status_resources:
            status_resource_state = status_resource.get('state')
            if not status_resource_state:
                continue
            if status_resource_state['kind'] == 'AnarchySubject':
                anarchy_subject = AnarchySubject(definition=status_resource_state)
                if anarchy_subject.aws_sandbox_account:
                    return True

        return False

    @property
    def uid(self):
        return self.metadata['uid']

    def update_cost_tracker_state(self, cost_tracker_state):
        total_estimated_cost = 0

        for status_resource in self.status_resources:
            status_resource_state = status_resource.get('state')
            if not status_resource_state:
                continue
            if status_resource_state['kind'] == 'AnarchySubject':
                anarchy_subject = AnarchySubject(definition=status_resource_state)
                if anarchy_subject.aws_sandbox_account:
                    total_estimated_cost += get_aws_sandbox_cost(
                        creation_datetime = self.creation_datetime,
                        sandbox_account = anarchy_subject.aws_sandbox_account
                    )

        cost_tracker_state.set_estimated_cost(total_estimated_cost)
