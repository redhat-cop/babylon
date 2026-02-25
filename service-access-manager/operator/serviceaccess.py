from babylon import Babylon
from k8sobject import K8sObject

class ServiceAccess(K8sObject):
    api_group = Babylon.babylon_domain
    api_version = Babylon.babylon_api_version
    kind = 'ServiceAccess'
    plural = 'serviceaccesses'
