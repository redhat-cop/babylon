#!/usr/bin/env python3

import logging

import kopf

from babylon import Babylon
from configure_kopf_logging import configure_kopf_logging
from infinite_relative_backoff import InfiniteRelativeBackoff
from resourceclaim import ResourceClaim
from serviceaccessconfig import ServiceAccessConfig
from workshop import Workshop

@kopf.on.startup()
async def on_startup(settings: kopf.OperatorSettings, logger, **_):
    await Babylon.on_startup()

    # Never give up from network errors
    settings.networking.error_backoffs = InfiniteRelativeBackoff()

    # Store last handled configuration in status
    settings.persistence.diffbase_storage = kopf.StatusDiffBaseStorage(field='status.diffBase')

    # Finalizer
    settings.persistence.finalizer = f"{Babylon.babylon_domain}/service-access-manager"

    # Store progress in status.
    settings.persistence.progress_storage = kopf.StatusProgressStorage(field='status.kopf.progress')

    # Only create events for warnings and errors
    settings.posting.level = logging.WARNING

    # Disable scanning for crds and namespaces
    settings.scanning.disabled = True

    configure_kopf_logging()

@kopf.on.cleanup()
async def on_cleanup(**_):
    await Babylon.on_cleanup()

@kopf.on.event(
    ResourceClaim.api_group, ResourceClaim.api_version, ResourceClaim.plural,
    labels={
        Babylon.workshop_label: kopf.PRESENT,
        Babylon.resource_broker_ignore_label: kopf.ABSENT,
    },
)
async def resource_claim_event(event, logger, **_):
    await ResourceClaim.handle_event(event, logger=logger)


@kopf.on.create(
    ServiceAccessConfig.api_group, ServiceAccessConfig.api_version, ServiceAccessConfig.plural,
    labels={
        Babylon.babylon_ignore_label: kopf.ABSENT,
    },
)
async def service_access_config_create(logger, **kwargs):
    service_access_config = ServiceAccessConfig(**kwargs)
    await service_access_config.handle_create(logger=logger)

@kopf.on.delete(
    ServiceAccessConfig.api_group, ServiceAccessConfig.api_version, ServiceAccessConfig.plural,
    labels={
        Babylon.babylon_ignore_label: kopf.ABSENT,
    },
)
async def service_access_config_delete(logger, **kwargs):
    service_access_config = ServiceAccessConfig(**kwargs)
    await service_access_config.handle_delete(logger=logger)

@kopf.on.resume(
    ServiceAccessConfig.api_group, ServiceAccessConfig.api_version, ServiceAccessConfig.plural,
    labels={
        Babylon.babylon_ignore_label: kopf.ABSENT,
    },
)
async def service_access_config_resume(logger, **kwargs):
    service_access_config = ServiceAccessConfig(**kwargs)
    await service_access_config.handle_resume(logger=logger)

@kopf.on.update(
    ServiceAccessConfig.api_group, ServiceAccessConfig.api_version, ServiceAccessConfig.plural,
    labels={
        Babylon.babylon_ignore_label: kopf.ABSENT,
    },
)
async def service_access_config_update(logger, **kwargs):
    service_access_config = ServiceAccessConfig(**kwargs)
    await service_access_config.handle_update(logger=logger)

@kopf.timer(
    ServiceAccessConfig.api_group, ServiceAccessConfig.api_version, ServiceAccessConfig.plural,
    initial_delay=60,
    interval=60,
    labels={
        Babylon.babylon_ignore_label: kopf.ABSENT,
    },
)
async def service_access_config_timer(logger, **kwargs):
    service_access_config = ServiceAccessConfig(**kwargs)
    await service_access_config.handle_timer(logger=logger)


@kopf.on.event(
    Workshop.api_group, Workshop.api_version, Workshop.plural,
    labels={
        Babylon.babylon_ignore_label: kopf.ABSENT,
    },
)
async def workshop_event(event, logger, **_):
    await Workshop.handle_event(event, logger=logger)
