#!/usr/bin/env python3

import logging

from datetime import datetime, timezone

import asyncio
import kopf

from babylon import Babylon
from resourceclaim import ResourceClaim
from workshop import Workshop
from workshopprovision import WorkshopProvision
from configure_kopf_logging import configure_kopf_logging
from infinite_relative_backoff import InfiniteRelativeBackoff

@kopf.on.startup()
async def on_startup(settings: kopf.OperatorSettings, logger, **_):
    await Babylon.on_startup()

    # Never give up from network errors
    settings.networking.error_backoffs = InfiniteRelativeBackoff()

    # Store last handled configuration in status
    settings.persistence.diffbase_storage = kopf.StatusDiffBaseStorage(field='status.diffBase')

    # Use operator domain as finalizer
    settings.persistence.finalizer = f"{Babylon.babylon_domain}/workshop-manager"

    # Store progress in status
    settings.persistence.progress_storage = kopf.StatusProgressStorage(field='status.kopf.progress')

    # Only create events for warnings and errors
    settings.posting.level = logging.WARNING

    # Disable scanning for crds and namespaces
    settings.scanning.disabled = True

    configure_kopf_logging()

    await Workshop.preload()
    await WorkshopProvision.preload()

@kopf.on.cleanup()
async def on_cleanup():
    await Babylon.on_cleanup()


@kopf.on.event(
    ResourceClaim.api_group, ResourceClaim.api_version, ResourceClaim.plural,
    labels={Babylon.workshop_label: kopf.PRESENT},
)
async def resource_claim_event(event, logger, **_):
    await ResourceClaim.handle_event(event, logger=logger)


@kopf.on.create(
    Workshop.api_group, Workshop.api_version, Workshop.plural,
)
async def workshop_create(logger, **kwargs):
    workshop = Workshop.load(**kwargs)
    await workshop.handle_create(logger=logger)

@kopf.on.delete(
    Workshop.api_group, Workshop.api_version, Workshop.plural,
)
async def workshop_delete(logger, **kwargs):
    workshop = Workshop.load(**kwargs)
    await workshop.handle_delete(logger=logger)

@kopf.on.resume(
    Workshop.api_group, Workshop.api_version, Workshop.plural,
)
async def workshop_resume(logger, **kwargs):
    workshop = Workshop.load(**kwargs)
    await workshop.handle_resume(logger=logger)

@kopf.on.update(
    Workshop.api_group, Workshop.api_version, Workshop.plural,
)
async def workshop_update(logger, **kwargs):
    workshop = Workshop.load(**kwargs)
    await workshop.handle_update(logger=logger)

@kopf.daemon(
    Workshop.api_group, Workshop.api_version, Workshop.plural,
    cancellation_timeout = 1,
)
async def workshop_daemon(logger, stopped, **kwargs):
    workshop = Workshop.load(**kwargs)
    try:
        while not stopped:
            if workshop.lifespan_end and workshop.lifespan_end < datetime.now(timezone.utc):
                logger.info(f"Deleting {workshop} for lifespan end")
                await workshop.delete()
                return
            await workshop.manage(logger=logger)
            await asyncio.sleep(300)
    except asyncio.CancelledError:
        pass


@kopf.on.create(
    WorkshopProvision.api_group, WorkshopProvision.api_version, WorkshopProvision.plural,
)
async def workshop_provision_create(logger, **kwargs):
    workshop_provision = WorkshopProvision.load(**kwargs)
    await workshop_provision.handle_create(logger=logger)

@kopf.on.delete(
    WorkshopProvision.api_group, WorkshopProvision.api_version, WorkshopProvision.plural,
)
async def workshop_provision_delete(logger, **kwargs):
    workshop_provision = WorkshopProvision.load(**kwargs)
    await workshop_provision.handle_delete(logger=logger)

@kopf.on.resume(
    WorkshopProvision.api_group, WorkshopProvision.api_version, WorkshopProvision.plural,
)
async def workshop_provision_resume(logger, **kwargs):
    workshop_provision = WorkshopProvision.load(**kwargs)
    await workshop_provision.handle_resume(logger=logger)

@kopf.on.update(
    WorkshopProvision.api_group, WorkshopProvision.api_version, WorkshopProvision.plural,
)
async def workshop_provision_update(logger, **kwargs):
    workshop_provision = WorkshopProvision.load(**kwargs)
    await workshop_provision.handle_update(logger=logger)

@kopf.daemon(
    WorkshopProvision.api_group, WorkshopProvision.api_version, WorkshopProvision.plural,
    cancellation_timeout = 1,
)
async def workshop_provision_daemon(logger, stopped, **kwargs):
    workshop_provision = WorkshopProvision.load(**kwargs)
    try:
        while not stopped:
            if workshop_provision.lifespan_end \
            and workshop_provision.lifespan_end < datetime.now(timezone.utc):
                logger.info(f"Deleting {workshop_provision} for lifespan end")
                await workshop_provision.delete()
                return
            await workshop_provision.manage(logger=logger)
            await asyncio.sleep(workshop_provision.start_delay)
    except asyncio.CancelledError:
        pass
