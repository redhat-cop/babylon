from typing import List, Optional
import logging
from fastapi import APIRouter, HTTPException, Depends
from schemas import (
    BookmarkSchema,
    BookmarkListSchema
)
from models import Bookmark, User
logger = logging.getLogger('babylon-ratings')


tags = ["user-manager"]

router = APIRouter(tags=tags)


@router.get("/api/user-manager/v1/bookmarks/{user_email}",
            response_model=BookmarkListSchema,
            summary="Get favorites catalog item asset")
async def bookmarks_get(user_email: str) -> BookmarkListSchema:

    logger.info(f"Getting favorites for user {user_email}")
    try:
        user = await User.get_by_email(user_email)
        if user:
            logger.info(user.bookmarks)
            return BookmarkListSchema(bookmarks=user.bookmarks)
        else:
            raise HTTPException(status_code=404, detail="User email doesn't exists") from e 
    except Exception as e:
        logger.error(f"Error getting favorite: {e}", stack_info=True)
        raise HTTPException(status_code=500, detail="Error getting favorites") from e

@router.post("/api/user-manager/v1/bookmarks",
             response_model=BookmarkListSchema,
             summary="Add bookmark",
             )
async def bookmarks_post(user_email: str,
                                asset_uuid: str) -> {}:

    logger.info(f"Add favorite item for user {user_email}")
    try:
        user = await User.get_by_email(user_email)
        if user:
            logger.info(user)
            bookmark = Bookmark.from_dict({"user_id": user.id, "asset_uuid": asset_uuid})
            await bookmark.save()
            user = await User.get_by_email(user_email)
            return BookmarkListSchema(bookmarks=user.bookmarks)
        else:
            raise HTTPException(status_code=404, detail="User email doesn't exists") from e 
    except Exception as e:
        logger.error(f"Error saving favorite: {e}", stack_info=True)
        raise HTTPException(status_code=500, detail="Error saving favorites") from e

@router.delete("/api/user-manager/v1/bookmarks",
             response_model={},
             summary="Delete bookmark",
             )
async def bookmarks_delete(user_email: str,
                                asset_uuid: str) -> BookmarkListSchema:

    logger.info(f"Delete favorite item for user {user_email}")
    try:
        user = await User.get_by_email(user_email)
        if user:
            bookmark = Bookmark.from_dict({"user_id": user.id, "asset_uuid": asset_uuid})
            await bookmark.delete()
            user = await User.get_by_email(user_email)
            return BookmarkListSchema(bookmarks=user.bookmarks)
        else:
            raise HTTPException(status_code=404, detail="User email doesn't exists") from e 
   
    except Exception as e:
        logger.error(f"Error deleting favorite: {e}", stack_info=True)
        raise HTTPException(status_code=404, detail="Error deleting favorite") from e

