GET_CATALOG_ITEM_LAST_SUCCESSFUL_PROVISION = (
    """SELECT provisions.provisioned_at AS last_successful_provision
        FROM catalog_items
            JOIN provisions 
            ON catalog_items.id = provisions.catalog_id
        WHERE catalog_items.agnosticv_key=(%s)
        AND provision_result = 'success'
        ORDER BY provisions.provisioned_at DESC
        LIMIT 1;"""
)

class ProvisionData:
    def __init__(self, last_successful_provision):
        self.last_successful_provision = last_successful_provision

class CatalogItemService:
    def __init__(self, catalog_item, logger):
        self.catalog_item = catalog_item
        self.logger = logger

    async def get_provision_data(self):
        query = await execute_query(GET_CATALOG_ITEM_LAST_SUCCESSFUL_PROVISION, (self.catalog_item.name, ))
        resultArr = query.get("result", [])
        if (len(resultArr) > 0):
            last_successful_provision = resultArr[0].get("last_successful_provision", None)
            return ProvisionData(last_successful_provision)
        logger.info(f"No provision results for {self.catalog_item.name}")
        return None
    
    async def get_rating_from_api(self):
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{Babylon.ratings_api}/api/ratings/v1/catalogitem/{self.catalog_item.name}", ssl=False) as resp:
                    if resp.status == 200:
                        logger.info(f"/api/ratings/v1/catalogitem/{self.catalog_item.name} - {resp.status}")
                        response = await resp.json()
                        return Rating(response.get('rating_score', None), response.get('total_ratings', 0))
                    logger.warn(f"/api/ratings/v1/catalogitem/{self.catalog_item.name} - {resp.status}")
        except Exception as e:
            logger.error(f"Invalid connection with {Babylon.ratings_api} - {e}")
            raise