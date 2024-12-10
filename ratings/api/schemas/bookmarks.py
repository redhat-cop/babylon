from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


class BookmarkSchema(BaseModel):
    asset_uuid: Optional[str] = Field(None, description="The asset uuid of the catalog item.")
    user_id: int = Field(..., description="The unique identifier for the user.")
    created_at: Optional[datetime] = Field(None, description="The date the bookmark was created.")
    updated_at: Optional[datetime] = Field(None, description="The date the bookmark was updated.")

    class Config:
        from_attributes = True

class BookmarkListSchema(BaseModel):
    bookmarks: Optional[List[BookmarkSchema]] = Field(..., description="The list of bookmarks.")

    class Config:
        from_attributes = True
