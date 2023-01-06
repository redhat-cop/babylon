#!/usr/bin/env python3

import logging
import asyncio
import kopf
import aiohttp

from rating import Rating
from babylon import Babylon
from catalog_item import CatalogItem
from configure_kopf_logging import configure_kopf_logging
from infinite_relative_backoff import InfiniteRelativeBackoff

async def get_rating_from_api(catalog_item, logger):
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{Babylon.ratings_api}/api/ratings/v1/catalogitem/{catalog_item.name}", ssl=False) as resp:
                if resp.status == 200:
                    logger.info(f"/api/ratings/v1/catalogitem/{catalog_item.name} - {resp.status}")
                    response = await resp.json()
                    return Rating(response.get('rating_score', None), response.get('total_ratings', 0))
                logger.warn(f"/api/ratings/v1/catalogitem/{catalog_item.name} - {resp.status}")
    except Exception as e:
        logger.error(f"Invalid connection with {Babylon.ratings_api} - {e}")
        raise

async def manage_catalog_item_rating(catalog_item, logger):
    rating = await get_rating_from_api(catalog_item, logger=logger)
    logger.info(f"Rating of {catalog_item.name} is {rating.rating_score} of {rating.total_ratings} -- was {catalog_item.rating.rating_score} of {catalog_item.rating.total_ratings}")
    if rating != catalog_item.rating:
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

@kopf.timer(CatalogItem.api_group, CatalogItem.api_version, CatalogItem.plural, interval=1800)
async def manage_catalog_item(logger, **kwargs):
    catalog_item = CatalogItem(**kwargs)
    await manage_catalog_item_rating(catalog_item, logger);
