from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


class CatalogItemSchema(BaseModel):
    id: int = Field(..., description="The unique identifier for the catalog item.")
    asset_uuid: Optional[str] = Field(None, description="The asset uuid of the catalog item.")
    binder: bool = Field(..., description="True if binder catalog item.")
    category: Optional[str] = Field(None, description="The category of the catalog item.")
    display_name: Optional[str] = Field(None, description="The display name of the catalog item.")
    multiuser: bool = Field(..., description="True if multiuser catalog item.")
    name: str = Field(..., description="The name of the catalog item.")
    last_commit: Optional[datetime] = Field(None,
                                            description="The last commit of the catalog item.")
    comments: Optional[str] = Field(None, description="Last commit comment.")
    created_at: datetime = Field(..., description="The created at of the catalog item.")
    updated_at: datetime = Field(..., description="The updated at of the catalog item.")

    class Config:
        from_attributes = True
