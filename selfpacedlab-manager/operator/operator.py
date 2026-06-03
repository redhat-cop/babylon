#!/usr/bin/env python3

import logging

from datetime import datetime, timezone

import asyncio
import kopf

from babylon import Babylon
from resourceclaim import ResourceClaim
from selfpacedlab import SelfPacedLab
from selfpacedlabprovisionitem import SelfPacedLabProvisionItem
from selfpacedlabuserassignment import SelfPacedLabUserAssignment
from configure_kopf_logging import configure_kopf_logging
from infinite_relative_backoff import InfiniteRelativeBackoff


@kopf.on.startup()
async def on_startup(settings: kopf.OperatorSettings, logger, **_):
    configure_kopf_logging()
    settings.persistence.finalizer = Babylon.finalizer_value
    settings.persistence.progress_storage = kopf.AnnotationsProgressStorage(
        prefix=Babylon.babylon_domain,
    )
    settings.posting.level = logging.WARNING
    settings.watching.server_timeout = 600
    settings.batching.error_delays = InfiniteRelativeBackoff()

    await Babylon.on_startup()
    await SelfPacedLab.preload()
    await SelfPacedLabProvisionItem.preload()
    await SelfPacedLabUserAssignment.preload()


@kopf.on.cleanup()
async def on_cleanup(**_):
    await Babylon.on_cleanup()


@kopf.on.event(
    ResourceClaim.api_group, ResourceClaim.api_version, ResourceClaim.plural,
    labels={
        Babylon.selfpacedlab_label: kopf.PRESENT,
        Babylon.resource_broker_ignore_label: kopf.ABSENT,
    },
)
async def resource_claim_event(event, logger, **_):
    await ResourceClaim.handle_event(event, logger=logger)


@kopf.on.create(
    SelfPacedLab.api_group, SelfPacedLab.api_version, SelfPacedLab.plural,
    labels={Babylon.babylon_ignore_label: kopf.ABSENT},
)
async def selfpacedlab_create(logger, **kwargs):
    selfpacedlab = SelfPacedLab.load(**kwargs)
    await selfpacedlab.handle_create(logger=logger)


@kopf.on.delete(
    SelfPacedLab.api_group, SelfPacedLab.api_version, SelfPacedLab.plural,
    labels={Babylon.babylon_ignore_label: kopf.ABSENT},
)
async def selfpacedlab_delete(logger, **kwargs):
    selfpacedlab = SelfPacedLab.load(**kwargs)
    await selfpacedlab.handle_delete(logger=logger)


@kopf.on.resume(
    SelfPacedLab.api_group, SelfPacedLab.api_version, SelfPacedLab.plural,
    labels={Babylon.babylon_ignore_label: kopf.ABSENT},
)
async def selfpacedlab_resume(logger, **kwargs):
    selfpacedlab = SelfPacedLab.load(**kwargs)
    await selfpacedlab.handle_resume(logger=logger)


@kopf.on.update(
    SelfPacedLab.api_group, SelfPacedLab.api_version, SelfPacedLab.plural,
    labels={Babylon.babylon_ignore_label: kopf.ABSENT},
)
async def selfpacedlab_update(logger, **kwargs):
    selfpacedlab = SelfPacedLab.load(**kwargs)
    await selfpacedlab.handle_update(logger=logger)


@kopf.daemon(
    SelfPacedLab.api_group, SelfPacedLab.api_version, SelfPacedLab.plural,
    cancellation_timeout=1,
    labels={Babylon.babylon_ignore_label: kopf.ABSENT},
)
async def selfpacedlab_daemon(logger, stopped, **kwargs):
    selfpacedlab = SelfPacedLab.load(**kwargs)
    try:
        while not stopped:
            if selfpacedlab.lifespan_end and selfpacedlab.lifespan_end < datetime.now(timezone.utc):
                logger.info(f"Deleting {selfpacedlab} for lifespan end")
                await selfpacedlab.delete()
                return
            await selfpacedlab.manage(logger=logger)
            await asyncio.sleep(300)
    except asyncio.CancelledError:
        pass


@kopf.on.create(
    SelfPacedLabProvisionItem.api_group, SelfPacedLabProvisionItem.api_version, SelfPacedLabProvisionItem.plural,
    labels={Babylon.babylon_ignore_label: kopf.ABSENT},
)
async def selfpacedlab_provision_item_create(logger, **kwargs):
    item = SelfPacedLabProvisionItem.load(**kwargs)
    await item.handle_create(logger=logger)


@kopf.on.delete(
    SelfPacedLabProvisionItem.api_group, SelfPacedLabProvisionItem.api_version, SelfPacedLabProvisionItem.plural,
    labels={Babylon.babylon_ignore_label: kopf.ABSENT},
)
async def selfpacedlab_provision_item_delete(logger, **kwargs):
    item = SelfPacedLabProvisionItem.load(**kwargs)
    await item.handle_delete(logger=logger)


@kopf.on.resume(
    SelfPacedLabProvisionItem.api_group, SelfPacedLabProvisionItem.api_version, SelfPacedLabProvisionItem.plural,
    labels={Babylon.babylon_ignore_label: kopf.ABSENT},
)
async def selfpacedlab_provision_item_resume(logger, **kwargs):
    item = SelfPacedLabProvisionItem.load(**kwargs)
    await item.handle_resume(logger=logger)


@kopf.on.update(
    SelfPacedLabProvisionItem.api_group, SelfPacedLabProvisionItem.api_version, SelfPacedLabProvisionItem.plural,
    labels={Babylon.babylon_ignore_label: kopf.ABSENT},
)
async def selfpacedlab_provision_item_update(logger, **kwargs):
    item = SelfPacedLabProvisionItem.load(**kwargs)
    await item.handle_update(logger=logger)


@kopf.daemon(
    SelfPacedLabProvisionItem.api_group, SelfPacedLabProvisionItem.api_version, SelfPacedLabProvisionItem.plural,
    cancellation_timeout=1,
    labels={Babylon.babylon_ignore_label: kopf.ABSENT},
)
async def selfpacedlab_provision_item_daemon(logger, stopped, **kwargs):
    item = SelfPacedLabProvisionItem.load(**kwargs)
    try:
        while not stopped:
            await item.manage(logger=logger)
            await asyncio.sleep(item.start_delay)
    except asyncio.CancelledError:
        pass


@kopf.on.create(
    SelfPacedLabUserAssignment.api_group, SelfPacedLabUserAssignment.api_version, SelfPacedLabUserAssignment.plural,
    labels={Babylon.babylon_ignore_label: kopf.ABSENT},
)
async def selfpacedlab_user_assignment_create(logger, **kwargs):
    assignment = SelfPacedLabUserAssignment.load(**kwargs)
    await assignment.handle_create(logger=logger)


@kopf.on.delete(
    SelfPacedLabUserAssignment.api_group, SelfPacedLabUserAssignment.api_version, SelfPacedLabUserAssignment.plural,
    labels={Babylon.babylon_ignore_label: kopf.ABSENT},
)
async def selfpacedlab_user_assignment_delete(logger, **kwargs):
    assignment = SelfPacedLabUserAssignment.load(**kwargs)
    await assignment.handle_delete(logger=logger)


@kopf.on.update(
    SelfPacedLabUserAssignment.api_group, SelfPacedLabUserAssignment.api_version, SelfPacedLabUserAssignment.plural,
    labels={Babylon.babylon_ignore_label: kopf.ABSENT},
)
async def selfpacedlab_user_assignment_update(logger, **kwargs):
    assignment = SelfPacedLabUserAssignment.load(**kwargs)
    await assignment.handle_update(logger=logger)
