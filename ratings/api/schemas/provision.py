from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime, timedelta


class ProvisionSchema(BaseModel):
    uuid: str = Field(..., description="The unique identifier for the provision.")
    catalog_id: int = Field(..., description="The unique identifier for the catalog item.")
    purpose_id: int = Field(..., description="The unique identifier for the purpose.")
    resource_id: Optional[int] = Field(None, description="The unique identifier for the resource.")
    request_id: Optional[str] = Field(None, description="The unique identifier for the request.")
    user_id: int = Field(..., description="The unique identifier for the user.")
    workshop_id: Optional[str] = Field(None, description="The unique identifier for the workshop.")
    account: Optional[str] = Field(None, description="The account of the provision.")
    anarchy_governor: Optional[str] = Field(None,
                                            description="The anarchy governor of the provision.")
    anarchy_subject_name: Optional[str] = Field(None,
                                                description="The anarchy subject name of the provision.")
    anarchy_subject_namespace: Optional[str] = Field(None,
                                                     description="The anarchy subject namespace of the provision.")
    babylon_guid: Optional[str] = Field(None, description="The babylon guid of the provision.")
    category: Optional[str] = Field(None, description="The category of the provision.")
    cloud: Optional[str] = Field(None, description="The cloud of the provision.")
    cloud_region: Optional[str] = Field(None, description="The cloud region of the provision.")
    comments: Optional[str] = Field(None, description="The comments of the provision.")
    datasource: Optional[str] = Field(None, description="The datasource of the provision.")
    deletion_requested_at: Optional[datetime] = Field(None,
                                                      description="The deletion requested at of the provision.")
    deploy_interval: Optional[timedelta] = Field(None, description="The deploy interval of the provision.")
    display_name: Optional[str] = Field(None, description="The display name of the provision.")
    environment: Optional[str] = Field(None, description="The environment of the provision.")
    lifetime_interval: Optional[timedelta] = Field(None, description="The lifetime interval of the provision.")
    provision_result: Optional[str] = Field(None, description="The provision result of the provision.")
    provision_time: Optional[float] = Field(None, description="The provision time of the provision.")
    provisioned_at: Optional[datetime] = Field(None, description="The provisioned at of the provision.")
    purpose_explanation: Optional[str] = Field(None, description="The purpose explanation of the provision.")
    retired_at: Optional[datetime] = Field(None, description="The retired at of the provision.")
    requested_at: Optional[datetime] = Field(None, description="The requested at of the provision.")
    sandbox_name: Optional[str] = Field(None, description="The sandbox name of the provision.")
    user_cost_center: Optional[int] = Field(None, description="The user cost center of the provision.")
    user_experiences: Optional[int] = Field(None, description="The user experiences of the provision.")
    user_geo: Optional[str] = Field(None, description="The user geo of the provision.")
    user_group: Optional[str] = Field(None, description="The user group of the provision.")
    created_at: datetime = Field(..., description="The created at of the provision.")
    updated_at: datetime = Field(..., description="The updated at of the provision.")
    month: int = Field(..., description="The month of the provision.")
    month_name: str = Field(..., description="The month name of the provision.")
    month_ts: datetime = Field(..., description="The month ts of the provision.")
    quarter: int = Field(..., description="The quarter of the provision.")
    year: int = Field(..., description="The year of the provision.")
    year_month: str = Field(..., description="The year month of the provision.")

    class Config:
        from_attributes = True
