class ServiceNamespace:
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
