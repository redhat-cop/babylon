class CatalogItem:
    def __init__(self, definition):
        self.definition = definition

    @property
    def display_name(self):
        return self.definition['metadata'].get('annotations', {}).get('babylon.gpte.redhat.com/displayName', self.name)

    @property
    def name(self):
        return self.definition['metadata']['name']

    @property
    def namespace(self):
        return self.definition['metadata']['namespace']

    @property
    def resources(self):
        return self.definition['spec']['resources']
