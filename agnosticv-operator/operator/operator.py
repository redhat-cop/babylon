import asyncio
import kopf
import kubernetes_asyncio
import logging

from agnosticvrepo import AgnosticVRepo
from agnosticvcomponent import AgnosticVComponent
from babylon import Babylon
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
    settings.persistence.finalizer = f"agnosticv-operator.{Babylon.agnosticv_api_group}"

    # Store progress in status. Some objects may be too large to store status in metadata annotations
    settings.persistence.progress_storage = kopf.StatusProgressStorage(field='status.kopf.progress')

    # Only create events for warnings and errors
    settings.posting.level = logging.WARNING

    # Disable scanning for crds and namespaces
    settings.scanning.disabled = True

    configure_kopf_logging()

@kopf.on.cleanup()
async def on_cleanup(**_):
    await Babylon.on_cleanup()

@kopf.on.create(AgnosticVComponent.api_group, AgnosticVComponent.version, 'agnosticvcomponents')
async def agnosticvcomponent_create(logger, **kwargs):
    agnosticv_component = AgnosticVComponent(**kwargs)
    await agnosticv_component.handle_create(logger=logger)

@kopf.on.delete(AgnosticVComponent.api_group, AgnosticVComponent.version, 'agnosticvcomponents')
async def agnosticvcomponent_delete(logger, **kwargs):
    agnosticv_component = AgnosticVComponent(**kwargs)
    await agnosticv_component.handle_delete(logger=logger)

@kopf.on.resume(AgnosticVComponent.api_group, AgnosticVComponent.version, 'agnosticvcomponents')
async def agnosticvcomponent_resume(logger, **kwargs):
    agnosticv_component = AgnosticVComponent(**kwargs)
    await agnosticv_component.handle_resume(logger=logger)

@kopf.on.update(AgnosticVComponent.api_group, AgnosticVComponent.version, 'agnosticvcomponents')
async def agnosticvcomponent_update(logger, **kwargs):
    agnosticv_component = AgnosticVComponent(**kwargs)
    await agnosticv_component.handle_update(logger=logger)

@kopf.on.create(AgnosticVRepo.api_group, AgnosticVRepo.version, 'agnosticvrepos')
async def agnosticvrepo_create(logger, **kwargs):
    agnosticv_repo = AgnosticVRepo.load(**kwargs)
    async with agnosticv_repo.lock:
        await agnosticv_repo.handle_create(logger=logger)

@kopf.on.delete(AgnosticVRepo.api_group, AgnosticVRepo.version, 'agnosticvrepos')
async def agnosticvrepo_delete(logger, **kwargs):
    agnosticv_repo = AgnosticVRepo.load(**kwargs)
    async with agnosticv_repo.lock:
        await agnosticv_repo.handle_delete(logger=logger)

@kopf.on.resume(AgnosticVRepo.api_group, AgnosticVRepo.version, 'agnosticvrepos')
async def agnosticvrepo_resume(logger, **kwargs):
    agnosticv_repo = AgnosticVRepo.load(**kwargs)
    async with agnosticv_repo.lock:
        await agnosticv_repo.handle_resume(logger=logger)

@kopf.on.update(AgnosticVRepo.api_group, AgnosticVRepo.version, 'agnosticvrepos')
async def agnosticvrepo_update(logger, **kwargs):
    agnosticv_repo = AgnosticVRepo.load(**kwargs)
    async with agnosticv_repo.lock:
        await agnosticv_repo.handle_update(logger=logger)

@kopf.daemon(AgnosticVRepo.api_group, AgnosticVRepo.version, 'agnosticvrepos', cancellation_timeout=1)
async def agnoticvrepo_daemon(logger, stopped, **kwargs):
    agnosticv_repo = AgnosticVRepo.load(**kwargs)
    try:
        while not stopped:
            await asyncio.sleep(agnosticv_repo.polling_interval)
            if stopped:
                break
            async with agnosticv_repo.lock:
                await agnosticv_repo.manage_components(
                    changed_only = not agnosticv_repo.github_preload_pull_requests,
                    logger = logger,
                )
    except asyncio.CancelledError:
        pass
