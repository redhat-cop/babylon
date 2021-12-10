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

print("POOL MIN TOTAL AVAILABLE")
for pool in pools:
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
    completed = 0
    failed = 0
    inprogress = 0
    unknown = 0

    for handle in handles:
        for resource in handle['spec']['resources']:
            try:
                if resource['reference']['kind'] == 'AnarchySubject':
                    total = total + 1
                    subject = custom_objects_api.get_namespaced_custom_object(
                      'anarchy.gpte.redhat.com', 'v1', resource['reference']['namespace'], 'anarchysubjects', resource['reference']['name'])
                    try:
                        if subject['spec']['vars']['desired_state'] == subject['spec']['vars']['current_state']:
                            if subject['spec']['vars']['healthy'] == True:
                              completed = completed + 1
                    except:
                        pass
            except:
                pass



    print("%s %s %s %s" %(pool['metadata']['name'], min_available, total, completed))
