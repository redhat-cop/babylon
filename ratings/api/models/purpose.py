from __future__ import annotations
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
    relationship,
    
)

from sqlalchemy import (
    Column,
    Integer,
    String,
    UniqueConstraint,
    select,
)
from sqlalchemy.exc import IntegrityError
from . import CustomBase, Base
from .database import Database as db


class Purpose(CustomBase):
    __tablename__ = 'purpose'
    id = mapped_column(Integer, primary_key=True, autoincrement=True)
    activity: Mapped[str] = mapped_column(String, index=True)
    purpose: Mapped[str] = mapped_column(String, index=True, nullable=True)

    provisions: Mapped[List["Provision"]] = relationship("Provision", back_populates="purpose")
    provision_requests: Mapped[List["ProvisionRequest"]] = relationship("ProvisionRequest",
                                                                        back_populates="purpose")

    __table_args__ = (
        UniqueConstraint('activity', 'purpose'),
    )

    async def check_existing(self) -> Optional[Purpose]:
        async with db.get_session() as session:
            stmt = select(Purpose)
            stmt = stmt.filter_by(activity=self.activity,
                                  purpose=self.purpose)
            result = await session.execute(stmt)
            return result.scalars().first()

    async def get_by_category_and_purpose(self) -> Optional[Purpose]:
        async with db.get_session() as session:
            query = select(Purpose).filter_by(activity=self.activity,
                                              purpose=self.purpose)
            result = await session.execute(query)
            return result.scalars().first()

    @classmethod
    async def get_purpose_activity(cls,
                                   purpose: str,
                                   activity: str
                                   ) -> Optional[Purpose]:

        async with db.get_session() as session:
            query = select(Purpose).filter_by(activity=activity,
                                              purpose=purpose)
            result = await session.execute(query)
            return result.scalars().first()
