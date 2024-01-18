import json

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
    def annotations(self):
        return self.namespace.metadata.annotations

    @property
    def contact_email_addresses(self):
        contact_email = self.annotations.get('babylon.gpte.redhat.com/contactEmail')
        if contact_email == '':
            return []
        elif contact_email:
            return [a.strip() for a in contact_email.split(',')]

        requester = self.annotations.get('openshift.io/requester')
        if requester and '@' in requester:
            return [requester]
        else:
            return []

    @property
    def display_name(self):
        return self.annotations.get('openshift.io/display-name', self.name)

    @property
    def name(self):
        return self.namespace.metadata.name

    @property
    def notifier_config(self):
        config_json = self.annotations.get(Babylon.notifier_config_annotation)
        if not config_json:
            return {}
        return json.loads(config_json)

    def get_email_recipients(self, resource_claim):
        email_recipient_annotation = self.notifier_config.get(
            'emailRecipientAnnotation', Babylon.email_recipient_annotation
        )
        if not email_recipient_annotation or email_recipient_annotation not in resource_claim.annotations:
            return self.contact_email_addresses
        email_string = resource_claim.annotations.get(email_recipient_annotation)
        if not email_string:
            return []
        return [email.strip() for email in email_string.split(',')]
