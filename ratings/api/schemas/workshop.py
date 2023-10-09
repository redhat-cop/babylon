from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime


class WorkshopSchema(BaseModel):

    id: str = Field(..., description="The unique identifier for the workshop.")
    catalog_id: int = Field(..., description="The unique identifier for the catalog item.")
    user_id: Optional[int] = Field(..., description="The unique identifier for the user.")
    category: str = Field(..., description="The category of the workshop.")
    display_name: str = Field(..., description="The display name of the workshop.")
    is_running: bool = Field(..., description="True if workshop is running.")
    multiuser: bool = Field(..., description="True if multiuser workshop.")
    open_registration: bool = Field(..., description="True if workshop is open for registration.")
    provisioned_at: datetime = Field(..., description="The provisioned at of the workshop.")
    retired_at: datetime = Field(..., description="The retired at of the workshop.")
    stage: str = Field(..., description="The stage of the workshop.")
    user_experiences: int = Field(..., description="The user experiences of the workshop.")
    month: int = Field(..., description="The month of the workshop.")
    month_name: str = Field(..., description="The month name of the workshop.")
    month_ts: datetime = Field(..., description="The month ts of the workshop.")
    quarter: int = Field(..., description="The quarter of the workshop.")
    year: int = Field(..., description="The year of the workshop.")
    year_month: str = Field(..., description="The year month of the workshop.")

    class Config:
        from_attributes = True


class WorkshopRequestSchema(BaseModel):
    request_id: str = Field(..., description="The unique identifier for the request.")
