import kubernetes_asyncio

from datetime import timedelta
from pytimeparse.timeparse import timeparse

from babylon import Babylon

class CatalogItem:
    @classmethod
    async def get(cls, name, namespace):
        try:
            definition = await Babylon.custom_objects_api.get_namespaced_custom_object(
                group = Babylon.babylon_domain,
                name = name,
                namespace = namespace,
                plural = 'catalogitems',
                version = Babylon.babylon_api_version,
            )
            return CatalogItem(definition=definition)
        except kubernetes_asyncio.client.rest.ApiException as e:
            if e.status == 404:
                return None
            else:
                raise

    def __init__(self, definition):
        self.definition = definition

    @property
    def display_name(self):
        return self.definition['metadata'].get('annotations', {}).get('babylon.gpte.redhat.com/displayName', self.name)

    @property
    def lab_ui_type(self):
        if 'bookbag' in self.definition['spec']:
            return 'bookbag'
        else:
            return None

    @property
    def name(self):
        return self.definition['metadata']['name']

    @property
    def namespace(self):
        return self.definition['metadata']['namespace']

    @property
    def notification_before_retirement_timedelta(self):
        interval_text = (self.
            definition['spec'].
            get('messageTemplates', {}).
            get('retirementScheduled', {}).
            get('timeIntervalBeforeRetirement')
        )
        if interval_text:
            return timedelta(seconds=timeparse(interval_text))
        else:
            return timedelta(days=1)

    @property
    def provision_failed_email_disabled(self):
        return (self.
            definition['spec'].
            get('messageTemplates', {}).
            get('provisionFailed', {}).
            get('disable', False)
        )

    @property
    def provision_failed_email_subject_template(self):
        return (self.
            definition['spec'].
            get('messageTemplates', {}).
            get('provisionFailed', {}).
            get('emailSubject',
                "ERROR: {{catalog_namespace.display_name}} service {{service_display_name}} has failed to provision"
            )
        )

    @property
    def provision_started_email_disabled(self):
        return (self.
            definition['spec'].
            get('messageTemplates', {}).
            get('provisionStarted', {}).
            get('disable', False)
        )

    @property
    def provision_started_email_subject_template(self):
        return (self.
            definition['spec'].
            get('messageTemplates', {}).
            get('provisionStarted', {}).
            get('emailSubject',
                "{{catalog_namespace.display_name}} service {{service_display_name}} has begun provisioning"
            )
        )

    @property
    def resources(self):
        return self.definition['spec']['resources']

    @property
    def retirement_scheduled_email_disabled(self):
        return (self.
            definition['spec'].
            get('messageTemplates', {}).
            get('retirementScheduled', {}).
            get('disable', False)
        )

    @property
    def retirement_scheduled_email_subject_template(self):
        return (self.
            definition['spec'].
            get('messageTemplates', {}).
            get('retirementScheduled', {}).
            get('emailSubject',
                "{{catalog_namespace.display_name}} service {{service_display_name}} "
                "retirement in {{retirement_timedelta_humanized}}"
            )
        )

    @property
    def service_deleted_email_subject_template(self):
        return (self.
            definition['spec'].
            get('messageTemplates', {}).
            get('serviceDeleted', {}).
            get('emailSubject',
                "{{catalog_namespace.display_name}} service {{service_display_name}} has been deleted"
            )
        )

    @property
    def service_ready_email_disabled(self):
        return (self.
            definition['spec'].
            get('messageTemplates', {}).
            get('serviceReady', {}).
            get('disable', False)
        )

    @property
    def service_ready_email_subject_template(self):
        return (self.
            definition['spec'].
            get('messageTemplates', {}).
            get('serviceReady', {}).
            get('emailSubject',
                "{{catalog_namespace.display_name}} service {{service_display_name}} is ready"
            )
        )

    @property
    def start_complete_email_disabled(self):
        return (self.
            definition['spec'].
            get('messageTemplates', {}).
            get('startComplete', {}).
            get('disable', False)
        )

    @property
    def start_complete_email_subject_template(self):
        return (self.
            definition['spec'].
            get('messageTemplates', {}).
            get('startComplete', {}).
            get('emailSubject',
                "{{catalog_namespace.display_name}} service {{service_display_name}} has started"
            )
        )

    @property
    def start_failed_email_disabled(self):
        return (self.
            definition['spec'].
            get('messageTemplates', {}).
            get('startFailed', {}).
            get('disable', False)
        )

    @property
    def start_failed_email_subject_template(self):
        return (self.
            definition['spec'].
            get('messageTemplates', {}).
            get('startFailed', {}).
            get('emailSubject',
                "ERROR: {{catalog_namespace.display_name}} service {{service_display_name}} failed to start"
            )
        )

    @property
    def stop_complete_email_disabled(self):
        return (self.
            definition['spec'].
            get('messageTemplates', {}).
            get('stopComplete', {}).
            get('disable', False)
        )

    @property
    def stop_complete_email_subject_template(self):
        return (self.
            definition['spec'].
            get('messageTemplates', {}).
            get('stopComplete', {}).
            get('emailSubject',
                "{{catalog_namespace.display_name}} service {{service_display_name}} has stopped",
            )
        )

    @property
    def stop_failed_email_disabled(self):
        return (self.
            definition['spec'].
            get('messageTemplates', {}).
            get('stopFailed', {}).
            get('disable', False)
        )

    @property
    def stop_failed_email_subject_template(self):
        return (self.
            definition['spec'].
            get('messageTemplates', {}).
            get('stopFailed', {}).
            get('emailSubject',
                "ERROR: {{catalog_namespace.display_name}} service {{service_display_name}} failed to stop"
            )
        )

    @property
    def stop_scheduled_email_disabled(self):
        return (self.
            definition['spec'].
            get('messageTemplates', {}).
            get('stopScheduled', {}).
            get('disable', False)
        )

    @property
    def stop_scheduled_email_subject_template(self):
        return (self.
            definition['spec'].
            get('messageTemplates', {}).
            get('stopScheduled', {}).
            get('emailSubject',
                "{{catalog_namespace.display_name}} service {{service_display_name}} "
                "will stop in {{stop_timedelta_humanized}}"
            )
        )

    @property
    def survey_link(self):
        # TBD
        return None

    def get_message_template(self, template_name):
        return self.definition['spec'].get('messageTemplates', {}).get(template_name, {}).get('template')
