import json

from copy import deepcopy
from datetime import datetime, timezone

import kubernetes_asyncio

from babylon import Babylon
from k8sobject import K8sObject

class ResourceProvider(K8sObject):
    api_group = Babylon.poolboy_domain
    api_version = Babylon.poolboy_api_version
    kind = 'ResourceProvider'
    plural = 'resourceproviders'

    @property
    def parameters(self):
        return self.definition.get('spec', {}).get('parameters', [])

    def has_parameter(self, name):
        for parameter in self.parameters:
            if name == parameter.get('name'):
                return True
        return False
