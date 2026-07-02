class ResourceReference:
    def __init__(self, definition):
        self.__definition = definition

    @property
    def api_version(self) -> str:
        return self.__definition['apiVersion']

    @property
    def kind(self) -> str:
        return self.__definition['kind']

    @property
    def name(self) -> str:
        return self.__definition['name']

    @property
    def namespace(self) -> str|None:
        return self.__definition.get('namespace')

    @property
    def uid(self) -> str|None:
        return self.__definition.get('uid')
