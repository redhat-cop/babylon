"""Interaction with the Sandbox API"""

import asyncio
from datetime import datetime
from time import time
from typing import List, Mapping

import aiohttp
import kopf

class OcpSharedClusterConfiguration:
    """Configuration of OpenShift cluster as returned from the Sandbox API"""
    def __init__(self, definition):
        self._definition = definition

    @property
    def annotations(self) -> Mapping[str,str]:
        """Annotations used to select cluster"""
        return self._definition['annotations']

    @property
    def api_url(self) -> str:
        return self._definition['api_url']

    @property
    def connection_status(self) -> str:
        return self._definition['data']['connection_status']

    @property
    def created_by(self) -> str:
        return self._definition['created_by']

    @property
    def ingress_domain(self) -> str:
        return self._definition['ingress_domain']

    @property
    def max_placements(self) -> int:
        return self._definition['max_placements']

    @property
    def name(self) -> str:
        return self._definition['name']

    @property
    def valid(self) -> bool:
        return self._definition['valid']

class SandboxAPI:
    """Class for interaction with the Sandbox API"""
    def __init__(self, base_url, auth_token):
        self.__access_token = None
        self.__access_token_exp = None
        self.__auth_token = auth_token
        self.__base_url = base_url
        self.__lock = asyncio.Lock()

    async def connect(self) -> None:
        """Connect to API and establish session unless already established and
        not expired"""
        async with self.__lock:
            if self.__access_token is not None and self.__access_token_exp - 10 > time():
                return
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.__base_url}/api/v1/login",
                    headers={
                        "Authorization": f"Bearer {self.__auth_token}"
                    }
                ) as resp:
                    if resp.status != 200:
                        raise kopf.TemporaryError(f"SandboxAPI login failed: {resp.status}")
                    resp_data = await resp.json()
                    self.__access_token = resp_data['access_token']
                    self.__access_token_exp = datetime.strptime(
                        resp_data['access_token_exp'],
                        "%Y-%m-%dT%H:%M:%S%z"
                    ).timestamp()

    #pylint: disable=R0913
    #pylint: disable=R0914
    #pylint: disable=R0917
    async def create_ocp_shared_cluster_configuration(self,
        annotations:Mapping,
        api_url:str,
        deployer_admin_sa_token_refresh_interval:str,
        deployer_admin_sa_token_target_var:str,
        deployer_admin_sa_token_ttl:str,
        ingress_domain:str,
        max_placements:int,
        max_cpu_usage_percentage:int|None,
        max_memory_usage_percentage:int|None,
        name:str,
        quota_required:bool,
        token:str,
    ) -> None:
        """Register cluster with Sandbox API"""
        config = {
            "annotations": annotations,
            "api_url": api_url,
            "deployer_admin_sa_token_refresh_interval": deployer_admin_sa_token_refresh_interval,
            "deployer_admin_sa_token_target_var": deployer_admin_sa_token_target_var,
            "deployer_admin_sa_token_ttl": deployer_admin_sa_token_ttl,
            "ingress_domain": ingress_domain,
            "max_placements": max_placements,
            "name": name,
            "quota_required": quota_required,
            "token": token,
        }
        if max_cpu_usage_percentage is not None:
            config['max_cpu_usage_percentage'] = max_cpu_usage_percentage
        if max_memory_usage_percentage is not None:
            config['max_memory_usage_percentage'] = max_memory_usage_percentage

        await self.connect()
        async with aiohttp.ClientSession() as session:
            async with session.put(
                f"{self.__base_url}/api/v1/ocp-shared-cluster-configurations/{name}",
                headers={
                    "Authorization": f"Bearer {self.__access_token}",
                },
                json=config,
            ) as resp:
                if resp.status not in (200, 201):
                    resp.raise_for_status()

    async def disable_ocp_shared_cluster_configuration(self,
        name: str,
    ) -> None:
        await self.connect()
        async with aiohttp.ClientSession() as session:
            async with session.put(
                f"{self.__base_url}/api/v1/ocp-shared-cluster-configurations/{name}/disable",
                headers={
                    "Authorization": f"Bearer {self.__access_token}",
                }
            ) as resp:
                if resp.status != 200:
                    resp.raise_for_status()

    async def enable_ocp_shared_cluster_configuration(self,
        name: str,
    ) -> None:
        await self.connect()
        async with aiohttp.ClientSession() as session:
            async with session.put(
                f"{self.__base_url}/api/v1/ocp-shared-cluster-configurations/{name}/enable",
                headers={
                    "Authorization": f"Bearer {self.__access_token}",
                }
            ) as resp:
                if resp.status != 200:
                    resp.raise_for_status()

    async def get_ocp_shared_cluster_configuration(self,
        name: str,
    ) -> OcpSharedClusterConfiguration|None:
        await self.connect()
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{self.__base_url}/api/v1/ocp-shared-cluster-configurations/{name}",
                headers={
                    "Authorization": f"Bearer {self.__access_token}",
                }
            ) as resp:
                if resp.status == 404:
                    return None
                if resp.status != 200:
                    resp.raise_for_status()
                data = await resp.json()
                return OcpSharedClusterConfiguration(data)

    async def get_ocp_shared_cluster_configuration_placements(self,
        name: str,
    ) -> List[Mapping]:
        await self.connect()
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{self.__base_url}/api/v1/ocp-shared-cluster-configurations/{name}/placements",
                headers={
                    "Authorization": f"Bearer {self.__access_token}",
                }
            ) as resp:
                if resp.status != 200:
                    resp.raise_for_status()
                data = await resp.json()
                return data['placements']

    async def remove_ocp_shared_cluster_configuration(self,
        name: str,
    ) -> None:
        await self.connect()
        async with aiohttp.ClientSession() as session:
            async with session.delete(
                f"{self.__base_url}/api/v1/ocp-shared-cluster-configurations/{name}/offboard",
                headers={
                    "Authorization": f"Bearer {self.__access_token}",
                }
            ) as resp:
                if resp.status != 200:
                    resp.raise_for_status()
