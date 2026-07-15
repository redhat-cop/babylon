from __future__ import annotations
from copy import deepcopy
from typing import Any, List, Mapping

from datetime import datetime, timedelta

import deepmerge
import jinja2
import openapi_schema_validator
import pytimeparse

from .k8s_object import K8sObject
from .resourcepool import ResourcePool
from .resourceprovider import ResourceProvider

template_merger = deepmerge.Merger(
    [(dict, ["merge"])],
    ["override"],
    ["override"],
)

class CatalogItem(K8sObject):
    api_group = "babylon.gpte.redhat.com"
    api_version = "v1"
    kind = "CatalogItem"
    plural = "catalogitems"
    api_group_version = f"{api_group}/{api_version}"

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

    @property
    def spec(self) -> CatalogItemSpec:
        return CatalogItemSpec(self._definition['spec'])

    async def check_resource_pool_match(self,
        resource_pool: ResourcePool,
        cache: bool=False,
    ) -> bool:
        """Evaluate whether ResourcePool may match this catalog item."""
        # External catalog items will never match a pool
        if self.external_url is not None:
            return False

        # Gather job vars to extract parameter values
        all_job_vars = {}
        for resource in resource_pool.spec.resources:
            all_job_vars.update(
                resource.template.get('spec', {}).get('vars', {}).get('job_vars', {})
            )

        parameter_values = {}
        for parameter in self.parameters:
            if parameter.name in all_job_vars:
                if parameter.validate(all_job_vars[parameter.name]):
                    parameter_values[parameter.name] = all_job_vars[parameter.name]
            elif parameter.default is not None:
                parameter_values[parameter.name] = parameter.default

        resource_provider = await self.get_resource_provider(cache=True)
        try:
            resource_provider_resources = await resource_provider.get_resources(
                parameter_values=parameter_values,
                cache=True,
            )
        except (TypeError, jinja2.exceptions.UndefinedError):
            # Template evaluation failed, so must not match
            return False

        # Match is impossible if resource pool has more resources than the provider specifies
        if len(resource_pool.spec.resources) > len(resource_provider_resources):
            return False

        # Discard fields that don't need to match
        for resource in resource_provider_resources:
            resource.pop('name')
            resource['template']['spec']['vars'].pop('action_schedule', None)

        for idx, pool_resource in enumerate(resource_pool.spec.resources):
            resource_provider_resource = resource_provider_resources[idx]
            # All vars from the resource_provider must match, but pool may have other vars
            template_cmp = template_merger.merge(
                deepcopy(pool_resource.template),
                resource_provider_resource['template'],
            )
            if pool_resource.provider.name != resource_provider_resource['provider']['name']:
                return False
            if pool_resource.template != template_cmp:
                return False
        return True

    async def get_resource_provider(self, cache:bool=False) -> ResourceProvider:
        return await self.client.get_resource_provider(
            cache=cache,
            name=self.name,
        )

class CatalogItemSpec:
    def __init__(self, definition):
        self._definition = definition

    @property
    def agnosticv_repo(self) -> CatalogItemSpecAgnosticvRepo|None:
        if 'agnosticvRepo' not in self._definition:
            return None
        return CatalogItemSpecAgnosticvRepo(self._definition['agnosticvRepo'])

    @property
    def category(self) -> str:
        return self._definition['category']

    @property
    def description(self) -> CatalogItemSpecDescription|None:
        if 'description' not in self._definition:
            return None
        return CatalogItemSpecDescription(self._definition['description'])

    @property
    def display_name(self) -> str:
        return self._definition['displayName']

    @property
    def external_url(self) -> str|None:
        return self._definition.get('externalUrl')

    @property
    def last_update(self) -> CatalogItemSpecLastUpdate|None:
        if 'last_update' not in self._definition:
            return None
        return CatalogItemSpecLastUpdate(self._definition['last_update'])

    @property
    def lifespan(self) -> CatalogItemSpecLifespan|None:
        if 'lifespan' not in self._definition:
            return None
        return CatalogItemSpecLifespan(self._definition['lifespan'])

    @property
    def parameters(self) -> List[CatalogItemSpecParameter]:
        return [
            CatalogItemSpecParameter(item)
            for item in self._definition.get('parameters', [])
        ]

    @property
    def provision_time_estimate(self) -> timedelta|None:
        if 'provisionTimeEstimate' not in self._definition:
            return None
        return timedelta(seconds=pytimeparse.parse(self._definition['provisionTimeEstimate']))

    @property
    def runtime(self) -> CatalogItemSpecRuntime|None:
        if 'runtime' not in self._definition:
            return None
        return CatalogItemSpecRuntime(self._definition['runtime'])

    @property
    def terms_of_service(self) -> str|None:
        return self._definition.get('termsOfService')

    @property
    def workshop_lab_ui_redirect(self) -> bool|None:
        return self._definition.get('workshopLabUiRedirect')

    @property
    def workshop_ui_max_instances(self) -> bool|None:
        return self._definition.get('workshopUiMaxInstances')

    @property
    def workshop_user_mode(self) -> str:
        return self._definition.get('workshopUserMode')

