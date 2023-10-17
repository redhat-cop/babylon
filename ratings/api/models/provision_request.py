from __future__ import annotations
from typing import Optional, List
from datetime import datetime
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
    relationship,
    joinedload,
    selectinload
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import (
    Boolean,
    DateTime,
    DDL,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    select,
    text,
    desc,
)
from . import CustomBase
from .provision import Provision
from .database import Database as db


class ProvisionRequest(CustomBase):
    __tablename__ = 'provision_request'
    __date_field__ = 'provisioned_at'

    id: Mapped[str] = mapped_column(String, primary_key=True, index=True, unique=True)
    catalog_id: Mapped[int] = mapped_column(Integer,
                                            ForeignKey('catalog_items.id'),
                                            index=True)
    purpose_id: Mapped[int] = mapped_column(Integer,
                                            ForeignKey('purpose.id'),
                                            index=True)
    user_id: Mapped[int] = mapped_column(Integer,
                                         ForeignKey('users.id'),
                                         index=True)
    workshop_id: Mapped[str] = mapped_column(String,
                                             ForeignKey('workshop.id',
                                                        ondelete='SET NULL'),
                                             nullable=True,
                                             index=True)
    category: Mapped[str] = mapped_column(String, nullable=True, index=True)

    datasource: Mapped[str] = mapped_column(String,
                                            server_default=text("'RHPDS'"),
                                            index=True)
    deletion_requested_at: Mapped[datetime] = mapped_column(DateTime,
                                                            nullable=True)
    display_name: Mapped[str] = mapped_column(String, nullable=True, index=True)
    provisioned_at: Mapped[datetime] = mapped_column(DateTime,
                                                     server_default=text("(now() at time zone 'utc')"))
    report_display_name: Mapped[str] = mapped_column(String, nullable=True, index=True)
    request_result: Mapped[str] = mapped_column(String, index=True, default='pending')
    requested_at: Mapped[datetime] = mapped_column(DateTime)
    retired_at: Mapped[datetime] = mapped_column(DateTime, nullable=True, index=True)
    stage: Mapped[str] = mapped_column(String, index=True)
    user_experiences: Mapped[int] = mapped_column(Integer, server_default=text("1"))
    user_geo: Mapped[str] = mapped_column(String, index=True)
    user_group: Mapped[str] = mapped_column(String, index=True)

    month: Mapped[int] = mapped_column(SmallInteger, index=True)
    month_name: Mapped[str] = mapped_column(String, index=True)
    month_ts: Mapped[datetime] = mapped_column(DateTime, index=True)
    quarter: Mapped[int] = mapped_column(SmallInteger, index=True)
    year: Mapped[int] = mapped_column(SmallInteger, index=True)
    year_month: Mapped[str] = mapped_column(String, index=True)

    catalog_item: Mapped['CatalogItem'] = relationship("CatalogItem",
                                                       back_populates="request")

    provisions: Mapped[List['Provision']] = relationship("Provision",
                                                         back_populates="request")
    purpose: Mapped['Purpose'] = relationship("Purpose",
                                              back_populates='provision_requests')

    user: Mapped['User'] = relationship("User", back_populates="provision_requests", foreign_keys=[user_id])

    workshop: Mapped['Workshop'] = relationship("Workshop",
                                                back_populates="request")

    __table_args__ = (
        Index(f'ix_{__tablename__}_requested_at_desc', requested_at.desc()),
        Index(f'ix_{__tablename__}_provisioned_at_desc', provisioned_at.desc()),
        Index(f'ix_{__tablename__}_retired_at_desc', retired_at.desc()),

        Index(f'ix_{__tablename__}_month_ts_desc', month_ts.desc()),
        Index(f'ix_{__tablename__}_year_desc', year.desc()),
        Index(f'ix_{__tablename__}_year_month_desc', year_month.desc()),
    )

    async def check_existing(self) -> Optional[ProvisionRequest]:
        return await ProvisionRequest.get_by_id(self.id)

    @classmethod
    async def get_by_id(cls, request_id: str) -> Optional[ProvisionRequest]:
        async with db.get_session() as session:
            stmt = select(ProvisionRequest)
            stmt = stmt.where(ProvisionRequest.id == request_id)
            stmt = stmt.options(
                joinedload(ProvisionRequest.catalog_item),
                joinedload(ProvisionRequest.purpose),
                selectinload(ProvisionRequest.provisions),
                joinedload(ProvisionRequest.user),
                joinedload(ProvisionRequest.workshop),
                )

            result = await session.execute(stmt)
            return result.scalars().first()

    @classmethod
    async def get_request_workshop(cls, workshop_id: str) -> Optional[ProvisionRequest]:
        async with db.get_session() as session:
            stmt = select(ProvisionRequest)
            stmt = stmt.where(ProvisionRequest.workshop_id == workshop_id)
            stmt = stmt.order_by(desc(ProvisionRequest.created_at))
            result = await session.execute(stmt)
            return result.scalars().first()
