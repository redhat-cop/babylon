import json

class ServiceAccess:
    """Class which represents service access configuration such as found in the
    Workshop service access annotation."""
    @classmethod
    def load(cls, definition_json: str|None) -> 'ServiceAccess':
        """Load object from json definition."""
        if definition_json is None:
            return None
        try:
            return cls(json.loads(definition_json))
        except json.JSONDecodeError:
            return None

    def __init__(self, definition: dict):
        self.users = definition.get('users', [])
