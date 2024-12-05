from typing import List, Optional
import logging
from fastapi import APIRouter, HTTPException, Depends
from schemas import (
    BookmarkSchema,
    BookmarkListSchema
)

logger = logging.getLogger('babylon-ratings')


tags = ["user-manager"]

router = APIRouter(tags=tags)


@router.get("/api/user-manager/v1/bookmarks/{user_email}",
            response_model=BookmarkListSchema,
            summary="Get favorites catalog item asset")
async def bookmarks_get(user_email: str) -> BookmarkListSchema:

    logger.info(f"Getting favorites for user {user_email}")
    return await Bookmarks.getBy(user_email)

@router.post("/api/user-manager/v1/bookmarks/{user_email}",
             response_model={},
             summary="Add bookmark",
             )
async def bookmarks_post(user_email: str,
                                asset_uuid: str) -> {}:

    logger.info(f"Add favorite item for user {user_email}")
    try:
        await Bookmarks.addBy(user_email, asset_uuid)
    except Exception as e:
        logger.error(f"Error saving favorite: {e}", stack_info=True)
        raise HTTPException(status_code=404, detail="Error saving favorite") from e

    return {}

@router.delete("/api/user-manager/v1/bookmarks/{user_email}",
             response_model={},
             summary="Delete bookmark",
             )
async def bookmarks_delete(user_email: str,
                                asset_uuid: str) -> {}:

    logger.info(f"Delete favorite item for user {user_email}")
    try:
        await Bookmarks.deleteBy(user_email, asset_uuid)
    except Exception as e:
        logger.error(f"Error deleting favorite: {e}", stack_info=True)
        raise HTTPException(status_code=404, detail="Error deleting favorite") from e

    return {}

