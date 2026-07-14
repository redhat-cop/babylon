import logging
import aiohttp

from datetime import datetime
from rating import Rating
from babylon import Babylon


class ProvisionData:
    def __init__(self, last_successful_provision):
        self.last_successful_provision = last_successful_provision


class CatalogItemService:
    def __init__(self, catalog_item, logger):
        self.catalog_item = catalog_item
        self.logger = logger

    async def get_provision_data(self):
        last_successful_provision = None
        asset_uuid = self.catalog_item.labels.get('gpte.redhat.com/asset-uuid', '')
        stage = self.catalog_item.labels.get('babylon.gpte.redhat.com/stage', '')
        if asset_uuid:
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        f"{Babylon.reporting_api}/catalog_item/metrics/{asset_uuid}?environment={stage}",
                        headers={"Authorization": f"Bearer {Babylon.reporting_api_authorization_token}"}
                    ) as resp:
                        if resp.status == 200:
                            self.logger.info(
                                f"/catalog_item/metrics/{asset_uuid}?environment={stage} - {resp.status}"
                            )
                            response = await resp.json()
                            _last_successful_provision_str = response.get("lastSuccessfulProvision")
                            if _last_successful_provision_str is not None:
                                self.logger.info(_last_successful_provision_str)
                                last_successful_provision = datetime.fromisoformat(_last_successful_provision_str)
                        else:
                            self.logger.warning(
                                f"/catalog_item/metrics/{asset_uuid}?environment={stage} - {resp.status}"
                            )
            except Exception as e:
                self.logger.error(f"Invalid connection with {Babylon.reporting_api} - {e}")
                raise
        return ProvisionData(last_successful_provision)

    async def get_rating_from_api(self):
        if len(self.catalog_item.labels['gpte.redhat.com/asset-uuid']) != 0:
            asset_uuid = self.catalog_item.labels['gpte.redhat.com/asset-uuid']
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        f"{Babylon.reporting_api}/rating/v1/catalog/{asset_uuid}",
                        headers={"Authorization": f"Bearer {Babylon.reporting_api_authorization_token}"}
                    ) as resp:
                        if resp.status == 200:
                            self.logger.info(
                                f"/rating/v1/catalog/{asset_uuid} - {resp.status}"
                            )
                            response = await resp.json()
                            return Rating(
                                response.get("rating_score", None),
                                response.get("total_ratings", 0),
                            )
                        self.logger.warn(
                            f"/rating/v1/catalog/{asset_uuid} - {resp.status}"
                        )
            except Exception as e:
                self.logger.error(f"Invalid connection with {Babylon.reporting_api} - {e}")
                raise

    async def get_is_disabled(self):
        if len(self.catalog_item.labels['gpte.redhat.com/asset-uuid']) != 0:
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        f"{Babylon.reporting_api}/catalog_incident/last-incident/{self.catalog_item.labels['gpte.redhat.com/asset-uuid']}/{self.catalog_item.labels['babylon.gpte.redhat.com/stage']}",
                        headers={"Authorization": f"Bearer {Babylon.reporting_api_authorization_token}"}

                    ) as resp:
                        if resp.status == 200:
                            self.logger.info(
                                f"/catalog_incident/last-incident/{self.catalog_item.labels['gpte.redhat.com/asset-uuid']}/{self.catalog_item.labels['babylon.gpte.redhat.com/stage']} - {resp.status}"
                            )
                            try:
                                response = await resp.json()
                                return response.get("disabled", False)
                            except Exception as e:
                                return False
                        self.logger.warn(
                            f"/catalog_incident/last-incident/{self.catalog_item.labels['gpte.redhat.com/asset-uuid']}/{self.catalog_item.labels['babylon.gpte.redhat.com/stage']} - {resp.status}"
                        )
            except Exception as e:
                self.logger.error(f"Invalid connection with {Babylon.reporting_api} - {e}")
                raise