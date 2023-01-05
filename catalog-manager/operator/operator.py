#!/usr/bin/env python3

import kopf
import asyncio
import logging

from configure_kopf_logging import configure_kopf_logging
from infinite_relative_backoff import InfiniteRelativeBackoff
from catalog_item import CatalogItem
from babylon import Babylon, get_rating_from_api

async def manage_catalog_item_rating(catalog_item, logger):
    rating = get_rating_from_api(catalog_item, logger=logger)
    logger.info(f"Rating of {catalog_item.name} is {rating.rating_score} of {rating.total_ratings} -- was {catalog_item.rating.rating_score} of {catalog_item.rating.total_ratings}")
    if rating != catalog_item.rating:
        await catalog_item.set_rating(rating, logger=logger)
        logger.info(f"Updated rating ({rating.rating_score} of {rating.total_ratings}) for CatalogItem: {catalog_item.name}")


@kopf.on.startup()
async def on_startup(logger, settings, **_):
    await Babylon.on_startup()

    # Never give up from network errors
    settings.networking.error_backoffs = InfiniteRelativeBackoff()

    # Store last handled configuration in status
    settings.persistence.diffbase_storage = kopf.StatusDiffBaseStorage(field='status.diffBase')

    # Use operator domain as finalizer
    settings.persistence.finalizer = f"{Babylon.babylon_domain}/catalog-manager"

    # Store progress in status
    settings.persistence.progress_storage = kopf.StatusProgressStorage(field='status.kopf.progress')

    # Only create events for warnings and errors
    settings.posting.level = logging.WARNING

    # Disable scanning for crds and namespaces
    settings.scanning.disabled = True

    configure_kopf_logging()


@kopf.on.cleanup()
async def on_cleanup():
    await Babylon.on_cleanup()

@kopf.timer(Babylon.babylon_domain, Babylon.babylon_api_version, CatalogItem.plural, interval=60)
async def manage_catalog_item(logger, **kwargs):
    catalog_item = CatalogItem(**kwargs)
    await manage_catalog_item_rating(catalog_item, logger);
