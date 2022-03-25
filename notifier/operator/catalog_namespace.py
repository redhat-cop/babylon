class CatalogNamespace:
    def __init__(self, namespace):
        self.namespace = namespace

    @property
    def name(self):
        return self.namespace.metadata.name

    @property
    def display_name(self):
        return self.namespace.metadata.annotations.get('openshift.io/display-name', self.name)
