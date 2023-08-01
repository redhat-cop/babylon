import kubernetes_asyncio

from babylon import Babylon

class ServiceNamespace:
    @classmethod
    async def get(cls, name):
        try:
            namespace = await Babylon.core_v1_api.read_namespace(name)
            return ServiceNamespace(namespace)
        except kubernetes_asyncio.client.rest.ApiException as e:
            if e.status == 404:
                return None
            else:
                raise

    def __init__(self, namespace):
        self.namespace = namespace

    @property
    def contact_email_addresses(self):
        contact_email = self.namespace.metadata.annotations.get('babylon.gpte.redhat.com/contactEmail')
        if contact_email == '':
            return []
        elif contact_email:
            return [a.strip() for a in contact_email.split(',')]

        requester = self.namespace.metadata.annotations.get('openshift.io/requester')
        if requester and '@' in requester:
            return [requester]
        else:
            return []

    @property
    def display_name(self):
        return self.namespace.metadata.annotations.get('openshift.io/display-name', self.name)

    @property
    def name(self):
        return self.namespace.metadata.name
