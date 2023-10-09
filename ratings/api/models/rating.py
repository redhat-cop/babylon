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
)
from . import CustomBase, Database as db
from .provision_request import ProvisionRequest
from .catalog_item import CatalogItem

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
    rating: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    useful: Mapped[str] = mapped_column(String, nullable=True)
    month: Mapped[int] = mapped_column(SmallInteger, index=True)
    month_name: Mapped[str] = mapped_column(String, index=True)
    month_ts: Mapped[datetime] = mapped_column(DateTime, index=True)
    quarter: Mapped[int] = mapped_column(SmallInteger)
    year: Mapped[int] = mapped_column(SmallInteger, index=True)
    year_month: Mapped[str] = mapped_column(String, index=True)

    request = relationship('ProvisionRequest')

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
    async def get_ratings_paged(cls, page: int, per_page: int) -> dict:
        offset = (page - 1) * per_page

        async with db.get_session() as session:
            stmt = (
                select(Rating)
                .options(
                    selectinload(Rating.request).selectinload(ProvisionRequest.catalog_item),
                    selectinload(Rating.request).selectinload(ProvisionRequest.user),
                    selectinload(Rating.request).selectinload(ProvisionRequest.provisions),
                    selectinload(Rating.request).selectinload(ProvisionRequest.workshop),
                    selectinload(Rating.request).selectinload(ProvisionRequest.purpose)
                )
                .offset(offset)
                .limit(per_page)
            )

            result = await session.execute(stmt)
            ratings = result.scalars().all()
        
        return ratings

    @classmethod
    async def get_catalog_item_rating(cls,
                                      asset_uuid: str,
                                      ) -> Optional[Rating]:

        async with db.get_session() as session:
            stmt = (
                select(Rating)
                .join(Rating.request)
                .join(ProvisionRequest.catalog_item)
                .where(CatalogItem.asset_uuid == asset_uuid)
                .options(selectinload(Rating.request))
            )

            result = await session.execute(stmt)
            return result.scalars().all()

    @classmethod
    async def get_catalog_item_average(cls,
                                       asset_uuid: str,
                                       include_ratings: bool = False
                                       ) -> dict:
        async with db.get_session() as session:
            stmt = (
                select(
                    func.avg(Rating.rating).label('rating_score'),
                    func.count(Rating.id).label('total_ratings')
                )
                .join(Rating.request)
                .join(ProvisionRequest.catalog_item)
                .where(CatalogItem.asset_uuid == asset_uuid)
            )

            result = await session.execute(stmt)
            row = result.fetchone()

            response = {
                'rating_score': float(row[0]) if row[0] else None,
                'total_ratings': row[1]
            }

            if include_ratings:
                ratings = await cls.get_catalog_item_rating(asset_uuid)
                formatted_ratings = [rating.to_dict(True) for rating in ratings]
                response['ratings'] = formatted_ratings

            return response

    async def save_request_rating(self):
        existing = await self.get_rating_by_request(self.request_id)
        if existing:
            existing.rating = self.rating
            existing.comments = self.comments
            existing.useful = self.useful
            await existing.save()
        else:
            await self.save()

        return await self.get_rating_by_request(self.request_id)

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
    async def get_request_id(cls,
                             request_id: str,
                             ) -> Optional[Rating]:

        async with db.get_session() as session:
            stmt = select(Rating).where(Rating.request_id == request_id,)
            stmt = stmt.options(joinedload(Rating.request))
            result = await session.execute(stmt)
            return result.scalars().first()

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
