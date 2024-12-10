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
from .provision_request import ProvisionRequest
from .provision import Provision
from .bookmark import Bookmark
from .database import Database as db

user_min_update_days = int(os.getenv('USER_UPDATE_MIN_DAYS', 30))


class User(CustomBase):
    __tablename__ = 'users'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, comment='Unique email')
    cost_center: Mapped[str] = mapped_column(Integer, nullable=True, index=True)
    employee_number: Mapped[int] = mapped_column(Integer, nullable=True, index=True)
    first_name: Mapped[str] = mapped_column(String)
    full_name: Mapped[str] = mapped_column(String, index=True)
    geo: Mapped[str] = mapped_column(String, nullable=True, index=True)
    is_manager: Mapped[bool] = mapped_column(Boolean, nullable=True, server_default=text("FALSE"))
    jobfamily: Mapped[str] = mapped_column(String, nullable=True, index=True)
    kerberos_id: Mapped[str] = mapped_column(String)
    last_name: Mapped[str] = mapped_column(String)
    rhat_job_title: Mapped[str] = mapped_column(String, nullable=True, index=True)
    role: Mapped[str] = mapped_column(String, nullable=True, index=True)
    supervisor_number: Mapped[int] = mapped_column(Integer, nullable=True, index=True)
    title: Mapped[str] = mapped_column(String, nullable=True)
    username: Mapped[str] = mapped_column(String, nullable=False, index=True)
    user_group: Mapped[str] = mapped_column(String, nullable=False, index=True)
    user_source: Mapped[str] = mapped_column(String, index=True)

    provisions: Mapped[List[Provision]] = relationship(Provision,
                                                       back_populates="user",
                                                       primaryjoin="User.id == Provision.user_id"
                                                       )
    provision_requests: Mapped[List[ProvisionRequest]] = relationship(ProvisionRequest,
                                                                      back_populates='user',
                                                                      foreign_keys=[ProvisionRequest.user_id]
                                                                      )
    bookmarks: Mapped[List[Bookmark]] = relationship(Bookmark, back_populates="user", lazy="joined")

    async def check_existing(self) -> Optional[User]:
        async with db.get_session() as session:
            stmt = select(User)
            stmt = stmt.where(or_(User.email == self.email,
                                  User.username == self.username
                                  )
                              )
            result = await session.execute(stmt)
            return result.scalars().first()

    @classmethod
    async def get_by_email(cls, email: str) -> Optional[User]:
        async with db.get_session() as session:
            stmt = select(User)
            stmt = stmt.where(User.email == email)
            stmt = stmt.order_by(desc(User.updated_at)).limit(1)

            result = await session.execute(stmt)
            return result.scalars().first()

    @classmethod
    async def get_by_email_or_username(cls, email_or_username: str) -> Optional[User]:
        async with db.get_session() as session:
            stmt = select(User)
            stmt = stmt.where(or_(User.email == email_or_username,
                                  User.username == email_or_username
                                  )
                              )
            stmt = stmt.order_by(desc(User.updated_at)).limit(1)

            result = await session.execute(stmt)
            return result.scalars().first()

    @classmethod
    async def get_by_email_or_username_last_updated(cls, email_or_username: str) -> Optional[User]:
        thirty_days_ago = datetime.now() - timedelta(days=user_min_update_days)
        async with db.get_session() as session:
            stmt = select(User)
            stmt = stmt.where(and_(or_(User.email == email_or_username,
                                       User.username == email_or_username
                                       ),
                                   User.updated_at > thirty_days_ago
                                   )
                              )
            stmt = stmt.order_by(desc(User.updated_at)).limit(1)

            result = await session.execute(stmt)
            return result.scalars().first()

    @classmethod
    async def get_by_employee_number(cls, employee_number: int) -> Optional[User]:
        async with db.get_session() as session:
            stmt = select(User)
            stmt = stmt.where(User.employee_number == employee_number)
            stmt = stmt.order_by(User.employee_number).limit(1)

            result = await session.execute(stmt)
            return result.scalars().first()

    @classmethod
    async def get_by_id(cls, student_id: int) -> Optional[User]:
        async with db.get_session() as session:
            stmt = select(User)
            stmt = stmt.where(User.id == student_id)
            stmt = stmt.limit(1)
            result = await session.execute(stmt)
            return result.scalars().first()

    @classmethod
    async def get_email_last_updated(cls, email: str) -> Optional[User]:
        thirty_days_ago = datetime.now() - timedelta(days=user_min_update_days)
        async with db.get_session() as session:
            stmt = select(User)
            stmt = stmt.where(and_(User.email == email,
                                   User.updated_at > thirty_days_ago
                                   )
                              )
            stmt = stmt.order_by(desc(User.updated_at)).limit(1)

            result = await session.execute(stmt)
            return result.scalars().first()

    @classmethod
    async def get_employee_last_updated(cls,
                                        employee_number: int
                                        ) -> Optional[User]:

        thirty_days_ago = datetime.now() - timedelta(days=user_min_update_days)
        async with db.get_session() as session:
            stmt = select(User)
            stmt = stmt.where(and_(User.employee_number == employee_number,
                                   User.updated_at > thirty_days_ago
                                   )
                              )
            stmt = stmt.order_by(desc(User.updated_at)).limit(1)

            result = await session.execute(stmt)
            return result.scalars().first()

    @classmethod
    async def get_username_last_updated(cls, username: str) -> Optional[User]:
        thirty_days_ago = datetime.now() - timedelta(days=user_min_update_days)
        async with db.get_session() as session:
            stmt = select(User)
            stmt = stmt.where(and_(User.username == username,
                                   User.updated_at > thirty_days_ago
                                   )
                              )
            stmt = stmt.order_by(desc(User.updated_at)).limit(1)
            result = await session.execute(stmt)
            return result.scalars().first()

    @classmethod
    async def has_provision_last_30_days(cls, email: str) -> bool:
        thirty_days_ago = datetime.now() - timedelta(days=user_min_update_days)
        async with db.get_session() as session:
            stmt = exists()
            stmt = stmt.where(
                and_(
                    or_(User.email == email, User.username == email),
                    User.id == Provision.user_id,
                    Provision.provisioned_at >= thirty_days_ago
                    )
                )
            stmt = stmt.select()

        result = await session.execute(stmt)
        return result.scalar()


