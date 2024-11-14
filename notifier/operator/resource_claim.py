import re

from pydantic.v1.utils import deep_update

from babylon import Babylon

class DeployerJob:
    def __init__(self, definition, namespace):
        self.definition = definition
        self.namespace = namespace

    @property
    def host(self):
        return self.definition.get('towerHost')

    @property
    def completion_timestamp(self):
        return self.definition.get('completeTimestamp')

    @property
    def job_id(self):
        return self.definition.get('deployerJob')

    @property
    def start_timestamp(self):
        return self.definition.get('startTimestamp')

class ResourceClaim:
    def __init__(self, definition):
        self.definition = definition

    @property
    def annotations(self):
        return self.definition['metadata'].get('annotations', {})

    @property
    def catalog_item_name(self):
        return self.definition.get('status', {}).get('summary', {}).get(
            'catalog_item_name',
            self.labels.get('babylon.gpte.redhat.com/catalogItemName')
        )

    @property
    def catalog_item_namespace(self):
        return self.definition.get('status', {}).get('summary', {}).get(
            'catalog_item_namespace',
            self.labels.get('babylon.gpte.redhat.com/catalogItemNamespace')
        )

    @property
    def creation_timestamp(self):
        return self.definition['metadata']['creationTimestamp']

    @property
    def email_from(self):
        return self.annotations.get('babylon.gpte.redhat.com/emailFrom')

    @property
    def guid(self):
        resourceHandleName = self.definition.get('status', {}).get('resourceHandle', {}).get('name')
        return re.sub(r'^guid-', '', resourceHandleName) if resourceHandleName else None

    @property
    def has_status(self):
        return 'status' in self.definition

    @property
    def ignore(self):
        return Babylon.resource_broker_ignore_label in self.labels

    @property
    def is_stopped(self):
        if not 'status' in self.definition \
        or not 'resources' in self.definition['status']:
            return False
        stopped = False
        for resource in self.definition['status']['resources']:
            state = resource.get('state')
            if not state:
                return False
            if state['kind'] == 'AnarchySubject':
                if state['spec'].get('vars', {}).get('current_state') == 'stopped':
                    stopped = True
                else:
                    return False
        return stopped

    @property
    def labels(self):
        return self.definition['metadata'].get('labels', {})

    @property
    def last_started_timestamp(self):
        if not 'status' in self.definition \
        or not 'resources' in self.definition['status']:
            return False
        timestamp = None
        for resource in self.definition['status']['resources']:
            state = resource.get('state')
            if not state:
                return None
            if state['kind'] == 'AnarchySubject':
                if state['spec'].get('vars', {}).get('current_state') == 'started':
                    complete_ts = state['status'].get('towerJobs', {}).get('start', {}).get('completeTimestamp')
                    if complete_ts:
                        timestamp = complete_ts
                else:
                    return None
        return timestamp

    @property
    def last_stopped_timestamp(self):
        if not 'status' in self.definition \
        or not 'resources' in self.definition['status']:
            return False
        timestamp = None
        for resource in self.definition['status']['resources']:
            state = resource.get('state')
            if not state:
                return None
            if state['kind'] == 'AnarchySubject':
                if state['spec'].get('vars', {}).get('current_state') == 'stopped':
                    complete_ts = state['status'].get('towerJobs', {}).get('stop', {}).get('completeTimestamp')
                    if complete_ts:
                        timestamp = complete_ts
                else:
                    return None
        return timestamp

    @property
    def name(self):
        return self.definition['metadata']['name']

    @property
    def namespace(self):
        return self.definition['metadata']['namespace']

    @property
    def notifier_disable(self):
        return 'disable' == self.annotations.get(f"babylon.gpte.redhat.com/notifier")

    @property
    def provision_complete(self):
        if not 'status' in self.definition \
        or not 'resources' in self.definition['status']:
            return False
        for resource in self.definition['status']['resources']:
            state = resource.get('state')
            if not state:
                return False
            if state['kind'] == 'AnarchySubject':
                if state['spec'].get('vars', {}).get('current_state') not in ('started', 'stopped'):
                    return False
        return True

    @property
    def provision_deployer_jobs(self):
        deployer_jobs = []
        for resource in self.definition['status']['resources']:
            state = resource.get('state')
            if state and state['kind'] == 'AnarchySubject':
                job_definition = state.get('status', {}).get('towerJobs', {}).get('provision')
                if job_definition:
                    deployer_jobs.append(
                        DeployerJob(
                            definition = job_definition,
                            namespace = state['metadata']['namespace'],
                        )
                    )
        return deployer_jobs

    @property
    def provision_failed(self):
        if not 'status' in self.definition \
        or not 'resources' in self.definition['status']:
            return False
        for resource in self.definition['status']['resources']:
            state = resource.get('state')
            if not state:
                return False
            if state['kind'] == 'AnarchySubject':
                if state['spec'].get('vars', {}).get('current_state') in (
                    'provision-canceled', 'provision-error', 'provision-failed'
                ):
                    return True
        return False

    @property
    def provision_message_body(self):
        message_body = []
        for status_resource in self.definition['status']['resources']:
            resource_state = status_resource['state']
            if resource_state['kind'] == 'AnarchySubject':
                message_body.extend(resource_state['spec'].get('vars', {}).get('provision_message_body', []))
        return message_body

    @property
    def provision_messages(self):
        messages = []
        for status_resource in self.definition['status']['resources']:
            resource_state = status_resource['state']
            if resource_state['kind'] == 'AnarchySubject':
                messages.extend(resource_state['spec'].get('vars', {}).get('provision_messages', []))
        return messages

    @property
    def provision_started(self):
        if not 'status' in self.definition \
        or not 'resources' in self.definition['status']:
            return False
        for resource in self.definition['status']['resources']:
            state = resource.get('state')
            if not state:
                continue
            if state['kind'] == 'AnarchySubject':
                if state.get('status', {}).get('towerJobs', {}).get('provision', {}):
                    return True
        return False

    @property
    def retirement_timestamp(self):
        return self.definition['status'].get('lifespan', {}).get('end')

    @property
    def service_url(self):
        return self.annotations.get('babylon.gpte.redhat.com/url')

    @property
    def start_deployer_jobs(self):
        deployer_jobs = []
        for resource in self.definition['status']['resources']:
            state = resource.get('state')
            if state and state['kind'] == 'AnarchySubject':
                job_definition = state.get('status', {}).get('towerJobs', {}).get('start')
                if job_definition:
                    deployer_jobs.append(
                        DeployerJob(
                            definition = job_definition,
                            namespace = state['metadata']['namespace'],
                        )
                    )
        return deployer_jobs

    @property
    def start_failed(self):
        if not 'status' in self.definition \
        or not 'resources' in self.definition['status']:
            return False
        for resource in self.definition['status']['resources']:
            state = resource.get('state')
            if not state:
                return False
            if state['kind'] == 'AnarchySubject':
                if state['spec'].get('vars', {}).get('current_state') == 'start-failed':
                    return True
        return False

    @property
    def stop_deployer_jobs(self):
        deployer_jobs = []
        for resource in self.definition['status']['resources']:
            state = resource.get('state')
            if state and state['kind'] == 'AnarchySubject':
                job_definition = state.get('status', {}).get('towerJobs', {}).get('stop')
                if job_definition:
                    deployer_jobs.append(
                        DeployerJob(
                            definition = job_definition,
                            namespace = state['metadata']['namespace'],
                        )
                    )
        return deployer_jobs

    @property
    def stop_failed(self):
        if not 'status' in self.definition \
        or not 'resources' in self.definition['status']:
            return False
        for resource in self.definition['status']['resources']:
            state = resource.get('state')
            if not state:
                return False
            if state['kind'] == 'AnarchySubject':
                if state['spec'].get('vars', {}).get('current_state') == 'stop-failed':
                    return True
        return False

    @property
    def stop_timestamp(self):
        try:
            return self.definition['status']['resources'][0]['state']['spec']['vars']['action_schedule']['stop']
        except Exception as e:
            return None

    @property
    def uid(self):
        return self.definition['metadata']['uid']

    def get_provision_data(self):
        merged_data = {}
        component_data = {}
        for i, resource in enumerate(self.definition.get('status', {}).get('resources', [])):
            try:
                state = resource.get('state', {})
                if state and state['kind'] == 'AnarchySubject':
                    resource_provision_data = state['spec']['vars']['provision_data']
                    merged_data = deep_update(merged_data, resource_provision_data)
                    # Set provision data by numeric index
                    component_data[i] = resource_provision_data
                    # Set provision data by name if name is set
                    if 'name' in resource:
                        component_data[resource['name']] = resource_provision_data
            except (IndexError, KeyError):
                pass
        return merged_data, component_data

    async def refetch(self):
        self.definition = await Babylon.custom_objects_api.get_namespaced_custom_object(
            group=Babylon.resource_broker_domain,
            name=self.name,
            namespace=self.namespace,
            plural='resourceclaims',
            version=Babylon.resource_broker_api_version,
        )
