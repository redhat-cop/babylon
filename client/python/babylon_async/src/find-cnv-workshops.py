#!/usr/bin/env python

import asyncio

from copy import deepcopy

from babylon_async import BabylonClient

import deepmerge
template_merger = deepmerge.Merger(
    [(dict, ["merge"])],
    ["override"],
    ["override"],
)

async def find_cnv_workshops(babylon) -> None:
    async for workshop in babylon.list_workshops():
        service_namespace = await babylon.get_namespace(workshop.namespace)
        async for workshop_provision in workshop.list_workshop_provisions():
            resource_provider = await workshop_provision.get_resource_provider()

            resources = await resource_provider.get_resources(parameter_values=workshop_provision.parameter_values)
            for item in resources:
                item_resource_provider = await babylon.get_resource_provider(item['provider']['name'])
                anarchy_governor_name = item_resource_provider.spec.override['spec']['governor']
                anarchy_namespace = item_resource_provider.spec.override['metadata']['namespace']
                #FIXME sandboxes are actually conditional... ideally it would check
                #_vars = {}
                #template_merger.merge(_vars, item['template']['spec']['vars'])
                #template_merger.merge(_vars, item_resource_provider.spec.override['spec']['vars'])
                #print(_vars['job_vars'])
                anarchy_governor = await babylon.get_anarchy_governor(
                    name=anarchy_governor_name,
                    namespace=anarchy_namespace,
                )
                for sandbox in anarchy_governor.get_sandboxes():
                    if sandbox.cloud_selector.get('cloud') == 'cnv':
                        print(f"{workshop} <{service_namespace.metadata.annotations['openshift.io/requester']}>")


async def main() -> None:
    from argparse import ArgumentParser
    argparser = ArgumentParser(
        prog="find-cnv-workshops.py",
        description="Find workshops using CNV",
    )
    args = argparser.parse_args()

    async with BabylonClient() as babylon:
        await find_cnv_workshops(babylon)

if __name__ == '__main__':
    asyncio.run(main())
