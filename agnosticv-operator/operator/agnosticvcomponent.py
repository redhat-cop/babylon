import json
from copy import deepcopy
from typing import Mapping

import kopf
import kubernetes_asyncio

from str2bool import str2bool
from uuid import UUID

from babylon_async import TenantClusterPool

from operatorruntime import OperatorRuntime
from kopfobject import KopfObject

import agnosticvrepo

class AgnosticVComponent(KopfObject):
    """DEPRECATED
    This class is being replaced with the class in the babylon client library."""
    api_group = OperatorRuntime.agnosticv_api_group
    api_version = f"{OperatorRuntime.agnosticv_api_group}/{OperatorRuntime.agnosticv_version}"
    kind = 'AgnosticVComponent'
    plural = 'agnosticvcomponents'
    version = OperatorRuntime.agnosticv_version

    @property
    def __meta__(self):
        return self.spec['definition'].get('__meta__', {})

    @property
    def account(self):
        return self.name.split('.')[0]

    @property
    def agnosticv_repo(self):
        return self.spec['agnosticvRepo']

    @property
    def asset_uuid(self):
        return self.__meta__.get('asset_uuid', '')

    @property
    def catalog_disable(self):
        if 'namespace' not in self.catalog_meta:
            return True
        return self.catalog_meta.get('disable', False)

    @property
    def catalog_display_name(self):
        return self.catalog_meta.get('display_name', self.name)

    @property
    def catalog_meta(self):
        return self.__meta__.get('catalog', {})

    @property
    def definition(self):
        return self.spec['definition']

    @property
    def deployer(self):
        return self.__meta__.get('deployer', {})

    @property
    def deployer_actions(self):
        ret = self.deployer.get('actions', {})
        for action in ('destroy', 'provision', 'start', 'status', 'stop'):
            if action not in ret:
                ret[action] = {}
        return ret

    @property
    def deployer_provision_time_estimate(self):
        return self.deployer_actions['provision'].get('time_estimate')

    @property
    def last_update(self):
        return self.__meta__.get('last_update')

    @property
    def path(self):
        return self.spec['path']

    @property
    def pull_request_commit_hash(self):
        return self.spec.get('pullRequestCommitHash')

    @property
    def pull_request_number(self):
        return self.spec.get('pullRequestNumber')

    @property
    def secrets(self):
        return self.__meta__.get('secrets', [])

    @property
    def stage(self):
        return self.name.split('.')[-1]

    @property
    def template_vars(self):
        return {
            "asset_uuid": self.asset_uuid,
            "merged_vars": self.definition,
            **self.definition,
            "stage": self.stage,
        }
