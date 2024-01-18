from __future__ import annotations
from typing import Optional, List
from datetime import datetime
from sqlalchemy.orm import (
    Mapped,
    relationship,
    mapped_column,
    joinedload,
    selectinload,
    DeclarativeMeta,
    aliased
)
from sqlalchemy import (
    DateTime,
    DDL,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    event,
    func,
    text,
    select,
    or_,
)
from . import CustomBase, Database as db
from .provision_request import ProvisionRequest
from .catalog_item import CatalogItem
from .provision import Provision


class Rating(CustomBase):
    __tablename__ = 'ratings'
    __date_field__ = 'created_at'

    id = mapped_column(Integer, primary_key=True,
                       nullable=False,
                       autoincrement=True)
    request_id: Mapped[str] = mapped_column(ForeignKey('provision_request.id',
                                                       ondelete='CASCADE'),
                                            nullable=True,
                                            index=True)
    provision_uuid: Mapped[str] = mapped_column(ForeignKey('provisions.uuid',
                                                           ondelete='CASCADE'),
                                                nullable=True,
                                                index=True)
    catalog_item_id: Mapped[int] = mapped_column(ForeignKey('catalog_items.id',
                                                            ondelete='CASCADE'),
                                                 nullable=True,
                                                 index=True)
    email: Mapped[str] = mapped_column(String, nullable=True, index=True)
    rating: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    useful: Mapped[str] = mapped_column(String, nullable=True)
    month: Mapped[int] = mapped_column(SmallInteger, index=True)
    month_name: Mapped[str] = mapped_column(String, index=True)
    month_ts: Mapped[datetime] = mapped_column(DateTime, index=True)
    quarter: Mapped[int] = mapped_column(SmallInteger)
    year: Mapped[int] = mapped_column(SmallInteger, index=True)
    year_month: Mapped[str] = mapped_column(String, index=True)

    request = relationship('ProvisionRequest')
    provision = relationship('Provision')
    catalog_item = relationship('CatalogItem')

    def to_dict(self, include_relationships=False):
        data = {c.name: getattr(self, c.name) for c in self.__table__.columns}
        if include_relationships:
            for relation in self.__mapper__.relationships:
                if relation.key in self.__dict__:
                    value = getattr(self, relation.key)
                    if value is None:
                        data[relation.key] = None
                    elif isinstance(value.__class__, DeclarativeMeta):
                        # If it's a nested relationship and the related object has a to_dict method, use it.
                        if hasattr(value, 'to_dict'):
                            data[relation.key] = value.to_dict(include_relationships=True)
                        else:
                            data[relation.key] = value
                    else:
                        # It's a list of objects
                        if hasattr(value, 'to_dict'):
                            data[relation.key] = value.to_dict()
                        else:
                            data[relation.key] = [item.to_dict(include_relationships=True) for item in value if hasattr(item, 'to_dict')]

        return data

    @classmethod
    async def get_total_count(cls) -> int:
        async with db.get_session() as session:
            result = await session.execute(select(func.count(Rating.id)))
            return result.scalar()

    @classmethod
    async def list_ratings_paged(cls, page: int,
                                 per_page: int,
                                 include_details: bool = False
                                 ) -> List[Rating]:
        offset = (page - 1) * per_page

        async with db.get_session() as session:
            stmt = select(Rating)

            if include_details:
                stmt = stmt.options(
                    selectinload(Rating.provision).selectinload(Provision.catalog_item),
                    selectinload(Rating.provision).selectinload(Provision.purpose),
                    selectinload(Rating.provision).selectinload(Provision.user),
                    selectinload(Rating.request).selectinload(ProvisionRequest.catalog_item),
                    selectinload(Rating.request).selectinload(ProvisionRequest.user),
                    selectinload(Rating.request).selectinload(ProvisionRequest.provisions),
                    selectinload(Rating.request).selectinload(ProvisionRequest.workshop),
                    selectinload(Rating.request).selectinload(ProvisionRequest.purpose)
                )

            stmt = stmt.offset(offset).limit(per_page)
            cls.debug_query(stmt)
            result = await session.execute(stmt)
            ratings = result.scalars().all()

        return ratings

    @classmethod
    async def catalog_item_rating(cls,
                                  asset_uuid: str,
                                  catalog_name: str = None,
                                  include_details: bool = False
                                  ) -> Optional[Rating]:

        async with db.get_session() as session:
            stmt = select(Rating)

            stmt = stmt.options(
                selectinload(Rating.request),
                selectinload(Rating.provision).selectinload(Provision.purpose),
                selectinload(Rating.catalog_item)
            )

            conditions = []

            if asset_uuid:
                stmt = stmt.outerjoin(ProvisionRequest, ProvisionRequest.id == Rating.request_id)\
                        .outerjoin(CatalogItem, ProvisionRequest.catalog_id == CatalogItem.id)
                conditions.append(CatalogItem.asset_uuid == asset_uuid)

            # Using catalog_name to filter
            if catalog_name:
                catalog_alias = aliased(CatalogItem)
                stmt = stmt.outerjoin(catalog_alias, Rating.catalog_item_id == catalog_alias.id)
                stmt = stmt.outerjoin(Provision, Rating.provision_uuid == Provision.uuid)
                conditions.append(catalog_alias.name == catalog_name)

            stmt = stmt.where(or_(*conditions))

            result = await session.execute(stmt)

            return result.scalars().all()

    @classmethod
    async def catalog_item_average(cls,
                                   asset_uuid: str,
                                   catalog_name: str = None,
                                   include_details: bool = False
                                   ) -> dict:
        async with db.get_session() as session:
            stmt = select(
                func.avg(Rating.rating / 10).label('rating_score'),
                func.count(Rating.id).label('total_ratings')
            )

            conditions = []

            if asset_uuid:
                condition_asset_uuid = (
                    CatalogItem.asset_uuid == asset_uuid
                )
                conditions.append(condition_asset_uuid)
                stmt = (stmt.outerjoin(ProvisionRequest, ProvisionRequest.id == Rating.request_id)
                        .outerjoin(CatalogItem, ProvisionRequest.catalog_id == CatalogItem.id))

            if catalog_name:
                catalog_alias = aliased(CatalogItem)
                condition_catalog_name = (
                    catalog_alias.name == catalog_name
                )
                conditions.append(condition_catalog_name)
                stmt = stmt.outerjoin(catalog_alias, Rating.catalog_item_id == catalog_alias.id)

            if conditions:
                stmt = stmt.where(or_(*conditions))

            result = await session.execute(stmt)
            row = result.fetchone()

            response = {
                'rating_score': float(row[0]) if row[0] else None,
                'total_ratings': row[1]
            }

            if include_details:
                ratings = await cls.get_catalog_item_rating(asset_uuid, catalog_name)
                print(ratings)
                formatted_ratings = [rating.to_dict(True) for rating in ratings]
                response['ratings'] = formatted_ratings

            return response

    async def save_request_rating(self):
        existing = await self.get_request_rating_by_email(self.request_id,
                                                          self.email)
        if existing:
            existing.rating = self.rating
            existing.comments = self.comments
            existing.useful = self.useful
            await existing.save()
        else:
            await self.save()

        return await self.get_request_rating_by_email(self.request_id, self.email)

    async def save_provision_rating(self):
        existing = await self.get_provision_rating_by_email(self.provision_uuid,
                                                            self.email)
        if existing:
            existing.catalog_item_id = existing.provision.catalog_id
            existing.rating = self.rating
            existing.comments = self.comments
            existing.useful = self.useful
            await existing.save()
        else:
            provision = await Provision.get_by_uuid(self.provision_uuid)
            if provision:
                self.catalog_item_id = provision.catalog_id
            await self.save()

        return await self.get_provision_rating_by_email(self.provision_uuid, self.email)

    @classmethod
    async def get_rating_by_request(cls,
                                    request_id: str,
                                    ) -> Optional[Rating]:

        async with db.get_session() as session:
            stmt = select(Rating).where(Rating.request_id == request_id,)
            stmt = stmt.options(joinedload(Rating.request))
            result = await session.execute(stmt)
            return result.scalars().first()

    @classmethod
    async def get_request_rating_by_email(cls,
                                          request_id: str,
                                          email: str
                                          ) -> Optional[Rating]:

        async with db.get_session() as session:
            stmt = select(Rating).where(Rating.request_id == request_id,
                                        Rating.email == email)
            stmt = stmt.options(
                    selectinload(Rating.request).selectinload(ProvisionRequest.catalog_item),
                    selectinload(Rating.request).selectinload(ProvisionRequest.user),
                    selectinload(Rating.request).selectinload(ProvisionRequest.provisions),
                    selectinload(Rating.request).selectinload(ProvisionRequest.workshop),
                    selectinload(Rating.request).selectinload(ProvisionRequest.purpose)
                    )

            # stmt = stmt.options(joinedload(Rating.request))
            result = await session.execute(stmt)
            return result.scalars().first()

    @classmethod
    async def get_provision_rating_by_email(cls,
                                            provision_uuid: str,
                                            email: str
                                            ) -> Optional[Rating]:

        async with db.get_session() as session:
            stmt = select(Rating).where(Rating.provision_uuid == provision_uuid,
                                        Rating.email == email)
            stmt = stmt.options(
                    selectinload(Rating.provision).selectinload(Provision.catalog_item),
                    selectinload(Rating.provision).selectinload(Provision.user),
                    selectinload(Rating.provision).selectinload(Provision.workshop),
                    selectinload(Rating.provision).selectinload(Provision.purpose)
                    )

            result = await session.execute(stmt)
            return result.scalars().first()

    @classmethod
    async def get_request_id(cls,
                             request_id: str,
                             ) -> Optional[Rating]:

        async with db.get_session() as session:
            stmt = select(Rating).where(Rating.request_id == request_id,)
            stmt = stmt.options(selectinload(Rating.request))
            result = await session.execute(stmt)
            return result.scalars().all()

    @classmethod
    def create_update_dates_trigger(cls):
        update_dates_trigger = DDL(f"""
                                   CREATE OR REPLACE TRIGGER {cls.__tablename__}_update_date
                                   BEFORE INSERT OR UPDATE
                                   ON {cls.__tablename__}
                                   FOR EACH ROW
                                   EXECUTE PROCEDURE update_date_fields('{cls.__date_field__}');
                                   """)

        return update_dates_trigger


event.listen(Rating.__table__, "after_create",
             Rating.create_update_dates_trigger().execute_if(dialect="postgresql"))
