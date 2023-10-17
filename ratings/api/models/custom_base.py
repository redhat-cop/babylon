from typing import Optional
from datetime import datetime
import asyncio
import logging
import re
from sqlalchemy.exc import ProgrammingError
from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Integer,
    String,
    inspect,
    text,
    event
)
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.dialects.postgresql import dialect
from sqlalchemy.orm import (
    DeclarativeBase,
    DeclarativeMeta,
    Session,
)
from dateutil.parser import parse
from .database import Database as db

logger = logging.getLogger()
lock = asyncio.Lock()


class Base(DeclarativeBase):
    async def check_existing(self) -> Optional['Base']:
        pass

    async def save(self) -> Optional['Base']:
        existing = await self.check_existing()
        async with db.get_session() as session:
            if existing:
                for key, value in vars(self).items():
                    if key and str(key).startswith('_sa_instance_state'):
                        continue
                    if value is not None and hasattr(existing, key):
                        setattr(existing, key, value)
                existing.updated_at = datetime.now()
                resource = await session.merge(existing)
            else:
                resource = self
                session.add(resource)

            await session.commit()
            await session.refresh(resource)
            return resource

    @staticmethod
    def format_sql(sql):
        keywords = ['SELECT', 'LEFT JOIN',
                    'LEFT OUTER JOIN',
                    'INNER JOIN', 'ORDER BY',
                    'GROUP BY']

        pattern = '|'.join(keywords)
        formatted_sql = re.sub(pattern, lambda match: '\n' + match.group(0), sql)
        return formatted_sql

    @staticmethod
    def debug_query(stmt):
        sql_query = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        formatted_sql = Base.format_sql(sql_query)
        print(formatted_sql)

    @classmethod
    def from_dict(cls, data):
        instance = cls()

        mapper = inspect(cls)

        for column in mapper.columns:
            column_name = column.key
            if column_name in data:
                value = data[column_name]
                if value is None:
                    setattr(instance, column_name, None)
                elif isinstance(column.type, Integer) and not isinstance(value, int):
                    value = int(value)
                elif isinstance(column.type, String) and not isinstance(value, str):
                    value = str(value)
                elif isinstance(column.type, Date) and isinstance(value, str):
                    value = parse(value).date()
                elif isinstance(column.type, DateTime) and isinstance(value, str):
                    value = parse(value).replace(tzinfo=None)
                setattr(instance, column_name, value)
                flag_modified(instance, column_name)

        return instance

    def has_data(self):
        for key, value in vars(self).items():
            if value is not None and not key.startswith('_'):
                return True
        return False

    def __repr__(self):
        attribute_strings = [f"{key}={value!r}" for key, value in vars(self).items() if not key.startswith('_')]
        return f"<{self.__class__.__name__}({', '.join(attribute_strings)})>"

    def to_dict(self, include_relationships=False):
        data = {c.name: getattr(self, c.name) for c in self.__table__.columns}

        if include_relationships:
            for relation in self.__mapper__.relationships:
                if relation.key in self.__dict__:
                    value = getattr(self, relation.key)
                    if value is None:
                        data[relation.key] = None
                    elif isinstance(value.__class__, DeclarativeMeta):
                        data[relation.key] = value.to_dict()
                    else:
                        # Check if it's a single object or a list of objects
                        if hasattr(value, 'to_dict'):
                            data[relation.key] = value.to_dict()
                        else:
                            data[relation.key] = [item.to_dict() for item in value]

        return data


class CustomBase(Base):
    __abstract__ = True
    __date_field__ = None

    id = Column(Integer, primary_key=True)
    comments = Column(String)
    created_at = Column(DateTime, server_default=text("(NOW() at time zone 'utc')"), index=True)
    updated_at = Column(DateTime, index=True)


class CustomBaseUuid(Base):
    __abstract__ = True

    uuid = Column(String, primary_key=True)
    comments = Column(String)
    created_at = Column(DateTime, server_default=text("(now() at time zone 'utc')"), index=True)
    updated_at = Column(DateTime, index=True)


class CustomBaseProvisionUuid(Base):
    __abstract__ = True

    provision_uuid = Column(String, primary_key=True)
    comments = Column(String)
    created_at = Column(DateTime, server_default=text("(now() at time zone 'utc')"))
    updated_at = Column(DateTime)


def create_triggers(session: Session, table):
    
    function_name = 'update_updated_at_func'
    trigger_name = f"{table.name}_updated_at_trigger"
    trigger_sql = text(f"""
        CREATE OR REPLACE TRIGGER {trigger_name}
        BEFORE INSERT OR UPDATE
        ON {table.fullname}
        FOR EACH ROW
        EXECUTE PROCEDURE {function_name}();
    """)
    session.execute(trigger_sql)
    session.commit()
    session.execute(text(f"ALTER TABLE {table.fullname} ENABLE TRIGGER {trigger_name}"))
    session.commit()


@event.listens_for(CustomBase.metadata, 'before_create')
@event.listens_for(CustomBaseUuid.metadata, 'before_create')
@event.listens_for(CustomBaseProvisionUuid.metadata, 'before_create')
def create_common_functions(target, connection, **kwargs):
    session = Session(bind=connection)
    function_name = 'update_updated_at_func'
    function_sql = text(f"""
        CREATE OR REPLACE FUNCTION {function_name}()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at := (now() at time zone 'utc');
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    session.execute(function_sql)
    session.commit()

    update_dates_func_stmt = text("""
        CREATE OR REPLACE FUNCTION update_date_fields()
        RETURNS TRIGGER AS $$
        DECLARE
            _col_value text;
            _col_name  text := quote_ident(TG_ARGV[0]);
        BEGIN
            EXECUTE format('SELECT ($1).%s::text', _col_name)
            USING NEW
            INTO  _col_value;

            IF _col_value IS NOT NULL THEN
                NEW.month := EXTRACT(MONTH FROM _col_value::timestamp);
                NEW.month_name := TRIM(TO_CHAR(_col_value::timestamp, 'Month'));
                NEW.month_ts := DATE_TRUNC('month', _col_value::timestamp);
                NEW.quarter := (EXTRACT(MONTH FROM _col_value::timestamp) - 1) / 3 + 1;
                NEW.year := EXTRACT(YEAR FROM _col_value::timestamp);
                NEW.year_month := LPAD(NEW.month::text, 2, '0') || '/' || NEW.year;
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """)
    session.execute(update_dates_func_stmt)
    session.commit()


@event.listens_for(CustomBase.metadata, 'after_create')
@event.listens_for(CustomBaseUuid.metadata, 'after_create')
@event.listens_for(CustomBaseProvisionUuid.metadata, 'after_create')
def create_triggers_after_create(target, connection, **kwargs):
    session = Session(bind=connection)
    for table in target.sorted_tables:
        if hasattr(table.c, 'updated_at'):
            create_triggers(session, table)


async def create_tables():
    # create all tables
    logger.info("Checking and creating database tables")
    async with lock:
        async with db.async_engine.begin() as conn:
            try:
                await conn.run_sync(Base.metadata.create_all, checkfirst=True)
            except ProgrammingError as e:
                if "cannot drop columns from view" in str(e):
                    logger.warning(f"Ignored error while creating tables: {e}")
                    pass
                else:
                    raise
