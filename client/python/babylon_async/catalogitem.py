from __future__ import annotations
from typing import Any

from datetime import datetime, timedelta

import pytimeparse

from .k8s_object import K8sObject

class CatalogItem(K8sObject):
    api_group = "babylon.gpte.redhat.com"
    api_version = "v1"
    kind = "CatalogItem"
    plural = "catalogitems"
    api_group_version = f"{api_group}/{api_version}"

    def __init__(self, client, definition):
        super().__init__(client, definition)
        self.spec = CatalogItemSpec(definition['spec'])

    @property
    def asset_uuid(self) -> str:
        return self.metadata.labels.get('gpte.redhat.com/asset-uuid')

    @property
    def category(self) -> str:
        return self.spec.category

    @property
    def display_name(self) -> str:
        return self.spec.display_name

    @property
    def provider(self) -> str:
        return self.metadata.labels.get('babylon.gpte.redhat.com/Provider')

class CatalogItemSpec:
    def __init__(self, definition):
        self.definition = definition
        self.agnosticv_repo = (
            CatalogItemSpecAgnosticvRepo(definition['agnosticvRepo'])
            if 'agnosticvRepo' in definition else None
        )
        self.description = (
            CatalogItemSpecDescription(definition['description'])
            if 'description' in definition else None
        )
        self.last_update = (
            CatalogItemSpecLastUpdate(definition['lastUpdate'])
            if 'lastUpdate' in definition else None
        )
        self.lifespan = (
            CatalogItemSpecLifespan(definition['lifespan'])
            if 'lifespan' in definition else None
        )
        self.runtime = (
            CatalogItemSpecLifespan(definition['runtime'])
            if 'runtime' in definition else None
        )

    @property
    def category(self) -> str:
        return self.definition['category']

    @property
    def display_name(self) -> str:
        return self.definition['displayName']

    @property
    def provision_time_estimate(self) -> timedelta|None:
        if 'provisionTimeEstimate' not in self.definition:
            return None
        return timedelta(seconds=pytimeparse.parse(self.definition['provisionTimeEstimate']))

    @property
    def terms_of_service(self) -> str|None:
        return self.definition.get('termsOfService')

    @property
    def workshop_lab_ui_redirect(self) -> bool|None:
        return self.definition.get('workshopLabUiRedirect')

    @property
    def workshop_ui_max_instances(self) -> bool|None:
        return self.definition.get('workshopUiMaxInstances')

    @property
    def workshop_user_mode(self) -> str:
        return self.definition.get('workshopUserMode')

class CatalogItemSpecAgnosticvRepo:
    def __init__(self, definition):
        self.definition = definition
        self.git = CatalogItemSpecAgnosticvRepoGit(definition['git'])

    @property
    def name(self) -> str:
        return self.definition['name']

class CatalogItemSpecAgnosticvRepoGit:
    def __init__(self, definition):
        self.definition = definition

    @property
    def ref(self) -> str:
        return self.definition['ref']

    @property
    def url(self) -> str:
        return self.definition['url']

class CatalogItemSpecDescription:
    def __init__(self, definition):
        self.definition = definition

    @property
    def content(self) -> str:
        return self.definition['content']

    @property
    def format(self) -> str:
        return self.definition['format']

class CatalogItemSpecLastUpdate:
    def __init__(self, definition):
        self.definition = definition
        self.git = CatalogItemSpecLastUpdateGit(definition['git'])

class CatalogItemSpecLastUpdateGit:
    def __init__(self, definition):
        self.definition = definition

    @property
    def author(self) -> str:
        return self.definition['author']

    @property
    def committer(self) -> str:
        return self.definition['committer']

    @property
    def hash(self) -> str:
        return self.definition['hash']

    @property
    def message(self) -> str:
        return self.definition['message']

    @property
    def when_author(self) -> datetime:
        return datetime.strptime(self.definition['when_author'], '%Y-%m-%dT%H:%M:%S%z')

    @property
    def when_committer(self) -> datetime:
        return datetime.strptime(self.definition['when_committer'], '%Y-%m-%dT%H:%M:%S%z')

class CatalogItemSpecLifespan:
    def __init__(self, definition):
        self.definition = definition

    @property
    def default(self) -> timedelta:
        return timedelta(seconds=pytimeparse.parse(self.definition['default']))

    @property
    def maximum(self) -> timedelta:
        return timedelta(seconds=pytimeparse.parse(self.definition['maximum']))

    @property
    def relative_maximum(self) -> timedelta:
        return timedelta(seconds=pytimeparse.parse(self.definition['relativeMaximum']))

class CatalogItemSpecRuntime:
    def __init__(self, definition):
        self.definition = definition

    @property
    def default(self) -> timedelta:
        return timedelta(seconds=pytimeparse.parse(self.definition['default']))

    @property
    def maximum(self) -> timedelta:
        return timedelta(seconds=pytimeparse.parse(self.definition['maximum']))
