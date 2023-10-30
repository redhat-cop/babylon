from __future__ import annotations
from typing import Optional, List
from sqlalchemy.orm import relationship
from sqlalchemy import (
    Column,
    CheckConstraint,
    DateTime,
    Integer,
    String,
    Text,
    select,
    text,
    and_
)
from .. import Base, CustomBase, Database as db


class Incident(CustomBase):
    __tablename__ = 'incidents'
    __table_args__ = (
        CheckConstraint("(incident_type)::text = 'general'::text"),
        CheckConstraint("(level)::text = ANY (ARRAY[('critical'::character varying)::text, ('info'::character varying)::text, ('warning'::character varying)::text])"),
        CheckConstraint("(status)::text = ANY (ARRAY[('active'::character varying)::text, ('resolved'::character varying)::text])"),
        {'schema': 'babylon_admin'}
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    status = Column(String, nullable=False, index=True)
    incident_type = Column(String)
    level = Column(String)
    message = Column(Text)
    created_at = Column(DateTime(True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(True), nullable=False, server_default=text("now()"))

    async def check_existing(self) -> Optional[Incident]:
        async with db.get_session() as session:
            stmt = select(Incident)
            if self.id:
                stmt = stmt.where(Incident.id == self.id)
            else:
                stmt = stmt.where(and_(Incident.status == self.status,
                                       Incident.incident_type == self.incident_type,
                                       Incident.level == self.level,
                                       Incident.message == self.message
                                       )
                                  )
            result = await session.execute(stmt)
            return result.scalars().first()

    @classmethod
    async def get_incidents_by_status(cls, status: str) -> Optional[List[Incident]]:
        async with db.get_session() as session:
            stmt = select(Incident)
            if status != "all":
                stmt = stmt.where(Incident.status == status)
            stmt = stmt.order_by(Incident.updated_at)
            result = await session.execute(stmt)
            return result.scalars().all()

    @classmethod
    async def get_incident_by_id(cls, incident_id: int) -> Optional[Incident]:
        async with db.get_session() as session:
            stmt = select(Incident).where(Incident.id == incident_id)
            result = await session.execute(stmt)
            return result.scalars().first()
