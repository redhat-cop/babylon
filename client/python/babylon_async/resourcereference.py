class ResourceReference:
    def __init__(self, definition):
        self.definition = definition

    @property
    def api_version(self) -> str:
        return self.definition['apiVersion']

    @property
    def kind(self) -> str:
        return self.definition['kind']

    @property
    def name(self) -> str:
        return self.definition['name']

    @property
    def namespace(self) -> str|None:
        return self.definition.get('namespace')
