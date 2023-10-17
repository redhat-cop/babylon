from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime
from .catalog_item import CatalogItemSchema
from .user import UserSchema
from .provision import ProvisionSchema
from .purpose import PurposeSchema
from .workshop import WorkshopSchema


class RequestSchema(BaseModel):
    id: str = Field(..., description="The unique identifier for the request.")
    catalog_id: int = Field(..., description="The unique identifier for the catalog item.")
    purpose_id: int = Field(..., description="The unique identifier for the purpose.")
    user_id: int = Field(..., description="The unique identifier for the user.")
    workshop_id: Optional[str] = Field(None, description="The unique identifier for the workshop.")
    category: Optional[str] = Field(None, description="The category of the request.")
    datasource: Optional[str] = Field(None, description="The datasource of the request.")
    deletion_requested_at: Optional[datetime] = Field(None,
                                                      description="The deletion requested at of the request.")
    display_name: Optional[str] = Field(None, description="The display name of the request.")
    provisioned_at: datetime = Field(..., description="The provisioned at of the request.")
    request_result: Optional[str] = Field(None, description="The request result of the request.")
    requested_at: datetime = Field(..., description="The requested at of the request.")
    retired_at: Optional[datetime] = Field(None, description="The retired at of the request.")
    stage: str = Field(..., description="The stage of the request.")
    user_experiences: int = Field(..., description="The user experiences of the request.")
    user_geo: str = Field(..., description="The user geo of the request.")
    user_group: str = Field(..., description="The user group of the request.")
    month: int = Field(..., description="The month of the request.")
    month_name: str = Field(..., description="The month name of the request.")
    month_ts: datetime = Field(..., description="The month ts of the request.")
    quarter: int = Field(..., description="The quarter of the request.")
    year: int = Field(..., description="The year of the request.")
    year_month: str = Field(..., description="The year month of the request.")

    catalog_item: Optional[CatalogItemSchema] = Field(None,
                                                      description="Details of the associated catalog item.")
    provisions: Optional[List[ProvisionSchema]] = Field(None,
                                                        description="Details of the associated provision.")
    purpose: Optional[PurposeSchema] = Field(None,
                                             description="Details of the associated purpose.")
    user: Optional[UserSchema] = Field(None,
                                       description="Details of the associated user.")
    workshop: Optional[WorkshopSchema] = Field(None,
                                               description="Details of the associated workshop.")

    class Config:
        from_attributes = True
