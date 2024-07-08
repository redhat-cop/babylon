from __future__ import annotations
from typing import Optional, List
from sqlalchemy import (
    Column,
    CheckConstraint,
    Integer,
    String,
    Text,
    select,
    and_
)
from .. import CustomBase, Database as db


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
    interface = Column(String)
    message = Column(Text)

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
    async def get_incidents_by_status(cls, status: str, interface: str) -> Optional[List[Incident]]:
        async with db.get_session() as session:
            stmt = select(Incident)
            if status != "all":
                stmt = stmt.where(and_(Incident.status == status, Incident.interface == interface))
            stmt = stmt.order_by(Incident.updated_at)
            result = await session.execute(stmt)
            return result.scalars().all()

    @classmethod
    async def get_incident_by_id(cls, incident_id: int) -> Optional[Incident]:
        async with db.get_session() as session:
            stmt = select(Incident).where(Incident.id == incident_id)
            result = await session.execute(stmt)
            return result.scalars().first()