class CatalogItemSpecAgnosticvRepo:
    def __init__(self, definition):
        self._definition = definition

    @property
    def git(self) -> CatalogItemSpecAgnosticvRepoGit:
        return CatalogItemSpecAgnosticvRepoGit(self._definition['git'])

    @property
    def name(self) -> str:
        return self._definition['name']

class CatalogItemSpecAgnosticvRepoGit:
    def __init__(self, definition):
        self._definition = definition

    @property
    def ref(self) -> str:
        return self._definition['ref']

    @property
    def url(self) -> str:
        return self._definition['url']

class CatalogItemSpecDescription:
    def __init__(self, definition):
        self._definition = definition

    @property
    def content(self) -> str:
        return self._definition['content']

    @property
    def format(self) -> str:
        return self._definition['format']

class CatalogItemSpecLastUpdate:
    def __init__(self, definition):
        self._definition = definition

    @property
    def git(self) -> CatalogItemSpecLastUpdateGit:
        return CatalogItemSpecLastUpdateGit(self._definition['git'])

class CatalogItemSpecLastUpdateGit:
    def __init__(self, definition):
        self._definition = definition

    @property
    def author(self) -> str:
        return self._definition['author']

    @property
    def committer(self) -> str:
        return self._definition['committer']

    @property
    def hash(self) -> str:
        return self._definition['hash']

    @property
    def message(self) -> str:
        return self._definition['message']

    @property
    def when_author(self) -> datetime:
        return datetime.strptime(self._definition['when_author'], '%Y-%m-%dT%H:%M:%S%z')

    @property
    def when_committer(self) -> datetime:
        return datetime.strptime(self._definition['when_committer'], '%Y-%m-%dT%H:%M:%S%z')

class CatalogItemSpecLifespan:
    def __init__(self, definition):
        self._definition = definition

    @property
    def default(self) -> timedelta:
        return timedelta(seconds=pytimeparse.parse(self._definition['default']))

    @property
    def maximum(self) -> timedelta:
        return timedelta(seconds=pytimeparse.parse(self._definition['maximum']))

    @property
    def relative_maximum(self) -> timedelta:
        return timedelta(seconds=pytimeparse.parse(self._definition['relativeMaximum']))

class CatalogItemSpecParameter:
    def __init__(self, definition):
        self._definition = definition

    @property
    def annotation(self) -> str|None:
        return self._definition.get('annotation')

    @property
    def description(self) -> str|None:
        return self._definition.get('description')

    @property
    def default(self) -> Any:
        if self.openapi_v3_schema is None:
            return None
        return self.openapi_v3_schema.get('default')

    @property
    def form_label(self) -> str|None:
        return self._definition.get('formLabel')

    @property
    def form_require_condition(self) -> str|None:
        return self._definition.get('formRequireCondition')

    @property
    def name(self) -> str:
        return self._definition['name']

    @property
    def openapi_v3_schema(self) -> Mapping|None:
        return self._definition.get('openAPIV3Schema')

    @property
    def openapi_v3_schema_validator(self) -> openapi_schema_validator.OAS30Validator|None:
        schema = self._definition.get('openAPIV3Schema')
        if schema is None:
            return None
        return openapi_schema_validator.OAS30Validator(schema)

    @property
    def required(self) -> bool:
        return self._definition.get('required', False)

    @property
    def validation(self) -> str|None:
        return self._definition.get('validation')

    def validate(self, value:Any) -> bool:
        # This ideally would also check `validation`, but these checks are
        # currently only possible to check on the client side.
        if self.openapi_v3_schema is None:
            return True
        try:
            self.openapi_v3_schema_validator.validate(value)
            return True
        except openapi_schema_validator.validators.ValidationError:
            return False

class CatalogItemSpecRuntime:
    def __init__(self, definition):
        self._definition = definition

    @property
    def default(self) -> timedelta:
        return timedelta(seconds=pytimeparse.parse(self._definition['default']))

    @property
    def maximum(self) -> timedelta:
        return timedelta(seconds=pytimeparse.parse(self._definition['maximum']))
