import logging
import aiohttp

from datetime import datetime
from rating import Rating
from babylon import Babylon
from utils import execute_query

GET_CATALOG_ITEM_LAST_SUCCESSFUL_PROVISION = """SELECT to_char(provisions.provisioned_at, 'YYYY-MM-DD"T"HH24:MI:SS"') AS last_successful_provision
        FROM catalog_items
            JOIN provisions 
            ON catalog_items.id = provisions.catalog_id
        WHERE catalog_items.asset_uuid=(%s)
        AND provision_result = 'success'
        ORDER BY provisions.provisioned_at DESC
        LIMIT 1;"""

GET_CATALOG_ITEM_STATUS_PERIODS = """SELECT status_periods.status, status_periods.created_at
        FROM status_periods
            JOIN catalog_items 
            ON catalog_items.id = status_periods.catalog_item_id
        WHERE catalog_items.asset_uuid=(%s);"""

CREATE_CATALOG_ITEM_STATUS_PERIODS = """INSERT INTO status_periods (catalog_item_id, status, ops_annotation)
        SELECT catalog_items.id, (%s), (%s) FROM catalog_items WHERE catalog_items.asset_uuid=(%s);"""

class ProvisionData:
    def __init__(self, last_successful_provision):
        self.last_successful_provision = last_successful_provision


class CatalogItemService:
    def __init__(self, catalog_item, logger):
        self.catalog_item = catalog_item
        self.logger = logger

    async def get_provision_data(self):
        last_successful_provision = None
        if len(self.catalog_item.labels['gpte.redhat.com/asset-uuid']) != 0:
            query = await execute_query(
                GET_CATALOG_ITEM_LAST_SUCCESSFUL_PROVISION, (self.catalog_item.labels['gpte.redhat.com/asset-uuid'], )
            )
            resultArr = query.get("result", [])
            if len(resultArr) > 0:
                _last_successful_provision_str = resultArr[0].get(
                    "last_successful_provision", None
                )
                if (_last_successful_provision_str is not None):
                    self.logger.info(_last_successful_provision_str)
                    last_successful_provision = datetime.fromisoformat(_last_successful_provision_str)
        return ProvisionData(last_successful_provision)

    async def get_rating_from_api(self):
        if len(self.catalog_item.labels['gpte.redhat.com/asset-uuid']) != 0:
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        f"{Babylon.ratings_api}/api/ratings/v1/catalogitem/{self.catalog_item.labels['gpte.redhat.com/asset-uuid']}?catalog_name={self.catalog_item.name}",
                        ssl=False,
                    ) as resp:
                        if resp.status == 200:
                            self.logger.info(
                                f"/api/ratings/v1/catalogitem/{self.catalog_item.labels['gpte.redhat.com/asset-uuid']}?catalog_name={self.catalog_item.name} - {resp.status}"
                            )
                            response = await resp.json()
                            return Rating(
                                response.get("rating_score", None),
                                response.get("total_ratings", 0),
                            )
                        self.logger.warn(
                            f"/api/ratings/v1/catalogitem/{self.catalog_item.labels['gpte.redhat.com/asset-uuid']}?catalog_name={self.catalog_item.name} - {resp.status}"
                        )
            except Exception as e:
                self.logger.error(f"Invalid connection with {Babylon.ratings_api} - {e}")
                raise

    async def get_status_timestamps(self):
        if len(self.catalog_item.labels['gpte.redhat.com/asset-uuid']) != 0:
            query = await execute_query(
                    GET_CATALOG_ITEM_STATUS_PERIODS, (self.catalog_item.labels['gpte.redhat.com/asset-uuid'], )
                )
            resultArr = query.get("result", [])
            if len(resultArr) > 0:
                return resultArr
        return []
    
    async def create_status_timestamps(self):
        status = 'enabled'
        if len(self.catalog_item.labels['gpte.redhat.com/asset-uuid']) != 0:
            if self.catalog_item.is_disabled:
                status = 'disabled'
            await execute_query(
                CREATE_CATALOG_ITEM_STATUS_PERIODS, 
                (status, self.catalog_item.annotations.get(Babylon.catalog_item_ops_annotation, None), self.catalog_item.labels['gpte.redhat.com/asset-uuid'])
            )
        return None