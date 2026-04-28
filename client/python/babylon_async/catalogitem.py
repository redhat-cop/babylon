from __future__ import annotations
from typing import Any

from datetime import datetime, timedelta

import pytimeparse

from .k8s_object import K8sObject
from .resourceprovider import ResourceProvider

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
    def external_url(self) -> str|None:
        return self.spec.external_url

    @property
    def display_name(self) -> str:
        return self.spec.display_name

    @property
    def parameters(self) -> list[CatalogItemSpecParameter]:
        return self.spec.parameters

    @property
    def provider(self) -> str:
        return self.metadata.labels.get('babylon.gpte.redhat.com/Provider')

    async def get_resource_provider(self, cache:bool=False) -> ResourceProvider:
        return await self.client.get_resource_provider(
            cache=cache,
            name=self.name,
        )

class CatalogItemSpec:
    def __init__(self, definition):
        self.__definition = definition
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
        self.parameters = (
            CatalogItemSpecParameter(item)
            for item in definition.get('parameters', [])
        )
        self.runtime = (
            CatalogItemSpecLifespan(definition['runtime'])
            if 'runtime' in definition else None
        )

    @property
    def category(self) -> str:
        return self.__definition['category']

    @property
    def display_name(self) -> str:
        return self.__definition['displayName']

    @property
    def external_url(self) -> str|None:
        return self.__definition.get('externalUrl')

    @property
    def provision_time_estimate(self) -> timedelta|None:
        if 'provisionTimeEstimate' not in self.__definition:
            return None
        return timedelta(seconds=pytimeparse.parse(self.__definition['provisionTimeEstimate']))

    @property
    def terms_of_service(self) -> str|None:
        return self.__definition.get('termsOfService')

    @property
    def workshop_lab_ui_redirect(self) -> bool|None:
        return self.__definition.get('workshopLabUiRedirect')

    @property
    def workshop_ui_max_instances(self) -> bool|None:
        return self.__definition.get('workshopUiMaxInstances')

    @property
    def workshop_user_mode(self) -> str:
        return self.__definition.get('workshopUserMode')

class CatalogItemSpecAgnosticvRepo:
    def __init__(self, definition):
        self.__definition = definition
        self.git = CatalogItemSpecAgnosticvRepoGit(definition['git'])

    @property
    def name(self) -> str:
        return self.__definition['name']

class CatalogItemSpecAgnosticvRepoGit:
    def __init__(self, definition):
        self.__definition = definition

    @property
    def ref(self) -> str:
        return self.__definition['ref']

    @property
    def url(self) -> str:
        return self.__definition['url']

class CatalogItemSpecDescription:
    def __init__(self, definition):
        self.__definition = definition

    @property
    def content(self) -> str:
        return self.__definition['content']

    @property
    def format(self) -> str:
        return self.__definition['format']

class CatalogItemSpecLastUpdate:
    def __init__(self, definition):
        self.__definition = definition
        self.git = CatalogItemSpecLastUpdateGit(definition['git'])

class CatalogItemSpecLastUpdateGit:
    def __init__(self, definition):
        self.__definition = definition

    @property
    def author(self) -> str:
        return self.__definition['author']

    @property
    def committer(self) -> str:
        return self.__definition['committer']

    @property
    def hash(self) -> str:
        return self.__definition['hash']

    @property
    def message(self) -> str:
        return self.__definition['message']

    @property
    def when_author(self) -> datetime:
        return datetime.strptime(self.__definition['when_author'], '%Y-%m-%dT%H:%M:%S%z')

    @property
    def when_committer(self) -> datetime:
        return datetime.strptime(self.__definition['when_committer'], '%Y-%m-%dT%H:%M:%S%z')

class CatalogItemSpecLifespan:
    def __init__(self, definition):
        self.__definition = definition

    @property
    def default(self) -> timedelta:
        return timedelta(seconds=pytimeparse.parse(self.__definition['default']))

    @property
    def maximum(self) -> timedelta:
        return timedelta(seconds=pytimeparse.parse(self.__definition['maximum']))

    @property
    def relative_maximum(self) -> timedelta:
        return timedelta(seconds=pytimeparse.parse(self.__definition['relativeMaximum']))

class CatalogItemSpecParameter:
    def __init__(self, definition):
        self.__definition = definition

    @property
    def annotation(self) -> str|None:
        return self.__definition.get('annotation')

    @property
    def description(self) -> str|None:
        return self.__definition.get('description')

    @property
    def default(self) -> Any:
        if self.openapi_v3_schema is None:
            return None
        return self.openapi_v3_schema.get('default')

    @property
    def form_label(self) -> str|None:
        return self.__definition.get('formLabel')

    @property
    def form_require_condition(self) -> str|None:
        return self.__definition.get('formRequireCondition')

    @property
    def name(self) -> str:
        return self.__definition['name']

    @property
    def openapi_v3_schema(self) -> Mapping|None:
        return self.__definition.get('openAPIV3Schema')

    @property
    def required(self) -> bool:
        return self.__definition.get('required', False)

    @property
    def validation(self) -> str|None:
        return self.__definition.get('validation')

class CatalogItemSpecRuntime:
    def __init__(self, definition):
        self.__definition = definition

    @property
    def default(self) -> timedelta:
        return timedelta(seconds=pytimeparse.parse(self.__definition['default']))

    @property
    def maximum(self) -> timedelta:
        return timedelta(seconds=pytimeparse.parse(self.__definition['maximum']))
