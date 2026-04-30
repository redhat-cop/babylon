#!/usr/bin/env python

import asyncio

from copy import deepcopy

from babylon_async import BabylonClient, CatalogItem, ResourcePool

import deepmerge
template_merger = deepmerge.Merger(
    [(dict, ["merge"])],
    ["override"],
    ["override"],
)

async def find_useless_pools():
    async with BabylonClient() as babylon:
        all_catalog_items = []
        async for catalog_item in babylon.list_catalog_items():
            all_catalog_items.append(catalog_item)

        async for resource_pool in babylon.list_resource_pools():
            await report_resource_pool_if_no_catalog_item(
                all_catalog_items=all_catalog_items,
                resource_pool=resource_pool,
            )

async def report_resource_pool_if_no_catalog_item(
    all_catalog_items:list[CatalogItem],
    resource_pool:ResourcePool,
):
    all_job_vars = {}
    for resource in resource_pool.spec.resources:
        all_job_vars.update(
            resource.template.get('spec', {}).get('vars', {}).get('job_vars', {})
        )

    for catalog_item in all_catalog_items:
        if catalog_item.external_url is not None:
            continue
        parameter_values = {}
        for parameter in catalog_item.parameters:
            if parameter.name in all_job_vars:
                # FIXME - also check that parameter value is still valid against current schema
                parameter_values[parameter.name] = all_job_vars[parameter.name]
            elif parameter.default is not None:
                parameter_values[parameter.name] = parameter.default
        resource_provider = await catalog_item.get_resource_provider(cache=True)
        resource_provider_resources = await resource_provider.get_resources(
            parameter_values=parameter_values,
            cache=True,
        )

        # Match is impossible if resource pool has more resources than the provider specifies
        if len(resource_pool.spec.resources) > len(resource_provider_resources):
            continue

        # Discard fields that don't need to match
        for resource in resource_provider_resources:
            resource.pop('name')
            resource['template']['spec']['vars'].pop('action_schedule', None)

        catalog_item_match = None
        for idx, pool_resource in enumerate(resource_pool.spec.resources):
            resource_provider_resource = resource_provider_resources[idx]
            # All vars from the resource_provider must match, but pool may have other vars
            template_cmp = template_merger.merge(
                deepcopy(pool_resource.template),
                resource_provider_resource['template'],
            )
            if pool_resource.provider.name != resource_provider_resource['provider']['name']:
                catalog_item_match = False
                break
            if pool_resource.template != template_cmp:
                catalog_item_match = False
                break
        else:
            catalog_item_match = True
        if catalog_item_match:
            break
    else:
        print(f"{resource_pool} is useless!")

async def main():
    from argparse import ArgumentParser
    argparser = ArgumentParser(
        prog="find-useless-pools.py",
        description="Find resource pools that cannot match any catalog items",
    )
    args = argparser.parse_args()

    await find_useless_pools()

if __name__ == '__main__':
    asyncio.run(main())
