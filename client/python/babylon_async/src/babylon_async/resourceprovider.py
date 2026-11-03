from __future__ import annotations
from typing import Any, List, Mapping

from .anarchygovernor import AnarchyGovernor
from .exceptions import BabylonApiException
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
        return self._definition.get('resourceName') or self.name

    @property
    def spec(self) -> ResourceProviderSpec:
        return ResourceProviderSpec(self._definition['spec'])

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

    async def get_anarchy_governor(self) -> AnarchyGovernor|None:
        """Get AnarchyGovernor associated to this ResourceProvider if there is one."""
        override = self.spec.override
        if override is None:
            return None
        name = override.get('spec', {}).get('governor')
        namespace = override.get('metadata', {}).get('namespace')
        if name is None or namespace is None:
            return None
        return await self.client.get_anarchy_governor(name, namespace)

    async def get_catalog_item(self) -> "CatalogItem"|None:
        """Return CatalogItem associated to ResourceProvider if there is one"""
        status_summary_template = self.spec.status_summary_template
        if status_summary_template is None:
            return None
        name = status_summary_template.catalog_item_name
        namespace = status_summary_template.catalog_item_namespace
        if name is None or namespace is None:
            return None
        return await self.client.get_catalog_item(name=name, namespace=namespace)

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

    async def get_linked_resource_providers(self,
        cache:bool=False,
        parameter_values: Mapping|None=None,
    ) -> List[ResourceProvider]:
        """Return list of linked ResourceProvider objects.
        If `parameter_values` dictionary is passed then when condition on linked
        providers is checked."""
        ret = []
        for linked_resource_provider in self.linked_resource_providers:
            resource_provider = await self.client.get_resource_provider(
                cache=cache,
                name=linked_resource_provider.name,
            )
            if (
                parameter_values is not None and
                not linked_resource_provider.check_when(
                    parameter_values=parameter_values,
                    resource_provider=self,
                )
            ):
                continue
            ret.append(resource_provider)
        return ret

    async def update_from_agnosticv(self,
        definition: Mapping,
        dry_run: bool=False
    ) -> bool:
        """Update ResourceProvider with definition from AgnosticVComponent.
        Return boolean to indicate if definition required update."""
        while True:
            merged = self.get_definition()
            # All of spec managed from AgnosticV
            merged['spec'] = definition['spec']
            # All annotations managed from AgnosticV
            merged['metadata']['annotations'] = definition['metadata']['annotations']
            # All labels managed from AgnosticV
            merged['metadata']['labels'] = definition['metadata']['labels']

            if merged == self._definition:
                return False
            if dry_run:
                return True

            try:
                await self.replace_definition(merged)
                return True
            except BabylonApiException as err:
                if err.status != 409:
                    raise
                await self.refresh()


class ResourceProviderSpec:
    def __init__(self, definition):
        self._definition = definition

    @property
    def default(self) -> Mapping:
        return self._definition.get('default', {})

    @property
    def has_template_definition(self) -> bool:
        return 'override' in self._definition or (
            self.template is not None and
            self.template.definition is not None
        )

    @property
    def linked_resource_providers(self) -> List[ResourceProviderSpecLinkedResourceProvider]:
        return [
            ResourceProviderSpecLinkedResourceProvider(item)
            for item in self._definition.get('linkedResourceProviders', [])
        ]

    @property
    def parameters(self) -> List[ResourceProviderSpecParameter]:
        return [
            ResourceProviderSpecParameter(item)
            for item in self._definition.get('parameters', [])
        ]

    @property
    def match_ignore(self) -> list[str]:
        return self._definition.get('match_ignore', [])

    @property
    def override(self) -> Mapping|None:
        return self._definition.get('override')

    @property
    def resource_name(self) -> str|None:
        return self._definition.get('resourceName')

    @property
    def status_summary_template(self) -> ResourceProviderSpecStatusSummaryTemplate|None:
        """Return status summary template if defined."""
        if 'statusSummaryTemplate' in self._definition:
            return ResourceProviderSpecStatusSummaryTemplate(self._definition['statusSummaryTemplate'])
        return None

    @property
    def template(self) -> ResourceProviderSpecTemplate|None:
        if 'template' not in self._definition:
            return None
        return ResourceProviderSpecTemplate(self._definition['template'])

    @property
    def vars(self) -> Mapping[str, Any]:
        return self._definition.get('vars', {})

class ResourceProviderSpecLinkedResourceProvider:
    def __init__(self, definition):
        self._definition = definition

    @property
    def name(self) -> str:
        return self._definition['name']

    @property
    def parameter_values(self) -> Mapping[str, Any]:
        return self._definition.get('parameterValues', {})

    @property
    def resource_name(self) -> str:
        return self._definition.get('resourceName', self.name)

    @property
    def template_vars(self) -> List[ResourceProviderSpecLinkedResourceProviderTemplateVar]:
        return [
            ResourceProviderSpecLinkedResourceProviderTemplateVar(item)
            for item in self._definition.get('templateVars', [])
        ]

    @property
    def wait_for(self) -> str|None:
        return self._definition.get('waitFor')

    @property
    def when(self) -> str|None:
        return self._definition.get('when')

    def check_when(self,
        parameter_values: Mapping,
        resource_provider: ResourceProvider,
    ) -> bool:
        """Check when condition associated with this linked component.
        If no when condition is defined then return True."""
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
        self._definition = definition

    @property
    def _from(self) -> str:
        return self._definition['from']

    @property
    def name(self) -> str:
        return self._definition['name']

class ResourceProviderSpecParameter:
    def __init__(self, definition):
        self._definition = definition

    @property
    def allow_update(self) -> bool:
        return self._definition.get('allowUpdate', False)

    @property
    def default(self) -> ResourceProviderSpecParameterDefault|None:
        if 'default' not in self._definition:
            return None
        return ResourceProviderSpecParameterDefault(self._definition['default'])

    @property
    def name(self) -> str:
        return self._definition['name']

    @property
    def required(self) -> bool:
        return self._definition.get('required', False)

    @property
    def validation(self) -> ResourceProviderSpecParameterValidation|None:
        if 'validation' not in self._definition:
            return None
        return ResourceProviderSpecParameterValidation(self._definition['validation'])

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
        self._definition = definition

    @property
    def template(self) -> Any:
        return self._definition.get('template')

    @property
    def value(self) -> Any:
        return self._definition.get('value')

class ResourceProviderSpecParameterValidation:
    def __init__(self, definition):
        self._definition = definition

    @property
    def openapi_v3_schema(self) -> Mapping|None:
        return self._definition.get('openAPIV3Schema')

class ResourceProviderSpecStatusSummaryTemplate:
    """Representation of statusSummaryTemplate"""

    def __init__(self, definition):
        self._definition = definition

    @property
    def catalog_item_name(self) -> str|None:
        """Return catalog item name if defined"""
        return self._definition.get('catalog_item_name')

    @property
    def catalog_item_namespace(self) -> str|None:
        """Return catalog item namespace if defined"""
        return self._definition.get('catalog_item_namespace')

class ResourceProviderSpecTemplate:
    def __init__(self, definition):
        self._definition = definition

    @property
    def definition(self) -> Mapping|None:
        return self._definition.get('definition')

    @property
    def enable(self) -> bool:
        return self._definition.get('enable', False)
