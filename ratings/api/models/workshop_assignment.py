from __future__ import annotations
from typing import Optional, List
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
    relationship
)
from sqlalchemy import (
    Boolean,
    Integer,
    String,
    DateTime,
    ForeignKey,
    update,
    select,
    and_,
    text,
)
from . import CustomBase, Database as db


class WorkshopAssignment(CustomBase):
    __tablename__ = 'workshop_assignment'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    workshop_id: Mapped[str] = mapped_column(ForeignKey('workshop.id'), index=True)
    assignment_date: Mapped[datetime] = mapped_column(DateTime, server_default=text("(now() at time zone 'utc')"))
    email: Mapped[str] = mapped_column(String, index=True, nullable=False)
    guid: Mapped[str] = mapped_column(String, nullable=True)
    resource_username: Mapped[str] = mapped_column(String, nullable=True)
    resource_claim_name: Mapped[str] = mapped_column(String, index=True)
    active: Mapped[bool] = mapped_column(Boolean, server_default=text("TRUE"))
    deleted_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    assignment_json = mapped_column(JSONB)

    workshop: Mapped['Workshop'] = relationship("Workshop", back_populates="assignments")

    async def check_existing(self) -> Optional[WorkshopAssignment]:
        return await WorkshopAssignment.get_user_assignments(self.workshop_id, self.email)

    @classmethod
    async def get_workshop_assignments(cls,
                                       workshop_id: int,
                                       ) -> List[WorkshopAssignment]:
        async with db.get_session() as session:
            stmt = select(WorkshopAssignment)
            stmt = stmt.where(
                and_(
                    WorkshopAssignment.workshop_id == workshop_id,
                    WorkshopAssignment.active == True)
                )
            result = await session.execute(stmt)
            assignments = result.fetchall()
            workshop_assignments = [assignment for assignment, in assignments]
            return workshop_assignments

    @classmethod
    async def get_user_assignments(cls,
                                   workshop_id: str,
                                   email: str
                                   ) -> Optional[WorkshopAssignment]:
        async with db.get_session() as session:
            stmt = select(WorkshopAssignment)
            stmt = stmt.where(
                and_(
                    WorkshopAssignment.email == email,
                    WorkshopAssignment.workshop_id == workshop_id,
                    WorkshopAssignment.active == True
                    )
                )
            result = await session.execute(stmt)
            return result.scalars().first()

    async def delete_user_assignment(self) -> None:
        async with db.get_session() as session:
            stmt = (
                update(WorkshopAssignment)
                .where(
                    and_(
                        WorkshopAssignment.workshop_id == self.workshop_id,
                        WorkshopAssignment.email == self.email
                    )
                )
                .values(active=False, deleted_at=datetime.now())
            )
            await session.execute(stmt)
