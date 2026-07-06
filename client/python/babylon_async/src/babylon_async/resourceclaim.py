from __future__ import annotations
from typing import Any, List, Mapping

from datetime import datetime, timedelta, timezone

import pytimeparse

from .k8s_object import K8sObject
from .resourcereference import ResourceReference

class ResourceClaim(K8sObject):
    api_group = "poolboy.gpte.redhat.com"
    api_version = "v1"
    kind = "ResourceClaim"
    plural = "resourceclaims"
    api_group_version = f"{api_group}/{api_version}"

    @classmethod
    async def create(cls, client,
        namespace:str,
        provider_name:str,
        auto_detach:bool=False,
        name:str|None=None,
        owner:K8sObject|None=None,
        parameter_values:Mapping[str,Any]={},
    ):
        if name is None:
            name = f"{provider_name}-*"
        definition = {
            "spec": {
                "provider": {
                    "name": provider_name,
                    "parameterValues": parameter_values,
                }
            }
        }
        if auto_detach:
            definition["spec"] = {
                "when": "status.resources | json_query(\"[?state.spec.vars.current_state == 'provision-failed']\") | length != 0",
            }

        return await super(ResourceClaim, cls).create(
            client=client,
            definition=definition,
            name=name,
            namespace=namespace,
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
        if self.status.resource_handle is None:
            return None
        return self.status.resource_handle.name[5:]

    @property
    def provision_data(self) -> Mapping|None:
        if self.status is None or self.status.summary is None:
            return None
        return self.status.summary.get('provision_data')

    @property
    def requested_stop_datetime(self) -> datetime|None:
        """Return requested stop datetime if set."""
        ts = self.stop_timestamp
        if ts is None:
            return None
        return datetime.strptime(ts, '%Y-%m-%dT%H:%M:%S%z')

    @property
    def requested_stop_timestamp(self) -> str|None:
        """Return requested stop timestamp if set."""
        provider = self.spec.provider
        if provider is None:
            return None
        return provider.parameter_values.get('stop_timestamp')

    @property
    def resource_handle(self) -> ResourceReference|None:
        return self.status.resource_handle

    @property
    def resource_handle_name(self) -> str|None:
        if self.status.resource_handle is None:
            return None
        return self.status.resource_handle.name

    @property
    def runtime_default(self) -> timedelta|None:
        if self.status is None or self.status.summary is None or 'runtime_default' not in self.status.summary:
            return None
        return timedelta(seconds=pytimeparse.parse(self.status.summary['runtime_default']))

    @property
    def runtime_maximum(self) -> timedelta|None:
        if self.status is None or self.status.summary is None or 'runtime_maximum' not in self.status.summary:
            return None
        return timedelta(seconds=pytimeparse.parse(self.status.summary['runtime_maximum']))

    @property
    def spec(self) -> ResourceClaimSpec:
        return ResourceClaimSpec(self._definition['spec'])

    @property
    def state(self) -> str|None:
        if self.status is None or self.status.summary is None:
            return None
        return self.status.summary.get('state')

    @property
    def status(self) -> ResourceClaimStatus|None:
        if 'status' not in self._definition:
            return None
        return ResourceClaimStatus(self._definition['status'])

    @property
    def stop_datetime(self) -> datetime|None:
        """Return effective stop datetime if set."""
        ts = self.stop_timestamp
        if ts is None:
            return None
        return datetime.strptime(ts, '%Y-%m-%dT%H:%M:%S%z')

    @property
    def stop_timestamp(self) -> str|None:
        """Return effective stop timestamp if set."""
        provider = self.status.provider
        if provider is None:
            return None
        return provider.parameter_values.get('stop_timestamp')

    @property
    def white_glove(self) -> bool:
        if self.metadata.labels is None:
            return False
        return self.metadata.labels.get('demo.redhat.com/white-glove') == 'true'

    @property
    def workshop_id(self) -> str|None:
        if self.metadata.labels is not None:
            return self.metadata.labels.get('babylon.gpte.redhat.com/workshop-id')
        return None

    @property
    def workshop_provision_name(self) -> str|None:
        if self.metadata.owner_references is not None:
            for owner_reference in self.metadata.owner_references:
                if owner_reference.kind == 'WorkshopProvision':
                    return owner_reference.name
        if self.metadata.labels is not None:
            return self.metadata.labels.get('babylon.gpte.redhat.com/workshop-provision')
        return None

    @property
    def workshop_uid(self) -> str|None:
        if self.metadata.labels is not None:
            return self.metadata.labels.get('babylon.gpte.redhat.com/workshop-uid')
        return None

    async def disable_autostop(self) -> bool:
        """Set auto-stop schedule such that stop is effectively disabled.
        Returns boolean indicating if change was made."""

        # Treat stop at 2100-12-31T00:00:00Z as effectively never
        never = datetime(2100, 12, 31, tzinfo=timezone.utc)

        stop_datetime = self.stop_datetime
        if stop_datetime is not None and stop_datetime >= never:
            return False

        await self.set_requested_stop_datetime(never)
        return True

    async def set_requested_stop_datetime(self, dt:datetime) -> None:
        """Set auto-stop schedule to specified datetime."""
        await self.patch([{
            "op": "add",
            "path": "/spec/provider/parameterValues/stop_timestamp",
            "value": dt.strftime('%FT%TZ'),
        }])


class ResourceClaimSpec:
    def __init__(self, definition):
        self._definition = definition

    @property
    def auto_detach(self) -> ResourceClaimSpecAutoDetach|None:
        if 'autoDetach' not in self._definition:
            return None
        return ResourceClaimSpecAutoDetach(self._definition['autoDetach'])

    @property
    def lifespan(self) -> ResourceClaimSpecLifespan|None:
        if 'lifespan' not in self._definition:
            return None
        return ResourceClaimSpecLifespan(self._definition['lifespan'])

    @property
    def provider(self) -> ResourceClaimSpecProvider|None:
        if 'provider' not in self._definition:
            return None
        return ResourceClaimSpecProvider(self._definition['provider'])


class ResourceClaimSpecAutoDetach:
    def __init__(self, definition):
        self._definition = definition

    @property
    def when(self) -> str:
        return self._definition['when']

class ResourceClaimSpecLifespan:
    def __init__(self, definition):
        self._definition = definition

    @property
    def end(self) -> datetime|None:
        if 'end' in self._definition:
            return datetime.strptime(self._definition['end'], '%Y-%m-%dT%H:%M:%S%z')
        return None

class ResourceClaimSpecProvider:
    def __init__(self, definition):
        self._definition = definition

    @property
    def name(self) -> str:
        return self._definition['name']

    @property
    def parameter_values(self) -> Mapping[str, Any]:
        return self._definition.get('parameterValues', {})

class ResourceClaimStatus:
    def __init__(self, definition):
        self._definition = definition

    @property
    def healthy(self) -> bool|None:
        return self._definition.get('healthy')

    @property
    def lifespan(self) -> ResourceClaimStatusLifespan|None:
        if 'lifespan' not in self._definition:
            return None
        return ResourceClaimStatusLifespan(self._definition['lifespan'])

    @property
    def provider(self) -> ResourceClaimStatusProvider|None:
        if 'provider' not in self._definition:
            return None
        return ResourceClaimStatusProvider(self._definition['provider'])

    @property
    def ready(self) -> bool|None:
        return self._definition.get('ready')

    @property
    def resource_handle(self) -> ResourceReference|None:
        if 'resourceHandle' not in self._definition:
            return None
        return ResourceReference(self._definition['resourceHandle'])

    @property
    def resources(self) -> List[ResourceClaimStatusResource]|None:
        if 'resources' not in self._definition:
            return None
        return [
            ResourceClaimStatusResource(item)
            for item in self._definition['resources']
        ]

    @property
    def summary(self) -> Mapping|None:
        return self._definition.get('summary')

class ResourceClaimStatusLifespan:
    def __init__(self, definition):
        self._definition = definition

    @property
    def end(self) -> datetime|None:
        if 'end' in self._definition:
            return datetime.strptime(self._definition['end'], '%Y-%m-%dT%H:%M:%S%z')
        return None

    @property
    def first_ready(self) -> datetime|None:
        if 'firstReady' in self._definition:
            return datetime.strptime(self._definition['firstReady'], '%Y-%m-%dT%H:%M:%S%z')
        return None

    @property
    def maximum(self) -> timedelta|None:
        if 'maximum' in self._definition:
            return timedelta(seconds=pytimeparse.parse(self._definition['maximum']))
        return None

    @property
    def relative_maximum(self) -> timedelta|None:
        if 'relativeMaximum' in self._definition:
            return timedelta(seconds=pytimeparse.parse(self._definition['relativeMaximum']))
        return None

class ResourceClaimStatusProvider:
    def __init__(self, definition):
        self._definition = definition

    @property
    def name(self) -> str:
        return self._definition['name']

    @property
    def parameter_values(self) -> Mapping[str, Any]:
        return self._definition.get('parameterValues', {})

class ResourceClaimStatusResource:
    def __init__(self, definition):
        self._definition = definition

    @property
    def healthy(self) -> bool|None:
        return self._definition.get('healthy')

    @property
    def name(self) -> str|None:
        return self._definition.get('name')

    @property
    def provider(self) -> ResourceReference|None:
        if 'provider' not in self._definition:
            return None
        return ResourceReference(self._definition['provider'])

    @property
    def ready(self) -> bool|None:
        return self._definition.get('ready')

    @property
    def reference(self) -> ResourceReference|None:
        if 'reference' not in self._definition:
            return None
        return ResourceReference(self._definition['reference'])

    @property
    def state(self) -> Mapping|None:
        return self._definition.get('state')
