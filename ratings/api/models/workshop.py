from __future__ import annotations
from typing import Optional, List
from datetime import datetime
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import (
    Mapped,
    joinedload,
    mapped_column,
    relationship,
    selectinload,
)
from sqlalchemy import (
    Integer,
    String,
    Boolean,
    DateTime,
    DDL,
    ForeignKey,
    Index,
    SmallInteger,
    event,
    select,
    text,
)
from . import CustomBase, Database as db


class Workshop(CustomBase):
    __tablename__ = 'workshop'
    __date_field__ = 'provisioned_at'

    id: Mapped[str] = mapped_column(String, index=True, primary_key=True)
    catalog_id: Mapped[int] = mapped_column(Integer,
                                            ForeignKey('catalog_items.id'),
                                            nullable=True,
                                            index=True)
    user_id: Mapped[int] = mapped_column(Integer,
                                         ForeignKey('users.id'),
                                         nullable=True,
                                         index=True)
    category: Mapped[str] = mapped_column(String, nullable=True, index=True)
    display_name: Mapped[str] = mapped_column(String, index=True)
    is_running: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    multiuser: Mapped[bool] = mapped_column(Boolean)
    open_registration: Mapped[bool] = mapped_column(Boolean)
    provisioned_at: Mapped[datetime] = mapped_column(DateTime)
    retired_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    stage: Mapped[str] = mapped_column(String, index=True)
    user_experiences: Mapped[int] = mapped_column(Integer, server_default=text("1"))

    month: Mapped[int] = mapped_column(SmallInteger, index=True)
    month_name: Mapped[str] = mapped_column(String, index=True)
    month_ts: Mapped[datetime] = mapped_column(DateTime, index=True)
    quarter: Mapped[int] = mapped_column(SmallInteger)
    year: Mapped[int] = mapped_column(SmallInteger, index=True)
    year_month: Mapped[str] = mapped_column(String, index=True)

    assignments: Mapped[List['WorkshopAssignment']] = relationship("WorkshopAssignment",
                                                                   back_populates="workshop")

    catalog_item: Mapped['CatalogItem'] = relationship("CatalogItem",
                                                       foreign_keys=[catalog_id])

    provisions: Mapped[List['Provision']] = relationship("Provision",
                                                         back_populates="workshop")

    request: Mapped[List['ProvisionRequest']] = relationship("ProvisionRequest",
                                                             back_populates="workshop")

    user: Mapped['User'] = relationship("User")

    __table_args__ = (
        Index(f'ix_{__tablename__}_provisioned_at_desc', provisioned_at.desc()),
        Index(f'ix_{__tablename__}_retired_at_desc', retired_at.desc()),

        Index(f'ix_{__tablename__}_month_ts_desc', month_ts.desc()),
        Index(f'ix_{__tablename__}_year_desc', year.desc()),
        Index(f'ix_{__tablename__}_year_month_desc', year_month.desc()),
    )

    async def check_existing(self) -> Optional[Workshop]:
        return await Workshop.get_workshop_id(self.id)

    @classmethod
    async def get_by_id(cls, workshop_id: str) -> Optional[Workshop]:
        async with db.get_session() as session:
            stmt = select(Workshop)
            stmt = stmt.where(Workshop.id == workshop_id)
            stmt = stmt.options(
                selectinload(Workshop.assignments),
                joinedload(Workshop.catalog_item),
                selectinload(Workshop.provisions),
                joinedload(Workshop.user),
                )
            result = await session.execute(stmt)
            return result.scalars().first()

    @classmethod
    async def get_workshop_id(cls, workshop_id: str) -> Optional[Workshop]:
        async with db.get_session() as session:
            stmt = select(Workshop)
            stmt = stmt.where(Workshop.id == workshop_id)
            stmt = stmt.options(
                selectinload(Workshop.assignments),
                joinedload(Workshop.catalog_item),
                selectinload(Workshop.provisions),
                joinedload(Workshop.user),
                )
            result = await session.execute(stmt)
            return result.scalars().first()

