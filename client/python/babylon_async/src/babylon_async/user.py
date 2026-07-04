from __future__ import annotations
from typing import List

from .k8s_object import K8sObject

class User(K8sObject):
    api_group = "user.openshift.io"
    api_version = "v1"
    kind = "User"
    plural = "users"
    api_group_version = f"{api_group}/{api_version}"

    @property
    def groups(self) -> List[str]|None:
        """Groups list is populated by the OpenShift API only when fetching current user, `~`"""
        return self._definition.get('groups')

    @property
    def identities(self) -> List[str]:
        return self._definition.get('identities', [])
