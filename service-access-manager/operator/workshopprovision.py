from babylon import Babylon
from kopfobject import KopfObject

class WorkshopProvision(KopfObject):
    api_group = Babylon.babylon_domain
    api_version = Babylon.babylon_api_version
    kind = 'WorkshopProvision'
    plural = 'workshopprovisions'
