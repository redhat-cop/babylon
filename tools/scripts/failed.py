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

def get_tower_api_config():
    tower_secret = core_v1_api.read_namespaced_secret('babylon-tower', 'anarchy-operator')
    return {
        k: b64decode(v).decode('utf-8') for k, v in tower_secret.data.items()
    }

def get_tower_job(tower_api, job_id):
    tower_job_url = "https://{0}/api/v2/jobs/{1}/".format(tower_api['hostname'], job_id)
    resp = requests.get(
       tower_job_url,
       auth=requests.auth.HTTPBasicAuth(tower_api['user'], tower_api['password']),
       verify=False
    )
    return resp.json()

kubernetes.config.load_kube_config()
core_v1_api = kubernetes.client.CoreV1Api()
custom_objects_api = kubernetes.client.CustomObjectsApi()
logger = logging.getLogger(sys.argv[0])
tower_api = get_tower_api_config()


# list all resourceclaims, group by namespace

# for each namespace
#  get the total count
#  get the completed
#  for those not completed, get the status from tower
#  print count inprogress
#  print count failed


#response_namespaces = core_v1_api.list_namespace()
#namespaces = list(map(lambda n: n.metadata.name, response_namespaces.items))

response_claims = custom_objects_api.list_cluster_custom_object(
    'poolboy.gpte.redhat.com',
    'v1',
    'resourceclaims')

#claims = list(map(lambda cr: cr['metadata']['name'], response_claims['items']))
claims = dict()

# Group claim by namespace
for claim in response_claims['items']:
    if claim['metadata']['namespace'] in claims:
        claims[claim['metadata']['namespace']].append(claim)
    else:
        claims[claim['metadata']['namespace']]= [ claim ]

for namespace in claims:
    total = len(claims[namespace])
    completed = 0
    failed = 0
    inprogress = 0
    for claim in claims[namespace]:
        status_resources = claim.get('status', {}).get('resources', [])
        if not status_resources:
            continue
        for status_resource in status_resources:
            anarchy_subject = status_resource['state']
            anarchy_subject_status = anarchy_subject.get('status', {})
            tower_jobs = anarchy_subject_status.get('towerJobs', {})
            provision_job = tower_jobs.get('provision', {})
            deployer_job_id = provision_job.get('deployerJob')
            launch_job_id = provision_job.get('launchJob')

            if provision_job.get('completeTimestamp'):
                completed = completed + 1
                continue
            elif deployer_job_id:
                tower_job = get_tower_job(tower_api, deployer_job_id)
                if tower_job['status'] in ['canceled', 'error', 'failed']:
                    logger.info("AgnosticD {0} for {1}".format(tower_job['status'], anarchy_subject['metadata']['name']))
                    logger.info("Please check https://{0}/#/jobs/playbook/{1}".format(tower_api['hostname'], deployer_job_id))
                    failed = failed + 1
                    print(claim['metadata']['name'])
                else:
                    inprogress = inprogress + 1
            elif launch_job_id:
                tower_job = get_tower_job(tower_api, launch_job_id)
                if tower_job['status'] in ['canceled', 'error', 'failed']:
                    logger.info("DarkTower job-runner {0} for {1}".format(tower_job['status'], anarchy_subject['metadata']['name']))
                    logger.info("Please check https://{0}/#/jobs/playbook/{1}".format(tower_api['hostname'], launch_job_id))
                    failed = failed + 1
                    print(claim['metadata']['name'])
                else:
                    inprogress = inprogress + 1
