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
    ForeignKey,
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
from . import CustomBaseMinimal
from .database import Database as db
from .catalog_item import CatalogItem
import logging

logger = logging.getLogger()

class Bookmark(CustomBaseMinimal):
    __tablename__ = 'bookmarks'
    __date_field__ = 'created_at'

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey('users.id'), unique=False, nullable=False, comment='User id', primary_key=True)
    asset_uuid: Mapped[str] = mapped_column(String, ForeignKey('catalog_items.asset_uuid'), unique=False, nullable=False, primary_key=True)
    
    user: Mapped["User"] = relationship("User", back_populates="bookmarks")

    async def check_existing(self) -> Optional[Bookmark]:
        async with db.get_session() as session:
            stmt = select(Bookmark)
            stmt = stmt.where(and_(Bookmark.user_id == self.user_id,
                                  Bookmark.asset_uuid == self.asset_uuid
                                  )
                              )
            result = await session.execute(stmt)
            return result.scalars().first()

