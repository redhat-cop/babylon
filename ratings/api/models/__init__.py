import asyncio
import os

from .custom_base import Base, CustomBase, CustomBaseMinimal, CustomBaseUuid, CustomBaseProvisionUuid, create_tables
from .database import Database
from .reporting_config import ReportingConfig
from .catalog_item import CatalogItem
from .catalog_resource import Resource
from .user import User
from .workshop import Workshop
from .workshop_assignment import WorkshopAssignment
from .purpose import Purpose
from .provision_request import ProvisionRequest
from .provision import Provision
from .rating import Rating
from .bookmark import Bookmark


async def startup():
    """
    This method initilize the database connection, few environment
    variables are required to work properly
    DB_USERNAME
    DB_PASSWORD
    DB_NAME
    DB_HOSTNAME
    DB_PORT
    """

    # Define a list with the environment variables you need to check
    required_env_vars = ["DB_USERNAME",
                         "DB_PASSWORD", "DB_NAME", "DB_HOSTNAME"]

    # Check if all environment variables exist
    for var in required_env_vars:
        value = os.getenv(var)
        if value is None:
            # If the variable doesn't exist, print an error message
            print(f"Error: environment variable {var} is not defined.")
            return

    await Database.initialize()
