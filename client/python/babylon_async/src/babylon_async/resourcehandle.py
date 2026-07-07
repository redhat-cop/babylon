from __future__ import annotations
from typing import Any, Mapping

from datetime import datetime, timedelta

import pytimeparse

from .k8s_object import K8sObject
from .poolboy_templating import timedelta_to_str

class ResourceHandle(K8sObject):
    api_group = "poolboy.gpte.redhat.com"
    api_version = "v1"
    kind = "ResourceHandle"
    plural = "resourcehandles"
    api_group_version = f"{api_group}/{api_version}"

    @classmethod
    async def create_with_provider(cls, client,
        provider_name:str,
        lifespan:Mapping[str,str|datetime|timedelta]=None,
        owner:K8sObject|None=None,
        parameter_values:Mapping[str,Any]=None,
    ) -> ResourceHandle:
        if lifespan is None:
            lifespan = {}
        if name is None:
            name = f"{provider_name}-*"
        if parameter_values is None:
            parameter_values = {}
        definition = {
            "spec": {
                "lifespan": {
                    key: (
                        timedelta_to_str(value) if isinstance(value, timedelta) else
                        value.strftime('%FT%TZ') if isinstance(value, datetime) else
                        value
                    ) for key, value in lifespan.items()
                },
                "provider": {
                    "name": provider_name,
                    "parameterValues": parameter_values,
                }
            }
        }

        return await ResourceHandle.create(
            client=client,
            definition=definition,
            name="guid-*",
            namespace="poolboy",
            owner=owner,
        )

    @property
    def asset_uuid(self) -> str|None:
        # Fetching asset uuid from status is more reliable than annotations
        if self.status is not None or self.status.summary is not None and 'agnosticv' in self.status.summary:
            return self.status.summary['agnosticv']['asset_uuid']
        # Fallback to attempt to get from annotations
        if self.metadata.annotations is not None:
            return self.metadata.annotations.get('gpte.redhat.com/asset-uuid')
        return None

    @property
    def catalog_display_name(self) -> str|None:
        # Try getting the catalog display name from annotations, but it is better
        # get the display name by fetching the CatalogItem object itself.
        if self.metadata.annotations is None:
            return None
        return self.metadata.annotations.get('babylon.gpte.redhat.com/catalogDisplayName')

    @property
    def catalog_item_display_name(self) -> str|None:
        # Try getting the catalog item display name from annotations, but it is better
        # get the display name by fetching the CatalogItem object itself.
        if self.metadata.annotations is None:
            return None
        return self.metadata.annotations.get('babylon.gpte.redhat.com/catalogItemDisplayName')

    @property
    def catalog_item_name(self) -> str|None:
        # Fetching catalog item name from status is more reliable than annotations
        if self.status is not None or self.status.summary is not None and 'catalog_item_name' in self.status.summary:
            return self.status.summary['catalog_item_name']
        # Fallback to attempt to fetch from labels
        if self.metadata.labels is not None:
            return self.metadata.labels.get('babylon.gpte.redhat.com/catalogItemName')
        return None

    @property
    def catalog_item_namespace(self) -> str|None:
        # Fetching catalog item namespace from status is more reliable than annotations
        if self.status is not None or self.status.summary is not None and 'catalog_item_namespace' in self.status.summary:
            return self.status.summary['catalog_item_namespace']
        # Fallback to attempt to fetch from labels
        if self.metadata.labels is not None:
            return self.metadata.labels.get('babylon.gpte.redhat.com/catalogItemNamespace')
        return None

    @property
    def guid(self) -> str|None:
        return self.name[5:]

    @property
    def lifespan_end_datetime(self) -> datetime|None:
        """Return lifespan end as datetime if set"""
        try:
            return self.spec.lifespan.end_datetime
        except AttributeError:
            return None

    @property
    def lifespan_maximum_timedelta(self) -> timedelta:
        return self.spec.lifespan.maximum_timedelta

    @property
    def lifespan_relative_maximum_timedelta(self) -> timedelta:
        return self.spec.lifespan.relative_maximum_timedelta

    @property
    def provision_data(self) -> Mapping|None:
        if self.status is None or self.status.summary is None:
            return None
        return self.status.summary.get('provision_data')

    @property
    def spec(self) -> ResourceHandleSpec:
        return ResourceHandleSpec(self._definition['spec'])

    @property
    def status(self) -> ResourceHandleStatus|None:
        if 'status' not in self._definition:
            return None
        return ResourceHandleStatus(self._definition['status'])

    async def set_lifespan(self,
        default:timedelta|str|None=None,
        end:datetime|str|None=None,
        maximum:timedelta|str|None=None,
        relative_maximum:timedelta|str|None=None,
    ):
        if isinstance(default, datetime):
            default = timedelta_to_str(default)
        if isinstance(end, datetime):
            end = end.strftime('%FT%TZ')
        if isinstance(maximum, timedelta):
            maximum = timedelta_to_str(maximum)
        if isinstance(relative_maximum, timedelta):
            relative_maximum = timedelta_to_str(maximum)

        lifespan = {}
        if default is not None:
            lifespan['default'] = default
        if end is not None:
            lifespan['end'] = end
        if maximum is not None:
            lifespan['maximum'] = maximum
        if relative_maximum is not None:
            lifespan['relativeMaximum'] = relative_maximum

        await self.patch({"spec": {"lifespan": lifespan}})


class ResourceHandleSpec:
    def __init__(self, definition):
        self._definition = definition

    @property
    def lifespan(self) -> ResourceHandleSpecLifespan|None:
        if 'lifespan' not in self._definition:
            return None
        return ResourceHandleSpecLifespan(self._definition['lifespan'])

    @property
    def provider(self) -> ResourceHandleSpecProvider|None:
        if 'provider' not in self._definition:
            return None
        return ResourceHandleSpecProvider(self._definition['provider'])

class ResourceHandleSpecLifespan:
    def __init__(self, definition):
        self._definition = definition

    @property
    def end(self) -> datetime|None:
        """Alias for end_datetime"""
        return self.end_datetime

    @property
    def end_datetime(self) -> datetime|None:
        """Return requested lifespan end as datetime object"""
        ts = self.end_timestamp
        if ts is None:
            return None
        return datetime.strptime(ts, '%Y-%m-%dT%H:%M:%S%z')

    @property
    def end_timestamp(self) -> str|None:
        """Return requested lifespan end timestamp string if defined"""
        return self._definition.get('end')

    @property
    def maximum(self) -> str:
        """Return lifespan maximum"""
        return self._definition['maximum']

    @property
    def maximum_timedelta(self) -> timedelta:
        """Return lifespan maximum as timedelta"""
        return timedelta(seconds=pytimeparse.parse(self.maximum))

    @property
    def relative_maximum(self) -> str:
        """Return lifespan relative maximum"""
        return self._definition['relativeMaximum']

    @property
    def relative_maximum_timedelta(self) -> timedelta:
        """Return lifespan relative maximum as timedelta"""
        return timedelta(seconds=pytimeparse.parse(self.relative_maximum))

class ResourceHandleSpecProvider:
    def __init__(self, definition):
        self._definition = definition

    @property
    def name(self) -> str:
        return self._definition['name']

    @property
    def parameter_values(self) -> Mapping[str, Any]:
        return self._definition.get('parameterValues', {})

class ResourceHandleStatus:
    def __init__(self, definition):
        self._definition = definition

    @property
    def healthy(self) -> bool|None:
        return self._definition.get('healthy')

    @property
    def ready(self) -> bool|None:
        return self._definition.get('ready')

    @property
    def summary(self) -> Mapping|None:
        return self._definition.get('summary')
