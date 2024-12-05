from __future__ import annotations
from typing import Optional, List
import os
from datetime import datetime, timedelta
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
    relationship,
    selectinload,
)
from sqlalchemy import (
    Boolean,
    DDL,
    Integer,
    String,
    and_,
    desc,
    exists,
    event,
    or_,
    select,
    text,
)
from . import CustomBase
from .database import Database as db


class Bookmark(CustomBase):
    __tablename__ = 'bookmark'

    user_id: Mapped[int] = mapped_column(Integer, unique=False, nullable=False, comment='User id')
    asset_uuid: Mapped[str] = mapped_column(String, unique=False, nullable=False, index=False)
