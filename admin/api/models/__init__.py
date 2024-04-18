import asyncio
import os

from .custom_base import Base, CustomBase, CustomBaseUuid, CustomBaseProvisionUuid, create_tables
from .database import Database
from .babylon_admin import Incident


async def startup():
    """
    This method initilize the database connection, few environment
    variables are required to work properly
    DB_USERNAME
    DB_PASSWORD
    DB_NAME
    DB_HOSTNAME
    DB_PORT
    SERVICENOW_AUTH_KEY
    SERVICENOW_FORM_ID
    """

    # Define a list with the environment variables you need to check
    required_env_vars = ["DB_USERNAME", "DB_PASSWORD", "DB_NAME", "DB_HOSTNAME", "SERVICENOW_AUTH_KEY", "SERVICENOW_FORM_ID"]

    # Check if all environment variables exist
    for var in required_env_vars:
        value = os.getenv(var)
        if value is None:
            # If the variable doesn't exist, print an error message
            print(f"Error: environment variable {var} is not defined.")
            return

    await Database.initialize()
