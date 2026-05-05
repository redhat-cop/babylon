#!/usr/bin/env python

import asyncio

from babylon_async import BabylonClient

async def main():
    async with BabylonClient() as babylon:
        print(babylon.is_admin)
        catalog_item = await babylon.get_catalog_item(
            name='tests.test-empty-config.prod',
            namespace='babylon-catalog-test',
        )
        user = await babylon.get_current_user()
        print(user.groups)
        namespace = await babylon.get_namespace('user-jkupfere-redhat-com')
        #async for namespace in babylon.list_namespaces():
        #    print(namespace.name)
        namespace = await babylon.get_current_user_service_namespace()
        print(namespace.name)
        #resource_claim = await babylon.order_service(
        #    catalog_item=catalog_item,
        #    service_namespace="user-jkupfere-redhat-com",
        #)

if __name__ == '__main__':
    asyncio.run(main())
