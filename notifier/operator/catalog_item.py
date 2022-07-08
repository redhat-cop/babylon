class CatalogItem:
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
    def resources(self):
        return self.definition['spec']['resources']

    @property
    def survey_link(self):
        # TBD
        return None

    def get_message_template(self, template_name):
        return self.definition['spec'].get('messageTemplates', {}).get(template_name, {}).get('template')
