import os

babylon_domain = os.environ.get('BABYLON_DOMAIN', 'babylon.gpte.redhat.com')
rating_label = f"{babylon_domain}/rating"

class CatalogItem:
    def __init__(self, definition):
        self.definition = definition

    @property
    def name(self):
        return self.definition['metadata']['name']

    @property
    def namespace(self):
        return self.definition['metadata']['namespace']

    @property
    def rating(self):
        return self.definition['metadata'].get('labels', {}).get(rating_label, None)
