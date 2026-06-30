#!/usr/bin/env python

import asyncio

from babylon_async import BabylonClient
from babylon_async.exceptions import BabylonApiException

from kubernetes_asyncio.client import (
    ApiException as KubernetesApiException
)

async def fix_subjects(dry_run:bool=False, namespace:str|None=None):
    async with BabylonClient() as babylon:
        async for anarchy_subject in babylon.list_anarchy_subjects(namespace=namespace):
            await fix_subject(anarchy_subject, dry_run=dry_run)


async def fix_subject(anarchy_subject, dry_run=False):
    await fix_runs(anarchy_subject, dry_run=dry_run)

async def fix_runs(anarchy_subject, dry_run=False):
    oldest_queued_run = None
    has_active_run = False
    #if anarchy_subject.status is not None:
    #    status_patch = []
    #    for idx, anarchy_run_ref in enumerate(anarchy_subject.status.runs.active):
    #        anarchy_run = None
    #        try:
    #            anarchy_run = await anarchy_subject.get_anarchy_run(anarchy_run_ref.name)
    #        except BabylonApiException as exception:
    #            if exception.status != 404:
    #                raise
    #        if anarchy_run is None:
    #            if dry_run:
    #                print(f"Would remove missing AnarchyRun {anarchy_run_ref.name} from {anarchy_subject}")
    #            else:
    #                print(f"Removing missing AnarchyRun {anarchy_run_ref.name} from {anarchy_subject}")
    #            status_patch.insert(0, {
    #                "op": "remove",
    #                "path": f"/status/runs/active/{idx}",
    #            })
    #            status_patch.insert(0, {
    #                "op": "test",
    #                "path": f"/status/runs/active/{idx}/name",
    #                "value": anarchy_run_ref.name,
    #            })
    #    if len(status_patch) > 0 and not dry_run:
    #        print(status_patch)
    #        try:
    #            await anarchy_subject.patch_status(status_patch)
    #        except KubernetesApiException as exception:
    #            if exception.status not in (404, 422):
    #                raise
    async for anarchy_run in anarchy_subject.list_anarchy_runs():
        if anarchy_run.is_active:
            has_active_run = True
            if not await anarchy_run.check_runner_pod_exists():
                if dry_run:
                    print(f"{anarchy_run} references missing runner pod {anarchy_run.runner_pod_name}")
                else:
                    print(f"Resetting {anarchy_run} to pending due to reference missing runner pod {anarchy_run.runner_pod_name}")
                    await anarchy_run.set_runner_state('pending')
        elif anarchy_run.is_queued:
            if (
                oldest_queued_run is None or
                oldest_queued_run.creation_datetime > anarchy_run.creation_datetime
            ):
                oldest_queued_run = anarchy_run
    if not has_active_run and oldest_queued_run is not None:
        print(f"{oldest_queued_run} is queued but there are no active runs for {anarchy_subject}")


async def main():
    from argparse import ArgumentParser
    argparser = ArgumentParser(
        prog="fix-subjects.py",
        description="Fix common known issues which may occur with AnarchySubjects",
    )
    argparser.add_argument("-d", "--dry-run", action='store_true')
    argparser.add_argument("-n", "--namespace")
    args = argparser.parse_args()

    await fix_subjects(
        dry_run=args.dry_run,
        namespace=args.namespace,
    )

if __name__ == '__main__':
    asyncio.run(main())
