from __future__ import annotations
from typing import Optional, List
from datetime import datetime
from sqlalchemy import (
    Boolean,
    DateTime,
    Integer,
    String,
    and_,
    or_,
    text,
    select,
)
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
    relationship,
    selectinload,
)
from . import Database as db
from . import CustomBase
from .catalog_resource import Resource


class CatalogItem(CustomBase):
    __tablename__ = 'catalog_items'

    id = mapped_column(Integer, primary_key=True, autoincrement=True)
    asset_uuid: Mapped[str] = mapped_column(String, nullable=True, index=True, unique=True)
    binder: Mapped[bool] = mapped_column(Boolean, server_default=text("False"), index=True)
    category: Mapped[str] = mapped_column(String, nullable=True, index=True)
    display_name: Mapped[str] = mapped_column(String, index=True)
    multiuser: Mapped[bool] = mapped_column(Boolean, server_default=text("False"), index=True)
    name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    last_commit: Mapped[datetime] = mapped_column(DateTime, nullable=True, index=True)

    provisions: Mapped[List["Provision"]] = relationship("Provision",
                                                         back_populates="catalog_item")

    request: Mapped[List['ProvisionRequest']] = relationship("ProvisionRequest",
                                                             back_populates="catalog_item")

    resources: Mapped[List["Resource"]] = relationship("Resource",
                                                       back_populates="catalog_item",
                                                       cascade="all, delete")

    async def check_existing(self) -> Optional[CatalogItem]:
        if self.id is not None:
            return await self.get_by_id(self.id)
        elif self.asset_uuid is not None:
            return await self.get_by_asset_uuid(self.asset_uuid)

        return await self.get_by_name(self.name)

    @classmethod
    async def get_by_asset_uuid(cls, asset_uuid: str) -> Optional[CatalogItem]:
        async with db.get_session() as session:
            stmt = select(CatalogItem)
            stmt = stmt.where(CatalogItem.asset_uuid == asset_uuid)
            stmt = stmt.options(
                selectinload(CatalogItem.labels),
                selectinload(CatalogItem.resources),
                )
            stmt = stmt.limit(1)

            result = await session.execute(stmt)
            catalog_item = result.scalars().first()

        if catalog_item is not None and catalog_item.resources is not None:
            catalog_item.resources.sort(key=lambda r: r.resource_index)

        return catalog_item

    @classmethod
    async def get_by_id(cls, id: int) -> Optional[CatalogItem]:
        async with db.get_session() as session:
            stmt = select(CatalogItem)
            stmt = stmt.where(CatalogItem.id == id)
            stmt = stmt.options(
                selectinload(CatalogItem.labels),
                selectinload(CatalogItem.resources),
                )

            stmt = stmt.limit(1)

            result = await session.execute(stmt)
            catalog_item = result.scalars().first()

        if catalog_item is not None and catalog_item.resources is not None:
            catalog_item.resources.sort(key=lambda r: r.resource_index)

        return catalog_item

    @classmethod
    async def get_by_name(cls, name: str) -> Optional[CatalogItem]:
        async with db.get_session() as session:
            stmt = select(CatalogItem)
            stmt = stmt.where(CatalogItem.name == name)
            stmt = stmt.options(
                selectinload(CatalogItem.labels),
                selectinload(CatalogItem.resources),
                )
            stmt = stmt.limit(1)

            result = await session.execute(stmt)
            catalog_item = result.scalars().first()

        if catalog_item is not None and catalog_item.resources is not None:
            catalog_item.resources.sort(key=lambda r: r.resource_index)

        return catalog_item

    async def get_removed_resources(self,
                                    resources: List[dict]
                                    ) -> List[Resource]:

        resource_names = [resource_data["name"] for resource_data in resources]
        async with db.get_session() as session:
            stmt = select(Resource)
            stmt = stmt.where(
                and_(Resource.catalog_id == self.id,
                     Resource.active.is_(True),
                     Resource.resource_index != 0,
                     Resource.resource_name.in_(resource_names)
                     )
                )

            result = await session.execute(stmt)
            removed_resources = result.scalars().all()
            return removed_resources

    @classmethod
    async def get_by_asset_or_name(cls, asset_uuid: str) -> Optional[CatalogItem]:
        async with db.get_session() as session:
            stmt = select(CatalogItem)
            stmt = stmt.where(
                or_(CatalogItem.asset_uuid == asset_uuid, CatalogItem.name == asset_uuid)
                )
            stmt = stmt.options(
                selectinload(CatalogItem.labels),
                selectinload(CatalogItem.resources),
                )
            stmt = stmt.limit(1)

            result = await session.execute(stmt)
            catalog_item = result.scalars().first()

        if catalog_item is not None and catalog_item.resources is not None:
            catalog_item.resources.sort(key=lambda r: r.resource_index)

        return catalog_item
