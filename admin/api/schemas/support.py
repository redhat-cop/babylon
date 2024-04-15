from typing import List, Optional, Literal
import logging
from pydantic import BaseModel
from datetime import datetime


logger = logging.getLogger('babylon-api')


class SupportCreate(BaseModel):
    number_of_attendees: int
    sfdc: str
    name: str
    event_name: str
    guid: str
    start_time: datetime
    end_time: datetime
    email: str

class SupportResponse(BaseModel):
    sys_id: str
    request_number: str
    request_id: str