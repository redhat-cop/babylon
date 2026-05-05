#!/usr/bin/env python

import asyncio

from babylon_async import BabylonClient

async def fix_subjects(dry_run:bool=False, namespace:str|None=None):
    async with BabylonClient() as babylon:
        async for anarchy_subject in babylon.list_anarchy_subjects(namespace=namespace):
            await fix_subject(anarchy_subject, dry_run=dry_run)


async def fix_subject(anarchy_subject, dry_run=False):
    await fix_runs(anarchy_subject, dry_run=dry_run)

async def fix_runs(anarchy_subject, dry_run=False):
    oldest_queued_run = None
    has_active_run = False
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
