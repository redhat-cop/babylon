import kubernetes_asyncio

from babylon import Babylon

class Workshop:
    @classmethod
    async def get(cls, name, namespace):
        try:
            definition = await Babylon.custom_objects_api.get_namespaced_custom_object(
                group = Babylon.babylon_domain,
                name = name,
                namespace = namespace,
                plural = 'workshops',
                version = Babylon.babylon_api_version,
            )
            return Workshop(definition=definition)
        except kubernetes_asyncio.client.rest.ApiException as e:
            if e.status == 404:
                return None
            else:
                raise

    def __init__(self, definition):
        self.definition = definition

    @property
    def annotations(self):
        return self.definition['metadata'].get('annotations', {})

    @property
    def creation_timestamp(self):
        return self.definition['metadata']['creationTimestamp']

    @property
    def has_status(self):
        return 'status' in self.definition

    @property
    def ignore(self):
        return Babylon.babylon_ignore_label in self.labels

    @property
    def labels(self):
        return self.definition['metadata'].get('labels', {})

    @property
    def lifespan_end(self):
        return self.definition.get('spec', {}).get('lifespan', {}).get('end')

    @property
    def name(self):
        return self.definition['metadata']['name']

    @property
    def namespace(self):
        return self.definition['metadata']['namespace']

    @property
    def notifier_disable(self):
        return 'disable' == self.annotations.get(f"{Babylon.babylon_domain}/notifier")

    @property
    def provision_complete(self):
        """Workshop is considered provisioned when there are active resource claims"""
        provision_count = self.definition.get('status', {}).get('provisionCount', {})
        active = provision_count.get('active', 0)
        ordered = provision_count.get('ordered', 0)
        return ordered > 0 and active > 0 and ordered == active

    @property
    def provision_started(self):
        """Workshop provision has started when there are ordered provisions"""
        provision_count = self.definition.get('status', {}).get('provisionCount', {})
        return provision_count.get('ordered', 0) > 0

    @property
    def requester(self):
        return self.annotations.get('demo.redhat.com/requester')

    @property
    def requester_email(self):
        """Get email from requester if it looks like an email address"""
        requester = self.requester
        if requester and '@' in requester:
            return requester
        return None

    @property
    def service_url(self):
        return self.annotations.get(f"{Babylon.babylon_domain}/url")

    @property
    def uid(self):
        return self.definition['metadata']['uid']

    @property
    def workshop_id(self):
        return self.labels.get(f"{Babylon.babylon_domain}/workshopId")

    async def refetch(self):
        self.definition = await Babylon.custom_objects_api.get_namespaced_custom_object(
            group=Babylon.babylon_domain,
            name=self.name,
            namespace=self.namespace,
            plural='workshops',
            version=Babylon.babylon_api_version,
        )

