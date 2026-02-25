from k8sobject import K8sObject

class OpenShiftUser(K8sObject):
    api_group = 'user.openshift.io'
    api_version = 'v1'
    kind = 'User'
    plural = 'users'
