from typing import List, Optional
import logging
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum


logger = logging.getLogger('babylon-api')


class IncidentStatus(str, Enum):
    ACTIVE = "active"
    RESOLVED = "resolved"


class IncidentStatusAll(str, Enum):
    ACTIVE = "active"
    RESOLVED = "resolved"
    ALL = "all"


class IncidentType(str, Enum):
    GENERAL = "general"


class IncidentLevel(str, Enum):
    CRITICAL = "critical"
    INFO = "info"
    WARNING = "warning"


class StatusParams(BaseModel):
    status: IncidentStatusAll = Field(
        ...,
        example="active",
        alias="status",
        title="Incident Status",
        description="The status of the incident (active, resolved, all).",
    )


class IncidentSchema(BaseModel):
    id: int = Field(..., description="Incident ID")
    status: IncidentStatus = Field(..., description="Status of the incident")
    incident_type: IncidentType = Field(..., description="Type of the incident")
    level: IncidentLevel = Field(..., description="Level of the incident")
    message: str = Field(None, description="Message of the incident")
    created_at: datetime = Field(None, description="Date of creation of the incident")
    updated_at: datetime = Field(None, description="Date of update of the incident")

    class Config:
        # orm_mode = True
        from_attributes = True


class IncidentCreate(BaseModel):
    status: IncidentStatus = Field(default='active', description="Status of the incident")
    level: IncidentLevel = Field(default='info', description="Level of the incident")
    message: str = Field(..., description="Message of the incident")
    incident_type: IncidentType = Field(default='general', description="Type of the incident")
