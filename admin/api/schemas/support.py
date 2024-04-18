from typing import List, Optional, Literal
import logging
from pydantic import BaseModel
from datetime import datetime


logger = logging.getLogger('babylon-api')


class SupportCreate(BaseModel):
    number_of_attendees: int
    sfdc: Optional[str]
    name: str
    event_name: Optional[str]
    url: str
    start_time: Optional[datetime]
    end_time: Optional[datetime]
    email: str

class SupportResponse(BaseModel):
    sys_id: str
    request_number: str
    request_id: str