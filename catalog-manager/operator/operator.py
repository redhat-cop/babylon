#!/usr/bin/env python3

import logging
import asyncio
import kopf
import aiohttp

from rating import Rating
from babylon import Babylon
from catalog_item import CatalogItem
from catalog_item_service import CatalogItemService
from configure_kopf_logging import configure_kopf_logging
from infinite_relative_backoff import InfiniteRelativeBackoff

async def manage_catalog_item_rating(catalog_item, logger):
    rating = await CatalogItemService(catalog_item, logger=logger).get_rating_from_api()
    logger.info(f"Rating of {catalog_item.name} is {rating.rating_score} of {rating.total_ratings} -- was {catalog_item.rating.rating_score} of {catalog_item.rating.total_ratings}")
    if rating != catalog_item.rating and rating.rating_score is not None:
        patch = {
            "metadata": {
                "labels": {
                    Babylon.catalog_item_rating_label: str(rating.rating_score)
                },
                "annotations": {
                    Babylon.catalog_item_total_ratings: str(rating.total_ratings)
                }
            }
        }
        await catalog_item.merge_patch(patch)
        logger.info(f"Updated rating ({rating.rating_score} of {rating.total_ratings}) for CatalogItem: {catalog_item.name}")

async def manage_catalog_item_provision_data(catalog_item, logger):
    provision_data = await CatalogItemService(catalog_item, logger=logger).get_provision_data()
    logger.info(f"Last successful provision of {catalog_item.name} at {provision_data.last_successful_provision}")
    if (provision_data.last_successful_provision != catalog_item.annotations.get(Babylon.catalog_item_last_successful_provision, None)):
        patch = {
            "metadata": {
                "annotations": {
                    Babylon.catalog_item_last_successful_provision: provision_data.last_successful_provision
                }
            }
        }
        await catalog_item.merge_patch(patch)
        logger.info(f"Updated last successful provision time ({provision_data.last_successful_provision}) for CatalogItem: {catalog_item.name}")

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

manage_catalog_item_lock = asyncio.Lock()

@kopf.timer(CatalogItem.api_group, CatalogItem.api_version, CatalogItem.plural, interval=1800)
async def manage_catalog_item(logger, **kwargs):
    async with manage_catalog_item_lock:
        catalog_item = CatalogItem(**kwargs)
        await manage_catalog_item_rating(catalog_item, logger)
        await manage_catalog_item_provision_data(catalog_item, logger)