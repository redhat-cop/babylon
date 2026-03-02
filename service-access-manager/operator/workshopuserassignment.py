from babylon import Babylon
from kopfobject import KopfObject

class WorkshopUserAssignment(KopfObject):
    api_group = Babylon.babylon_domain
    api_version = Babylon.babylon_api_version
    kind = 'WorkshopUserAssignment'
    plural = 'workshopuserassignments'
