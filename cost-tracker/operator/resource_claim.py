import re

from anarchy_subject import AnarchySubject

class ResourceClaim:
    def __init__(self, definition):
        self.definition = definition

    @property
    def creation_timestamp(self):
        return self.definition['metadata']['creationTimestamp']

    @property
    def guid(self):
        resourceHandleName = self.definition.get('status', {}).get('resourceHandle', {}).get('name')
        return re.sub(r'^guid-', '', resourceHandleName) if resourceHandleName else None

    @property
    def name(self):
        return self.definition['metadata']['name']

    @property
    def namespace(self):
        return self.definition['metadata']['namespace']

    @property
    def status(self):
        return self.get('status')

    @property
    def status_resources(self):
        return self.get('status', {}).get('resources', [])

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
        return self.definition['metadata']['uid']
