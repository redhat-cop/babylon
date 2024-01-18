from __future__ import annotations
from typing import List, Optional
from sqlalchemy import (
    Boolean,
    Column, 
    ForeignKey,
    Integer,
    UniqueConstraint,
    SmallInteger,
    String,
    select,
    text,
    and_,
)
from sqlalchemy.orm import (
    Mapped,
    joinedload,
    mapped_column,
    relationship,
)
from sqlalchemy.ext.asyncio import AsyncSession
from . import CustomBase
from .database import Database as db


class Resource(CustomBase):
    __tablename__ = 'catalog_resource'

    id = mapped_column(Integer, primary_key=True)
    catalog_id: Mapped[int] = mapped_column(Integer, ForeignKey('catalog_items.id'), nullable=False, index=True)
    active: Mapped[bool] = mapped_column(Boolean, index=True, default=True, server_default=text('TRUE'))
    display_name: Mapped[str] = mapped_column(String, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    namespace: Mapped[str] = mapped_column(String, index=True)
    provider: Mapped[str] = mapped_column(String, nullable=True, index=True, server_default=text('NULL'))
    resource_index: Mapped[int] = mapped_column(SmallInteger, nullable=False, index=True, server_default=text('0'))
    resource_name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    stage: Mapped[str] = mapped_column(String, nullable=True, index=True)

    __table_args__ = (
        UniqueConstraint(catalog_id, name, namespace, resource_index,
                         name='uq_resource_name_namespace_resource_index'),
    )

    catalog_item: Mapped[List["CatalogItem"]] = relationship("CatalogItem",
                                                             back_populates="resources",
                                                             cascade="all, delete")

    async def check_existing(self) -> Optional[Resource]:
        if self.id is not None:
            return await self.get_by_id(self.id)

        return await self.get_existing_resource(self.catalog_id,
                                                self.name,
                                                self.namespace,
                                                self.resource_index,
                                                self.stage,
                                                self.provider
                                                )

    @classmethod
    async def get_by_id(cls, resource_id: int) -> Optional[Resource]:
        async with db.get_session() as session:
            stmt = select(cls)
            stmt = stmt.where(cls.id == resource_id)
            stmt = stmt.options(joinedload(cls.catalog_item))
            stmt = stmt.limit(1)
            result = await session.execute(stmt)
            existing_resource = result.scalar_one_or_none()
            return existing_resource

    @classmethod
    async def get_all_resources(cls) -> List[Resource]:
        async with db.get_session() as session:
            stmt = select(cls)
            stmt = stmt.options(joinedload(cls.catalog_item))
            result = await session.execute(stmt)
            resources = result.scalars().all()
            return resources

    @classmethod
    async def get_existing_resource(cls,
                                    catalog_id: int,
                                    name: str,
                                    namespace: str,
                                    resource_index: int,
                                    stage: str,
                                    provider: Optional[str] = None
                                    ) -> Resource:

        async with db.get_session() as session:
            stmt = select(cls)
            stmt = stmt.where(
                and_(
                    cls.catalog_id == catalog_id,
                    cls.name == name,
                    cls.namespace == namespace,
                    cls.resource_index == resource_index,
                    cls.stage == stage,
                    cls.provider == provider
                    )
                )
            stmt = stmt.options(joinedload(cls.catalog_item))
            stmt = stmt.order_by(cls.updated_at.desc())

            result = await session.execute(stmt)
            existing_resource = result.scalar_one_or_none()
            return existing_resource

    @classmethod
    async def get_resource_by_provider(cls,
                                       name: str,
                                       provider: str,
                                       resource_index: int = 0
                                       ) -> Optional[Resource]:
        async with db.get_session() as session:
            stmt = select(cls)
            stmt = stmt.where(and_(cls.name == name,
                                   cls.provider == provider,
                                   cls.resource_index == resource_index,
                                   )
                              )
            stmt = stmt.options(joinedload(cls.catalog_item))
            stmt = stmt.order_by(cls.updated_at.desc()).limit(1)

            result = await session.execute(stmt)
            first_resource = result.scalar_one_or_none()
            return first_resource

    @classmethod
    async def get_by_provider_and_stage(cls,
                                        name,
                                        resource_name,
                                        resource_stage):

        async with db.get_session() as session:
            stmt = select(cls)
            stmt = stmt.where(and_(cls.name == name,
                                   cls.resource_name == resource_name,
                                   cls.stage == resource_stage)
                              ).limit(1)

            stmt = stmt.options(joinedload(cls.catalog_item))
            result = await session.execute(stmt)
            return result.scalar_one_or_none()

    @classmethod
    async def get_resource_name_namespace(cls,
                                          name: str,
                                          namespace: str,
                                          resource_index: int
                                          ) -> Optional[Resource]:

        async with db.get_session() as session:
            stmt = select(cls)
            stmt = stmt.where(and_(cls.name == name,
                                   cls.namespace == namespace,
                                   cls.resource_index == resource_index,
                                   )
                              )
            stmt = stmt.options(joinedload(cls.catalog_item))
            stmt = stmt.order_by(cls.updated_at.desc()).limit(1)

            result = await session.execute(stmt)
            first_resource = result.scalar_one_or_none()
            return first_resource

    @classmethod
    async def get_resource_name(cls,
                                name: str,
                                resource_index: int = 0
                                ) -> Optional[Resource]:

        async with db.get_session() as session:
            stmt = select(cls)
            stmt = stmt.options(joinedload(cls.catalog_item))
            stmt = stmt.where(and_(cls.name == name,
                                   cls.resource_index == resource_index,
                                   )
                              )
            stmt = stmt.options(joinedload(cls.catalog_item))
            stmt = stmt.order_by(cls.updated_at.desc()).limit(1)

            result = await session.execute(stmt)
            first_resource = result.scalar_one_or_none()
            return first_resource

    @classmethod
    async def get_by_catalog_resource_id(cls,
                                         catalog_id: int,
                                         resource_index: int,
                                         ) -> Optional[Resource]:

        async with db.get_session() as session:
            stmt = select(cls)
            stmt = stmt.where(
                and_(
                    cls.resource_index == resource_index,
                    cls.catalog_id == catalog_id
                    )
                )
            stmt = stmt.options(joinedload(cls.catalog_item))
            stmt = stmt.order_by(cls.updated_at.desc()).limit(1)

            result = await session.execute(stmt)
            first_resource = result.scalar_one_or_none()
            return first_resource
