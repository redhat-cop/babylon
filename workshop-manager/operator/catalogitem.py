from babylon import Babylon
from k8sobject import K8sObject

class CatalogItem(K8sObject):
    api_group = Babylon.babylon_domain
    api_version = Babylon.babylon_api_version
    kind = 'CatalogItem'
    plural = 'catalogitems'

    @classmethod
    async def fetch(cls, name, namespace):
        definition = await super().fetch_definition(name=name, namespace=namespace)
        catalog_namespace = await Babylon.core_v1_api.read_namespace(namespace)
        return cls(definition, catalog_namespace)

    def __init__(self, definition, catalog_namespace):
        super().__init__(definition)
        self.catalog_namespace = catalog_namespace

    @property
    def catalog_display_name(self):
        if self.catalog_namespace.metadata.annotations \
        and 'openshift.io/display-name' in self.catalog_namespace.metadata.annotations:
            return self.catalog_namespace.metadata.annotations['openshift.io/display-name']
        return self.catalog_namespace.metadata.name

    @property
    def display_name(self):
        return self.annotations.get(Babylon.display_name_annotation, self.name)

    @property
    def lab_ui_type(self):
        if 'bookbag' in self.spec:
            return 'bookbag'
        return None

    @property
    def parameters(self):
        return [
            CatalogItemParameter(item, resource_count=len(self.resources))
            for item in self.spec.get('parameters', [])
        ]

    @property
    def resources(self):
        return self.spec.get('resources', [])

class CatalogItemParameter:
    def __init__(self, definition, resource_count):
        self.annotation = definition.get('annotation')
        self.default = definition.get('value')
        self.name = definition.get('name')
        self.open_api_v3_schema = definition.get('openAPIV3Schema')
        self.required = definition.get('required', False)
        self.variable = definition.get('variable', None if self.annotation else self.name)

        if 'resourceIndexes' in definition:
            self.resource_indexes = [
                resource_count - 1 if idx == '@' else idx
                for idx in definition['resourceIndexes']
            ]
        else:
            self.resource_indexes = [ resource_count - 1 ]

        if self.open_api_v3_schema:
            if 'default' in self.open_api_v3_schema:
                self.default = self.open_api_v3_schema['default']
            elif 'value' in definition:
                data_type = self.open_api_v3_schema.get('type')
                if data_type == 'boolean':
                    self.default = self.default.lower() in ('1', 'on', 't', 'true', 'y', 'yes')
                elif data_type == 'integer':
                    self.default = int(self.default)
                elif data_type == 'number':
                    self.default = float(self.default)
