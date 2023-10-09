from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime


class UserSchema(BaseModel):
    id: int = Field(..., description="The unique identifier for the user.")
    email: str = Field(..., description="The email of the user.")
    cost_center: Optional[int] = Field(None, description="The cost center of the user.")
    employee_number: Optional[int] = Field(None, description="The employee number of the user.")
    first_name: Optional[str] = Field(None, description="The first name of the user.")
    full_name: str = Field(..., description="The full name of the user.")
    geo: Optional[str] = Field(None, description="The geo of the user.")
    last_name: str = Field(..., description="The last name of the user.")
    rhat_job_title: Optional[str] = Field(None, description="The rhat job title of the user.")
    title: Optional[str] = Field(None, description="The title of the user.")
    username: str = Field(..., description="The username of the user.")
    user_group: str = Field(..., description="The user group of the user.")
    user_source: Optional[str] = Field(None, description="The user source of the user.")
    created_at: Optional[datetime] = Field(None, description="The created at of the user.")
    updated_at: Optional[datetime] = Field(None, description="The updated at of the user.")

    class Config:
        from_attributes = True
