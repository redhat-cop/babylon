#!/usr/bin/env python

import asyncio

from copy import deepcopy

from babylon_async import BabylonClient, CatalogItem, ResourcePool

def catalog_item_label(catalog_item):
    return f"catalog-item.demo.redhat.com/{catalog_item.name}"

def cloud_provider_label(value):
    return f"cloud-provider.demo.redhat.com/{value}"

def resource_provider_label(resource_provider):
    return f"resource-provider.demo.redhat.com/{resource_provider.name}"

all_catalog_items = None
async def get_all_catalog_items(babylon: BabylonClient) -> list[CatalogItem]:
    """Return all catalog items either from cache or get and cache the first time."""
    global all_catalog_items
    if all_catalog_items is not None:
        return all_catalog_items
    all_catalog_items = []
    async for catalog_item in babylon.list_catalog_items():
        all_catalog_items.append(catalog_item)
    return all_catalog_items

async def get_catalog_items_for_resource_pool(
    babylon: BabylonClient,
    resource_pool: ResourcePool,
) -> list[CatalogItem]:
    catalog_items = []
    all_catalog_items = await get_all_catalog_items(babylon)
    for catalog_item in all_catalog_items:
        if await catalog_item.check_resource_pool_match(resource_pool, cache=True):
            catalog_items.append(catalog_item)
    return catalog_items

async def label_resource_pools(
    dry_run:bool=False,
):
    """Label ResourcePools with cloud provider labels."""
    async with BabylonClient() as babylon:
        async for resource_pool in babylon.list_resource_pools():
            await label_resource_pool(
                babylon=babylon,
                dry_run=dry_run,
                resource_pool=resource_pool,
            )

async def label_resource_pool(
    babylon:BabylonClient,
    resource_pool:ResourcePool,
    dry_run:bool=False,
):
    labels = {}
    for resource in resource_pool.spec.resources:
        resource_template_job_vars = resource.template.get('spec', {}).get('vars', {}).get('job_vars', {})
        if 'cloud_provider' in resource_template_job_vars:
            labels[cloud_provider_label(resource_template_job_vars['cloud_provider'])] = ""
        resource_provider = await babylon.get_resource_provider(resource.provider.name)
        labels[resource_provider_label(resource_provider)] = ""

        anarchy_namespace = resource_provider.spec.override.get('metadata', {}).get('namespace')
        anarchy_governor_name = resource_provider.spec.override.get('spec', {}).get('governor')

        anarchy_governor = await babylon.get_anarchy_governor(
            name=anarchy_governor_name,
            namespace=anarchy_namespace,
        )
        if 'cloud_provider' in anarchy_governor.job_vars:
            labels[cloud_provider_label(anarchy_governor.job_vars['cloud_provider'])] = ""

    catalog_items = await get_catalog_items_for_resource_pool(
        babylon=babylon,
        resource_pool=resource_pool,
    )
    if len(catalog_items) > 0:
        for catalog_item in catalog_items:
            labels[catalog_item_label(catalog_item)] = catalog_item.uid
    else:
        labels["catalog-item.demo.redhat.com/NONE"] = ""

    patch = []
    for label, value in labels.items():
        if resource_pool.metadata.labels.get(label) == value:
            continue
        patch.append({
            "op": "add",
            "path": f"/metadata/labels/{label.replace('/', '~1')}",
            "value": value
        })
        if dry_run:
            print(f"Would add label {label} to {resource_pool}")
        else:
            print(f"Adding label {label} to {resource_pool}")

    for label, value in resource_pool.metadata.labels.items():
        if label in labels or not (
            label.startswith('catalog-item.demo.redhat.com/') or
            label.startswith('cloud-provider.demo.redhat.com/') or
            label.startswith('resource-provider.demo.redhat.com/')
        ):
            continue
        patch.append({
            "op": "remove",
            "path": f"/metadata/labels/{label.replace('/', '~1')}",
        })
        if dry_run:
            print(f"Would remove label {label} from {resource_pool}")
        else:
            print(f"Removing label {label} from {resource_pool}")

    if len(patch) == 0 or dry_run:
        return

    await resource_pool.patch(patch)

async def main():
    from argparse import ArgumentParser
    argparser = ArgumentParser(
        prog="label-pools.py",
        description="Label ResourcePools by cloud provider",
    )
    argparser.add_argument("-d", "--dry-run", action='store_true')
    args = argparser.parse_args()

    await label_resource_pools(dry_run=args.dry_run)

if __name__ == '__main__':
    asyncio.run(main())
