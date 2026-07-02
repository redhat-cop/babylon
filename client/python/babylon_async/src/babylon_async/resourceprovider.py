from __future__ import annotations
from typing import Any, List, Mapping

from .k8s_object import K8sObject
from .poolboy_templating import check_condition, recursive_process_template_strings

class ResourceProvider(K8sObject):
    api_group = "poolboy.gpte.redhat.com"
    api_version = "v1"
    kind = "ResourceProvider"
    plural = "resourceproviders"
    api_group_version = f"{api_group}/{api_version}"

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
        return self.__definition.get('resourceName') or self.name

    @property
    def spec(self) -> ResourceProviderSpec:
        return ResourceProviderSpec(self.__definition['spec'])

    @property
    def vars(self) -> Mapping[str, Any]:
        return self.spec.vars

    def get_parameter_defaults(self, parameter_values:Mapping) -> Mapping:
        ret = {}
        for parameter in self.parameters:
            value = parameter.get_default(
                variables=parameter_values,
                template_variables=self.vars,
            )
            if value is not None:
                ret[parameter.name] = value
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
                    parameter_values={
                        key: recursive_process_template_strings(
                            value,
                            variables={
                                **resource_provider.get_parameter_defaults(
                                    parameter_values=parameter_values
                                ),
                                **parameter_values,
                            },
                            template_variables={
                                "resources": [],
                                "resource_claim": {},
                                **self.vars,
                            }
                        )
                        for key, value in linked_resource_provider.parameter_values.items()
                    }
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
        self.__definition = definition

    @property
    def default(self) -> Mapping:
        return self.__definition.get('default', {})

    @property
    def has_template_definition(self) -> bool:
        return 'override' in self.__definition or (
            self.template is not None and
            self.template.definition is not None
        )

    @property
    def linked_resource_providers(self) -> List[ResourceProviderSpecLinkedResourceProvider]:
        return [
            ResourceProviderSpecLinkedResourceProvider(item)
            for item in self.__definition.get('linkedResourceProviders', [])
        ]

    @property
    def parameters(self) -> List[ResourceProviderSpecParameter]:
        return [
            ResourceProviderSpecParameter(item)
            for item in self.__definition.get('parameters', [])
        ]

    @property
    def match_ignore(self) -> list[str]:
        return self.__definition.get('match_ignore', [])

    @property
    def override(self) -> Mapping:
        return self.__definition.get('override', {})

    @property
    def resource_name(self) -> str|None:
        return self.__definition.get('resourceName')

    @property
    def template(self) -> ResourceProviderSpecTemplate|None:
        if 'template' not in self.__definition:
            return None
        return ResourceProviderSpecTemplate(self.__definition['template'])

    @property
    def vars(self) -> Mapping[str, Any]:
        return self.__definition.get('vars', {})

class ResourceProviderSpecLinkedResourceProvider:
    def __init__(self, definition):
        self.__definition = definition

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
    def template_vars(self) -> List[ResourceProviderSpecLinkedResourceProviderTemplateVar]:
        return [
            ResourceProviderSpecLinkedResourceProviderTemplateVar(item)
            for item in self.__definition.get('templateVars', [])
        ]

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

    @property
    def allow_update(self) -> bool:
        return self.__definition.get('allowUpdate', False)

    @property
    def default(self) -> ResourceProviderSpecParameterDefault|None:
        if 'default' not in self.__definition:
            return None
        return ResourceProviderSpecParameterDefault(self.__definition['default'])

    @property
    def name(self) -> str:
        return self.__definition['name']

    @property
    def required(self) -> bool:
        return self.__definition.get('required', False)

    @property
    def validation(self) -> ResourceProviderSpecParameterValidation|None:
        if 'validation' not in self.__definition:
            return None
        return ResourceProviderSpecParameterValidation(self.__definition['validation'])

    def get_default(self, variables:Mapping, template_variables:Mapping) -> Any:
        if self.default is not None:
            if self.default.template is not None:
                return recursive_process_template_strings(
                    self.default.template,
                    variables=variables,
                    template_variables=template_variables,
                )
            if self.default.value is not None:
                return self.default.value

        if self.validation is not None and self.validation.openapi_v3_schema is not None:
            return self.validation.openapi_v3_schema.get('default')

        return None

class ResourceProviderSpecParameterDefault:
    def __init__(self, definition):
        self.__definition = definition

    @property
    def template(self) -> Any:
        return self.__definition.get('template')

    @property
    def value(self) -> Any:
        return self.__definition.get('value')

class ResourceProviderSpecParameterValidation:
    def __init__(self, definition):
        self.__definition = definition

    @property
    def openapi_v3_schema(self) -> Mapping|None:
        return self.__definition.get('openAPIV3Schema')

class ResourceProviderSpecTemplate:
    def __init__(self, definition):
        self.__definition = definition

    @property
    def definition(self) -> Mapping|None:
        return self.__definition.get('definition')

    @property
    def enable(self) -> bool:
        return self.__definition.get('enable', False)
