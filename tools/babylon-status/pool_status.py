#!/usr/bin/env python3

import json
import os
import kubernetes
import logging
import requests
import subprocess
import sys
import time

from base64 import b64decode
from datetime import datetime
from pprint import pprint
import urllib3


if len(sys.argv) == 2:
    pool_pattern = str(sys.argv[1])
else:
    pool_pattern = ''

urllib3.disable_warnings()

kubernetes.config.load_kube_config()
core_v1_api = kubernetes.client.CoreV1Api()
custom_objects_api = kubernetes.client.CustomObjectsApi()
logger = logging.getLogger(sys.argv[0])

response_pools = custom_objects_api.list_namespaced_custom_object(
    'poolboy.gpte.redhat.com',
    'v1',
    'poolboy',
    'resourcepools')

pools = response_pools['items']
ttotal = 0
tavailable = 0
ttaken = 0

print("POOL MIN TOTAL AVAILABLE TAKEN")
for pool in pools:
    if pool_pattern and pool_pattern not in pool['metadata']['name']:
        continue
    #status_resources = pool.get('status', {}).get('resources', [])
    label = 'poolboy.gpte.redhat.com/resource-pool-name='+pool['metadata']['name']
    handles_resp = custom_objects_api.list_namespaced_custom_object(
                   'poolboy.gpte.redhat.com',
                   'v1',
                   'poolboy',
                   'resourcehandles',
                   label_selector=label)
    handles = handles_resp['items']
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
                      'anarchy.gpte.redhat.com', 'v1', resource['reference']['namespace'], 'anarchysubjects', resource['reference']['name'])
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



    print("%s %s %s %s %s" %(pool['metadata']['name'], min_available, total, available, taken))

print("%s %s %s %s %s" %('TOTAL', '-', ttotal, tavailable, ttaken))