users_update_fields_func = DDL("""
CREATE OR REPLACE FUNCTION users_update_fields()
RETURNS TRIGGER AS $$
DECLARE
    demo_cost_center INTEGER;
    system_users_email text[];
    supervisor_number INTEGER;
BEGIN
    SELECT (values ->> 'demo_cost_center')::INTEGER INTO demo_cost_center
    FROM reporting_config
    WHERE name = 'demo_cost_center';

    demo_cost_center := COALESCE(demo_cost_center, 542);

    SELECT (values ->> 'value')::TEXT[] INTO system_users_email
    FROM reporting_config
    WHERE name = 'system_users_email';

    SELECT (values ->> 'supervisor_number')::INTEGER INTO supervisor_number
    FROM reporting_config
    WHERE name = 'supervisor_number';

    IF NEW.email LIKE '%%redhat.com' THEN
        NEW.user_source := 'redhat';
    ELSIF NEW.email LIKE '%%ibm%%' THEN
        NEW.user_source := 'ibm';
        NEW.cost_center := 9999;
    ELSE
        NEW.user_source := 'partner';
        NEW.cost_center := 9999;
    END IF;

    IF NEW.cost_center = demo_cost_center OR NEW.email ILIKE ANY(system_users_email) THEN
        NEW.user_group := 'Only GPTE Exclusions';
        NEW.user_source := 'redhat';
        NEW.cost_center := demo_cost_center;
    ELSE
        NEW.user_group := 'Only Regular Users';
    END IF;

    IF NEW.email ILIKE ANY(system_users_email) THEN
        NEW.supervisor_number := supervisor_number;
        NEW.cost_center := demo_cost_center;
        NEW.employee_number := NULL;
    END IF;

    IF NEW.email = 'poolboy@opentlc.com' THEN
        NEW.user_group := 'Poolboy';
        NEW.cost_center := demo_cost_center;
        NEW.employee_number := NULL;
    END IF;

    if NEW.email = 'zerotouch@demo.redhat.com' THEN
        NEW.user_group := 'Zero Touch';
        NEW.cost_center := demo_cost_center;
        NEW.employee_number := NULL;
    END IF;

    NEW.kerberos_id := NEW.username;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
""")


event.listen(User.__table__, "after_create",
             users_update_fields_func.execute_if(dialect="postgresql"))

user_update_fields_trigger = DDL("""
CREATE TRIGGER user_update_fields_trigger
BEFORE INSERT OR UPDATE
ON users
FOR EACH ROW
EXECUTE FUNCTION users_update_fields();
""")

event.listen(User.__table__, "after_create",
             user_update_fields_trigger.execute_if(dialect="postgresql"))
