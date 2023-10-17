from __future__ import annotations
from typing import Optional, List
import os
import json
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy import (
    Column,
    Integer,
    String,
    event,
    select
)
from . import CustomBase
from .database import Database as db


class ReportingConfig(CustomBase):
    __tablename__ = 'reporting_config'

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, unique=True, index=True, nullable=False)
    values = Column(JSONB, nullable=False, index=True)

    @classmethod
    async def get(cls, name: str) -> Optional[ReportingConfig]:
        async with db.get_session() as session:
            stmt = select(cls).where(cls.name == name)
            result = await session.execute(stmt)
            return result.scalars().one_or_none()

    @classmethod
    async def get_all(cls) -> List[ReportingConfig]:
        async with db.get_session() as session:
            stmt = select(cls)
            result = await session.execute(stmt)
            return result.scalars().all()


def insert_reporting_config(target, connection, **kw):
    session = sessionmaker(bind=connection)()
    # TODO: Create another way to get the default configs
    try:
        default_configs = {
            'cache_ttl': int(os.getenv('CACHE_TTL', 86400)),
            'demo_cost_center': int(os.getenv('RHDP_COST_CENTER', 542)),
            'internal': json.loads(os.getenv('INTERNAL', '{}')),
            'opentlc': json.loads(os.getenv('OPENTLC', '{}')),
            'position_attributes': json.loads(os.getenv('POSITION_ATTRIBUTES', '{}')),
            'supervisor_number': int(os.getenv('RHDP_SUPERVISOR_NUMBER', 135616)),
            'system_user_details': json.loads(os.getenv('SYSTEM_USER_DETAIL', '{}')),
            'system_user_email': os.getenv('SYSTEM_USER_EMAIL', '').split(','),
            'user_update_min_days': int(os.getenv('RHDP_USER_UPDATE_MIN_DAYS', 30)),
            'worker_attributes': json.loads(os.getenv('WORKER_ATTRIBUTES', '{}')),
            'workday_url': os.getenv('WORKDAY_URL', 'https://worker.api.redhat.com'),
        }
        for key, value in default_configs.items():
            new_config = ReportingConfig(name=key, values={key: value})
            session.add(new_config)
            session.commit()
    finally:
        session.close()


event.listen(ReportingConfig.__table__, 'after_create', insert_reporting_config)
