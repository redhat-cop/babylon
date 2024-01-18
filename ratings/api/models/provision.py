from __future__ import annotations
from typing import Optional, List
from datetime import datetime, timedelta
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
    relationship,
    selectinload,
    joinedload,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import (
    Boolean,
    DateTime,
    DDL,
    ForeignKey,
    Index,
    Integer,
    Interval,
    Numeric,
    SmallInteger,
    String,
    event,
    select,
    text,
)
from . import CustomBaseUuid
from .database import Database as db


class Provision(CustomBaseUuid):
    __tablename__ = 'provisions'
    __date_field__ = 'provisioned_at'

    uuid: Mapped[str] = mapped_column(String, primary_key=True, index=True)
    catalog_id: Mapped[int] = mapped_column(Integer,
                                            ForeignKey('catalog_items.id'),
                                            nullable=True, index=True)
    purpose_id: Mapped[int] = mapped_column(Integer,
                                            ForeignKey('purpose.id'),
                                            nullable=True,
                                            index=True)
    resource_id: Mapped[int] = mapped_column(Integer,
                                             ForeignKey('catalog_resource.id',
                                                        ondelete='SET NULL'),
                                             nullable=True, index=True)
    request_id: Mapped[str] = mapped_column(String,
                                            ForeignKey('provision_request.id',
                                                       ondelete='SET NULL'),
                                            nullable=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey('users.id'),
                                         nullable=True,
                                         index=True)
    workshop_id: Mapped[str] = mapped_column(String,
                                             ForeignKey('workshop.id',
                                                        ondelete='SET NULL'),
                                             nullable=True, index=True)
    account: Mapped[str] = mapped_column(String, nullable=True, index=True)
    anarchy_governor: Mapped[str] = mapped_column(String, nullable=True)
    anarchy_subject_name: Mapped[str] = mapped_column(String, nullable=True)
    anarchy_subject_namespace: Mapped[str] = mapped_column(String, nullable=True)
    babylon_guid: Mapped[str] = mapped_column(String, nullable=True, index=True)
    category: Mapped[str] = mapped_column(String, nullable=True, index=True)
    chargeback_method: Mapped[str] = mapped_column(String, server_default=text("'regional'"),
                                                   index=True)
    class_name: Mapped[str] = mapped_column(String, nullable=True, index=True)
    cloud: Mapped[str] = mapped_column(String, nullable=True, index=True)
    cloud_region: Mapped[str] = mapped_column(String, nullable=True, index=True)
    datasource: Mapped[str] = mapped_column(String, nullable=True, index=True)
    deletion_requested_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    deploy_interval: Mapped[timedelta] = mapped_column(Interval, nullable=True)
    display_name: Mapped[str] = mapped_column(String, nullable=True, index=True)
    environment: Mapped[str] = mapped_column(String, index=True)
    events_datasource: Mapped[str] = mapped_column(String, nullable=True)
    guid: Mapped[str] = mapped_column(String, nullable=True, index=True)
    healthy: Mapped[bool] = mapped_column(Boolean, index=True, server_default=text("True"))
    last_state: Mapped[str] = mapped_column(String, nullable=True)
    lifetime_interval: Mapped[timedelta] = mapped_column(Interval, nullable=True)
    manager_chargeback_id: Mapped[datetime] = mapped_column(Integer, nullable=True, index=True)
    manager_id: Mapped[int] = mapped_column(Integer, nullable=True, index=True)
    provision_result: Mapped[str] = mapped_column(String, nullable=True, index=True)
    provision_time: Mapped[float] = mapped_column(Numeric, nullable=True)
    provisioned_at: Mapped[datetime] = mapped_column(DateTime, server_default=text("(now() at time zone 'utc')"))
    purpose_explanation: Mapped[str] = mapped_column(String, nullable=True)
    retired_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    sales_comment: Mapped[str] = mapped_column(String, nullable=True, index=True)
    sales_used: Mapped[bool] = mapped_column(Boolean, index=True, server_default=text("False"),
                                             default=False,
                                             comment='If True any sales related fields are used')
    sandbox_name: Mapped[str] = mapped_column(String, nullable=True, index=True)
    service_type: Mapped[str] = mapped_column(String, nullable=True, index=True)
    stack_retries: Mapped[int] = mapped_column(Integer, nullable=True, server_default=text("0"))
    user_cost_center: Mapped[int] = mapped_column(Integer, nullable=True, index=True)
    user_experiences: Mapped[int] = mapped_column(Integer, server_default=text("1"))
    user_geo: Mapped[str] = mapped_column(String, nullable=True, index=True)
    user_group: Mapped[str] = mapped_column(String, nullable=True, index=True)
    tower_job_id: Mapped[int] = mapped_column(Integer, nullable=True)
    tower_job_url: Mapped[str] = mapped_column(String, nullable=True)
    tshirt_size: Mapped[str] = mapped_column(String, nullable=True)

    modified_at: Mapped[datetime] = mapped_column(DateTime, nullable=True,
                                                  comment='Will be replaced by updated_at')

    month: Mapped[int] = mapped_column(SmallInteger, index=True)
    month_name: Mapped[str] = mapped_column(String, index=True)
    month_ts: Mapped[datetime] = mapped_column(DateTime, index=True)
    quarter: Mapped[int] = mapped_column(SmallInteger)
    year: Mapped[int] = mapped_column(SmallInteger, index=True)
    year_month: Mapped[str] = mapped_column(String, index=True)

    catalog_item: Mapped['CatalogItem'] = relationship("CatalogItem",
                                                       back_populates="provisions")

    purpose: Mapped['Purpose'] = relationship("Purpose",
                                              back_populates='provisions')

    request: Mapped['ProvisionRequest'] = relationship("ProvisionRequest",
                                                       back_populates="provisions")

    resource: Mapped["Resource"] = relationship("Resource")

    user: Mapped['User'] = relationship("User", back_populates="provisions")

    workshop: Mapped['Workshop'] = relationship("Workshop",
                                                back_populates="provisions")

    __table_args__ = (
        Index(f'ix_{__tablename__}_requested_at_desc', requested_at.desc()),
        Index(f'ix_{__tablename__}_provisioned_at_desc', provisioned_at.desc()),
        Index(f'ix_{__tablename__}_retired_at_desc', retired_at.desc()),

        Index(f'ix_{__tablename__}_month_ts_desc', month_ts.desc()),
        Index(f'ix_{__tablename__}_year_desc', year.desc()),
        Index(f'ix_{__tablename__}_year_month_desc', year_month.desc()),
    )

    async def check_existing(self) -> Optional[Provision]:
        return await Provision.get_by_uuid(self.uuid)

    @classmethod
    async def get_by_uuid(cls, provision_uuid: str) -> Optional[Provision]:
        async with db.get_session() as session:
            stmt = select(Provision)
            stmt = stmt.where(Provision.uuid == provision_uuid)
            stmt = stmt.options(
                joinedload(Provision.catalog_item),
                joinedload(Provision.purpose),
                joinedload(Provision.resource),
                joinedload(Provision.request),
                joinedload(Provision.user),
                joinedload(Provision.workshop),
                )
            result = await session.execute(stmt)
            return result.scalars().unique().one_or_none()

    @classmethod
    async def set_retirement(cls,
                             provision_uuid: str,
                             retired_at: datetime,
                             deletion_requested_at: datetime) -> Optional['Provision']:

        async with db.get_session() as session:
            provision = await Provision.get_by_uuid(provision_uuid)
            if provision:
                provision.retired_at = retired_at
                provision.deletion_requested_at = deletion_requested_at
                provision.lifetime_interval = retired_at - provision.provisioned_at
                provision.last_state = 'destroy-complete'

                if provision.request:
                    provision.request.retired_at = retired_at
                    provision.request.deletion_requested_at = deletion_requested_at

                if provision.workshop:
                    provision.workshop.retired_at = retired_at
                    provision.workshop.is_running = False

                session.add(provision)
                return provision

            return None
