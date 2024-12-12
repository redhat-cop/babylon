from typing import List, Optional
import logging
from fastapi import APIRouter, HTTPException, Depends
from schemas import (
    BookmarkSchema,
    BookmarkRequestSchema,
    BookmarkListResponseSchema
)
from models import Bookmark, User
logger = logging.getLogger('babylon-ratings')


tags = ["user-manager"]

router = APIRouter(tags=tags)


@router.get("/api/user-manager/v1/bookmarks/{email}",
            response_model=BookmarkListResponseSchema,
            summary="Get favorites catalog item asset")
async def bookmarks_get(email: str) -> BookmarkListResponseSchema:

    logger.info(f"Getting favorites for user {email}")
    try:
        user = await User.get_by_email(email)
        if user:
            bookmarks_response = [
                BookmarkSchema.from_orm(bookmark).dict(exclude={"user_id"}) for bookmark in user.bookmarks
            ]
            return BookmarkListResponseSchema(bookmarks=bookmarks_response)
        else:
            raise HTTPException(status_code=404, detail="User email doesn't exists") from e 
    except Exception as e:
        logger.error(f"Error getting favorite: {e}", stack_info=True)
        raise HTTPException(status_code=500, detail="Error getting favorites") from e

@router.post("/api/user-manager/v1/bookmarks",
             response_model=BookmarkListResponseSchema,
             summary="Add bookmark",
             )
async def bookmarks_post(bookmark_obj: BookmarkRequestSchema) -> BookmarkListResponseSchema:

    logger.info(f"Add favorite item for user {bookmark_obj.email}")
    try:
        user = await User.get_by_email(bookmark_obj.email)
        if user:
            bookmark = Bookmark.from_dict({"user_id": user.id, "asset_uuid": bookmark_obj.asset_uuid})
            await bookmark.save()
            user = await User.get_by_email(bookmark_obj.email)
            bookmarks_response = [
                BookmarkSchema.from_orm(bookmark).dict(exclude={"user_id"}) for bookmark in user.bookmarks
            ]
            return BookmarkListResponseSchema(bookmarks=bookmarks_response)
        else:
            raise HTTPException(status_code=404, detail="User email doesn't exists") from e 
    except Exception as e:
        logger.error(f"Error saving favorite: {e}", stack_info=True)
        raise HTTPException(status_code=500, detail="Error saving favorites") from e

@router.delete("/api/user-manager/v1/bookmarks",
             response_model=BookmarkListResponseSchema,
             summary="Delete bookmark",
             )
async def bookmarks_delete(bookmark_obj: BookmarkRequestSchema) -> BookmarkListResponseSchema:

    logger.info(f"Delete favorite item for user {bookmark_obj.email}")
    try:
        user = await User.get_by_email(bookmark_obj.email)
        if user:
            bookmark = Bookmark.from_dict({"user_id": user.id, "asset_uuid": bookmark_obj.asset_uuid})
            await bookmark.delete()
            user = await User.get_by_email(bookmark_obj.email)
            bookmarks_response = [
                BookmarkSchema.from_orm(bookmark).dict(exclude={"user_id"}) for bookmark in user.bookmarks
            ]
            return BookmarkListResponseSchema(bookmarks=bookmarks_response)
        else:
            raise HTTPException(status_code=404, detail="User email doesn't exists") from e 
   
    except Exception as e:
        logger.error(f"Error deleting favorite: {e}", stack_info=True)
        raise HTTPException(status_code=404, detail="Error deleting favorite") from e

