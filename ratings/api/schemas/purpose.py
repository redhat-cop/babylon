from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime


class PurposeSchema(BaseModel):
    id: int = Field(..., description="The unique identifier for the purpose.")
    activity: str = Field(..., description="The activity of the purpose.")
    purpose: str = Field(..., description="The purpose of the purpose.")
    created_at: Optional[datetime] = Field(None, description="The created at of the purpose.")
    updated_at: Optional[datetime] = Field(None, description="The updated at of the purpose.")

    class Config:
        from_attributes = True
