from __future__ import annotations
from typing import Any, Mapping

from datetime import datetime, timedelta

import pytimeparse

from .k8s_object import K8sObject
from .poolboy_templating import check_condition, recursive_process_template_strings
from .resourcereference import ResourceReference

class ResourceProvider(K8sObject):
    api_group = "poolboy.gpte.redhat.com"
    api_version = "v1"
    kind = "ResourceProvider"
    plural = "resourceproviders"
    api_group_version = f"{api_group}/{api_version}"

    def __init__(self, client, definition):
        super().__init__(client, definition)
        self.spec = ResourceProviderSpec(definition['spec'])

    def __str__(self):
        return f"ResourceProvider {self.name}"

    @property
    def has_template_definition(self) -> bool:
        return self.spec.has_template_definition

    @property
    def linked_resource_providers(self) -> list[ResourceProviderSpecLinkedResourceProvider]:
        return self.spec.linked_resource_providers

    @property
    def parameters(self) -> List[ResourceProviderSpecParameter]:
        return self.spec.parameters

    @property
    def resource_name(self) -> str:
        return self.definition.get('resourceName') or self.name

    @property
    def vars(self) -> Mapping[str, Any]:
        return self.spec.vars

    def get_parameter_defaults(self, parameter_values:Mapping) -> Mapping:
        ret = {}
        for parameter in self.parameters:
            if parameter.default is None:
                continue
            if parameter.default.template is not None:
                ret[parameter.name] = recursive_process_template_strings(
                    parameter.default.template,
                    variables=parameter_values,
                    template_variables=self.vars,
                )
            elif parameter.default.value is not None:
                ret[parameter.name] = parameter.value
        return ret

    def processed_template(self,
        parameter_values: Mapping,
    ) -> Mapping:
        return recursive_process_template_strings(
            self.spec.template.definition,
            variables=parameter_values,
            template_variables=self.vars,
        )

    async def get_resources(self,
        parameter_values: Mapping,
        cache: bool=False,
        resource_name: str|None=None,
    ):
        """Generate spec resources as used in ResourceHandle with given parameter_values"""
        linked_resource_providers = await self.get_linked_resource_providers(cache=cache)

        parameter_values = {
            **self.get_parameter_defaults(parameter_values=parameter_values),
            **parameter_values,
        }

        resources = []
        for linked_resource_provider in self.linked_resource_providers:
            if not linked_resource_provider.check_when(
                parameter_values=parameter_values,
                resource_provider=self,
            ):
                continue
            resource_provider = await self.client.get_resource_provider(
                cache=cache,
                name=linked_resource_provider.name,
            )
            resources.extend(
                await resource_provider.get_resources(
                    cache=cache,
                    parameter_values=parameter_values,
                )
            )

        if self.has_template_definition:
            resources.append({
                "name": resource_name or self.resource_name,
                "provider": self.as_reference(),
                "template": self.processed_template(parameter_values=parameter_values),
            })

        return resources

    async def get_linked_resource_providers(self, cache:bool=False):
        linked_resource_providers = []
        for linked_resource_provider in self.linked_resource_providers:
            resource_provider = await self.client.get_resource_provider(
                cache=cache,
                name=linked_resource_provider.name,
            )
            linked_resource_providers.append(resource_provider)
        return linked_resource_providers

class ResourceProviderSpec:
    def __init__(self, definition):
        self.definition = definition
        self.linked_resource_providers = [
            ResourceProviderSpecLinkedResourceProvider(item)
            for item in definition.get('linkedResourceProviders', [])
        ]
        self.parameters = [
            ResourceProviderSpecParameter(item)
            for item in definition.get('parameters', [])
        ]
        self.template = (
            ResourceProviderSpecTemplate(definition['template'])
            if 'template' in definition else None
        )

    @property
    def default(self) -> Mapping:
        return self.definition.get('default', {})

    @property
    def has_template_definition(self) -> bool:
        return 'override' in self.definition or (
            self.template is not None and
            self.template.definition is not None
        )

    @property
    def match_ignore(self) -> list[str]:
        return self.definition.get('match_ignore', [])

    @property
    def override(self) -> Mapping:
        return self.definition.get('override', {})

    @property
    def resource_name(self) -> str|None:
        return self.definition.get('resourceName')

    @property
    def vars(self) -> Mapping[str, Any]:
        return self.definition.get('vars', {})

class ResourceProviderSpecLinkedResourceProvider:
    def __init__(self, definition):
        self.__definition = definition
        self.template_vars = [
            ResourceProviderSpecLinkedResourceProviderTemplateVar(item)
            for item in definition.get('templateVars', [])
        ]

    @property
    def name(self) -> str:
        return self.__definition['name']

    @property
    def parameter_values(self) -> Mapping[str, Any]:
        return self.__definition.get('parameterValues', {})

    @property
    def resource_name(self) -> str:
        return self.__definition.get('resourceName', self.name)

    @property
    def wait_for(self) -> str|None:
        return self.__definition.get('waitFor')

    @property
    def when(self) -> str|None:
        return self.__definition.get('when')

    def check_when(self,
        parameter_values: Mapping,
        resource_provider: ResourceProvider,
    ):
        if not self.when:
            return True
        return check_condition(
            self.when,
            variables={
               **parameter_values,
               **self.parameter_values,
            },
            template_variables=resource_provider.spec.vars,
        )

class ResourceProviderSpecLinkedResourceProviderTemplateVar:
    def __init__(self, definition):
        self.__definition = definition

    @property
    def _from(self) -> str:
        return self.__definition['from']

    @property
    def name(self) -> str:
        return self.__definition['name']

class ResourceProviderSpecParameter:
    def __init__(self, definition):
        self.__definition = definition
        self.default = (
            ResourceProviderSpecParameterDefault(definition['default'])
            if 'default' in definition else None
        )

    @property
    def allow_update(self) -> bool:
        return self.__definition.get('allowUpdate', False)

    @property
    def name(self) -> str:
        return self.__definition['name']

    @property
    def required(self) -> bool:
        return self.__definition.get('required', False)

class ResourceProviderSpecParameterDefault:
    def __init__(self, definition):
        self.__definition = definition

    @property
    def template(self) -> Any:
        return self.__definition.get('template')

    @property
    def value(self) -> Any:
        return self.__definition.get('value')

class ResourceProviderSpecTemplate:
    def __init__(self, definition):
        self.__definition = definition

    @property
    def definition(self) -> Mapping|None:
        return self.__definition.get('definition')

    @property
    def enable(self) -> bool:
        return self.__definition.get('enable', False)
