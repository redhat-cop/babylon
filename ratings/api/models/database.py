import asyncio
import logging
import os
from contextlib import asynccontextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

os.environ["TZ"] = "UTC"
logger = logging.getLogger()


class Database:
    lock = asyncio.Lock()
    tables_created = False

    @classmethod
    @asynccontextmanager
    async def get_session(cls) -> AsyncSession:
        await cls.wait_for_pool()

        session = cls.async_session()
        try:
            yield session
            await session.commit()
        except Exception as e:
            await session.rollback()
            raise e
        finally:
            await session.close()

    @classmethod
    async def get_async_session(cls) -> AsyncSession:
        return cls.async_session()

    @classmethod
    def get_session_sync(cls):
        engine = create_engine(cls.db_url)
        session_factory = sessionmaker(bind=engine)
        return session_factory()

    @classmethod
    async def initialize(cls):
        cls.pool_recycle = int(os.getenv("DB_POOL_RECYCLE", 300))
        cls.db_pool_size = int(os.getenv("DB_POOL_SIZE", 2))
        cls.db_idle_timeout_ms = os.getenv("DB_IDLE_TIMEOUT_MS", "30000")
        cls.db_max_overflow = int(os.getenv("DB_MAX_OVERFLOW", 30))
        cls.pool_timeout = int(os.getenv("DB_POOL_TIMEOUT", 45))
        cls.db_hostname = os.getenv("DB_HOSTNAME")
        cls.db_port = int(os.getenv("DB_PORT", 54327))
        cls.db_username = os.getenv("DB_USERNAME")
        cls.db_password = os.getenv("DB_PASSWORD")
        cls.db_name = os.getenv("DB_NAME")
        cls.db_url = f"postgresql+asyncpg://{cls.db_username}:{cls.db_password}@{cls.db_hostname}:{cls.db_port}/{cls.db_name}"
        cls.sync_db_url = f"postgresql://{cls.db_username}:{cls.db_password}@{cls.db_hostname}:{cls.db_port}/{cls.db_name}"

        try:
            cls.sync_engine = create_engine(
                cls.sync_db_url,
                echo=False,
                future=True,
                pool_use_lifo=True,
                connect_args={
                    "application_name": cls.app_name(),
                    "options": f"-c idle_session_timeout={cls.db_idle_timeout_ms}",
                },
            )

            # Create a new engine with QueuePool to use the reconnect method
            cls.async_engine = create_async_engine(
                cls.db_url,
                max_overflow=cls.db_max_overflow,
                pool_pre_ping=True,
                pool_recycle=cls.pool_recycle,
                pool_size=cls.db_pool_size,
                pool_timeout=cls.pool_timeout,
                pool_use_lifo=True,
                echo=False,
                connect_args={
                    "command_timeout": 60,
                    "server_settings": {
                        "application_name": cls.app_name(),
                        "idle_session_timeout": str(cls.db_idle_timeout_ms),
                    },
                },
            )
            # Configure the session to use the new engine and pool
            cls.async_session = sessionmaker(
                cls.async_engine, expire_on_commit=False, class_=AsyncSession
            )

            try:
                async with cls.get_session() as session:
                    await session.execute(text("SELECT 1"))
            except Exception as ex:
                raise ValueError(f"Database connection failed: {ex}")

        except SQLAlchemyError as ex:
            logger.error(
                f"Error occurred while initializing the database: {ex}",
                exc_info=True,
                stack_info=True,
            )
            raise ValueError(f"Failed to initialize database: {ex}")

    @classmethod
    async def shutdown(cls):
        logger.info("Closing database connection")
        try:
            async with cls.async_engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
        except Exception as e:
            raise ValueError(f"Connection to the database failed: {str(e)}")
        finally:
            await cls.async_engine.dispose()

    @classmethod
    async def is_pool_full(cls) -> bool:
        pool_size = cls.async_engine.pool.size() + cls.db_max_overflow
        # logger.info(f"Current pool usage: {cls.async_engine.pool.checkedout()}")
        return cls.async_engine.pool.checkedout() >= pool_size

    @classmethod
    async def wait_for_pool(cls):
        while await cls.is_pool_full():
            await asyncio.sleep(2)

    @classmethod
    def app_name(cls) -> str:
        """
        Application name for Postgres connections (max 60 chars).
        Format: {app_type}-{cluster}-{pod_name}
        Example: us-east-1-ratings-api-7fc94dd95d-knw7k
        """
        cluster_domain = os.getenv("CLUSTER_DOMAIN", "babydev.dev.open.redhat.com")
        cluster_name = cluster_domain.split(".")[0]

        # Get pod name if running in Kubernetes
        pod_name = os.environ.get("HOSTNAME", "unknown")

        # Build the identifier
        identifier = f"{cluster_name}-ratings-api-{pod_name}"

        # Ensure it fits within Postgres' 60 char limit
        return f"{identifier}"[:60]
