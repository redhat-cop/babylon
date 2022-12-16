from labuserinterface import LabUserInterface

class UserAssignment:
    def __init__(self,
        data = None,
        definition = None,
        lab_user_interface = None,
        messages = None,
        resource_claim_name = None,
        user_name = None,
    ):
        if definition:
            self.data = definition.get('data')
            self.messages = definition.get('messages')
            self.resource_claim_name = definition.get('resourceClaimName')
            self.user_name = definition.get('userName')
            if 'labUserInterface' in definition:
                self.lab_user_interface = LabUserInterface(definition=definition['labUserInterface'])
        else:
            self.data = data
            self.lab_user_interface = lab_user_interface
            self.messages = messages
            self.resource_claim_name = resource_claim_name
            self.user_name = user_name

    def serialize(self):
        ret = {}
        if self.data:
            ret['data'] = self.data
        if self.lab_user_interface:
            ret['labUserInterface'] = self.lab_user_interface.serialize()
        if self.messages:
            ret['messages'] = self.messages
        if self.resource_claim_name:
            ret['resourceClaimName'] = self.resource_claim_name
        if self.user_name:
            ret['userName'] = self.user_name
        return ret
