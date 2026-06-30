from __future__ import annotations
from typing import Any, Mapping

from datetime import datetime, timedelta

import pytimeparse

from .k8s_object import K8sObject
from .resourcereference import ResourceReference

class ResourceClaim(K8sObject):
    api_group = "poolboy.gpte.redhat.com"
    api_version = "v1"
    kind = "ResourceClaim"
    plural = "resourceclaims"
    api_group_version = f"{api_group}/{api_version}"

    def __init__(self, client, definition):
        super().__init__(client, definition)
        self.spec = ResourceClaimSpec(definition['spec'])
        self.status = (
            ResourceClaimStatus(definition['status'])
            if 'status' in definition else None
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
    def state(self) -> str|None:
        if self.status is None or self.status.summary is None:
            return None
        return self.status.summary.get('state')

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

class ResourceClaimSpec:
    def __init__(self, definition):
        self.definition = definition
        self.auto_detatch = (
            ResourceClaimSpecAutoDetatch(definition['autoDetatch'])
            if 'autoDetatch' in definition else None
        )
        self.lifespan = (
            ResourceClaimSpecLifespan(definition['lifespan'])
            if 'lifespan' in definition else None
        )
        self.provider = (
            ResourceClaimSpecProvider(definition['provider'])
            if 'provider' in definition else None
        )

class ResourceClaimSpecAutoDetach:
    def __init__(self, definition):
        self.definition = definition

    @property
    def when(self) -> str:
        return self.definition['when']

class ResourceClaimSpecLifespan:
    def __init__(self, definition):
        self.definition = definition

    @property
    def end(self) -> datetime|None:
        if 'end' in self.definition:
            return datetime.strptime(self.definition['end'], '%Y-%m-%dT%H:%M:%S%z')
        return None

class ResourceClaimSpecProvider:
    def __init__(self, definition):
        self.definition = definition

    @property
    def name(self) -> str:
        return self.definition['name']

    @property
    def parameter_values(self) -> Mapping[str, Any]:
        return self.definition['parameterValues']

class ResourceClaimStatus:
    def __init__(self, definition):
        self.definition = definition
        self.lifespan = (
            ResourceClaimStatusLifespan(definition['lifespan'])
            if 'lifespan' in definition else None
        )
        self.provider = (
            ResourceClaimStatusProvider(definition['provider'])
            if 'provider' in definition else None
        )
        self.resource_handle = (
            ResourceReference(definition['resourceHandle'])
            if 'resourceHandle' in definition else None
        )
        self.resources = (
            [ResourceClaimStatusResource(item) for item in definition['resources']]
            if 'resources' in definition else None
        )

    @property
    def healthy(self) -> bool|None:
        return self.definition.get('healthy')

    @property
    def ready(self) -> bool|None:
        return self.definition.get('ready')

    @property
    def summary(self) -> Mapping|None:
        return self.definition.get('summary')

class ResourceClaimStatusLifespan:
    def __init__(self, definition):
        self.definition = definition

    @property
    def end(self) -> datetime|None:
        if 'end' in self.definition:
            return datetime.strptime(self.definition['end'], '%Y-%m-%dT%H:%M:%S%z')
        return None

    @property
    def first_ready(self) -> datetime|None:
        if 'firstReady' in self.definition:
            return datetime.strptime(self.definition['firstReady'], '%Y-%m-%dT%H:%M:%S%z')
        return None

    @property
    def maximum(self) -> timedelta|None:
        if 'maximum' in self.definition:
            return timedelta(seconds=pytimeparse.parse(self.definition['maximum']))
        return None

    @property
    def relative_maximum(self) -> timedelta|None:
        if 'relativeMaximum' in self.definition:
            return timedelta(seconds=pytimeparse.parse(self.definition['relativeMaximum']))
        return None

class ResourceClaimStatusProvider:
    def __init__(self, definition):
        self.definition = definition

    @property
    def name(self) -> str:
        return self.definition['name']

    @property
    def parameter_values(self) -> Mapping[str, Any]:
        return self.definition['parameterValues']

class ResourceClaimStatusResource:
    def __init__(self, definition):
        self.definition = definition
        self.provider = (
            ResourceReference(definition['provider'])
            if 'provider' in definition else None
        )
        self.reference = (
            ResourceReference(definition['reference'])
            if 'reference' in definition else None
        )

    @property
    def healthy(self) -> bool|None:
        return self.definition.get('healthy')

    @property
    def name(self) -> str|None:
        return self.definition.get('name')

    @property
    def ready(self) -> bool|None:
        return self.definition.get('ready')

    @property
    def state(self) -> Mapping|None:
        return self.definition.get('state')
