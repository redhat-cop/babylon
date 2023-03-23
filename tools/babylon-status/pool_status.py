#!/usr/bin/env python3
import json

import kubernetes
import pandas as pd
import urllib3
import argparse

urllib3.disable_warnings()
core_v1_api = custom_objects_api = pool_pattern = None
poolboy_domain = 'poolboy.gpte.redhat.com'
poolboy_version = 'v1'
poolboy_namespace = 'poolboy'


def parse_args():
    parser = argparse.ArgumentParser(description="List and update Resource Pools")
    parser.add_argument('--list',
                        help='Lists all pools. [default: %(default)s]',
                        action="store_true",
                        default=True,
                        required=False)

    parser.add_argument('--pattern',
                        dest="pool_pattern",
                        help='Search pool by pattern',
                        const='',
                        nargs='?',
                        required=False)

    parser.add_argument('--pool-name',
                        dest="pool_name",
                        help='Pool Name',
                        nargs=1,
                        required=False)

    parser.add_argument('--set-min',
                        dest="set_min",
                        help='Min replica',
                        nargs=1,
                        type=int,
                        required=False)

    args = parser.parse_args()

    return args


def search_pool():
    # min_available = pool['spec']['minAvailable']
    try:
        pool_config = custom_objects_api.get_namespaced_custom_object(poolboy_domain, poolboy_version,
                                                                      poolboy_namespace,
                                                                      'resourcepools', pool_name)
        return pool_config
    except kubernetes.client.exceptions.ApiException as e:
        if e.status == 404:
            print(f"Resource Pool Not Found {pool_name}")
            exit(-1)
        else:
            print(f"Error connect to K8s API {e}")
            exit(-2)


def set_min():
    try:
        resource_pool_data = search_pool()
        if len(resource_pool_data) == 0:
            return

        previous_value = resource_pool_data['spec']['minAvailable']
        if previous_value == pool_min:
            print(f"Pool {pool_name} already set minAvailable to {previous_value}. Skipping")
            return

        custom_objects_api.patch_namespaced_custom_object(
            group=poolboy_domain,
            version=poolboy_version,
            namespace=poolboy_namespace,
            plural='resourcepools',
            name=pool_name,
            body={
                "spec": {
                    "minAvailable": int(pool_min)
                }
            }
        )
        print(f"Pool {pool_name} updated previous value {previous_value} new value {pool_min}")

    except kubernetes.client.exceptions.ApiException as e:
        if e.status == 404:
            print(f"Error apply min for the pool {pool_name}", e)
            exit(-1)
        else:
            print(f"Error connect to K8s API {e}")
            exit(-2)


def list_pools():
    response_pools = custom_objects_api.list_namespaced_custom_object('poolboy.gpte.redhat.com',
                                                                      'v1',
                                                                      'poolboy',
                                                                      'resourcepools')
    pools = response_pools.get('items', [])
    ttotal = 0
    tavailable = 0
    ttaken = 0
    df_pools = pd.DataFrame(columns=['POOL', 'MIN', 'TOTAL', 'AVAILABLE', 'TAKEN'])
    for pool in pools:
        pool_name = pool['metadata']['name']
        if pool_pattern and pool_pattern not in pool_name:
            continue
        label = f"poolboy.gpte.redhat.com/resource-pool-name={pool_name}"
        handles_resp = custom_objects_api.list_namespaced_custom_object('poolboy.gpte.redhat.com',
                                                                        'v1',
                                                                        'poolboy',
                                                                        'resourcehandles',
                                                                        label_selector=label)
        handles = handles_resp.get('items', [])
        min_available = pool['spec']['minAvailable']
        total = 0
        available = 0
        taken = 0

        for handle in handles:
            total = total + 1
            ttotal = ttotal + 1

            if 'resourceClaim' in handle['spec']:
                taken = taken + 1
                ttaken = ttaken + 1
                continue

            if 'resources' not in handle['spec']:
                continue

            totalresource = len(handle['spec']['resources'])
            resourcecompleted = 0

            for resource in handle['spec']['resources']:
                try:
                    if resource['reference']['kind'] == 'AnarchySubject':
                        subject = custom_objects_api.get_namespaced_custom_object(
                            'anarchy.gpte.redhat.com', 'v1', resource['reference']['namespace'], 'anarchysubjects',
                            resource['reference']['name'])
                        try:
                            if subject['spec']['vars']['desired_state'] == subject['spec']['vars']['current_state']:
                                if subject['spec']['vars']['healthy'] == True:
                                    resourcecompleted = resourcecompleted + 1
                        except:
                            pass
                except:
                    pass

            if resourcecompleted == len(handle['spec']['resources']):
                available = available + 1
                tavailable = tavailable + 1

        pool_dict = {
            'POOL': pool_name,
            'MIN': min_available,
            'TOTAL': total,
            'AVAILABLE': available,
            'TAKEN': taken
        }
        df_pool = pd.DataFrame([pool_dict])

        df_pools = pd.concat([df_pool, df_pools], ignore_index=True)

    print(df_pools.sort_values('MIN', ascending=False).to_string(index=False))
    print()
    print("Total Items: ", df_pools['TOTAL'].sum())
    print("Total Items With MIN >0: ", df_pools['MIN'].sum())
    print("Total Available:", df_pools['AVAILABLE'].sum())
    print("Total Taken: ", df_pools['TAKEN'].sum())


if __name__ == "__main__":
    args = parse_args()

    if args.set_min and args.pool_name is None:
        print("Option --set-min requires --pool-name")
        exit(-1)

    kubernetes.config.load_kube_config()
    core_v1_api = kubernetes.client.CoreV1Api()
    custom_objects_api = kubernetes.client.CustomObjectsApi()

    if args.set_min and args.set_min[0] >= 0 and args.pool_name:
        pool_min = args.set_min[0]
        pool_name = args.pool_name[0]
        set_min()
        exit(0)

    pool_pattern = args.pool_pattern
    list_pools()
