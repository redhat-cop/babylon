#!/usr/bin/env python3

import json
import kubernetes
import logging
import requests
import subprocess
import sys
import time

from base64 import b64decode
from datetime import datetime

kubernetes.config.load_kube_config()
core_v1_api = kubernetes.client.CoreV1Api()
custom_objects_api = kubernetes.client.CustomObjectsApi()
logger = logging.getLogger(sys.argv[0])

def annotate_overwatch(text, tags):
    logger.info(text)
    try:
        requests.post(
            'http://overwatch.osp.opentlc.com:3000/api/annotations',
            headers = {
                "Authorization": "Bearer eyJrIjoia3VtNzR0UFd3dWNhVVo1bjhNRjdxS0F0NWV6aTRlZDAiLCJuIjoiYXBpX292ZXJ3YXRjaCIsImlkIjoxfQ=="
            },
            json = {
                "text": text,
                "tags": tags
            }
        )
    except Exception as e:
        logger.warning('Failed to annotate overwatch: %s', e)

def configure_logger():
    logger.setLevel(logging.INFO)
    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    formatter = logging.Formatter('%(asctime)s %(levelname)s - %(message)s')
    ch.setFormatter(formatter)
    logger.addHandler(ch)

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

def get_beui_deployment(namespace):
    return custom_objects_api.get_namespaced_custom_object(
        'apps', 'v1', namespace, 'deployments', 'babylon-events-ui'
    )

def get_template(namespace):
    beui_deployment = get_beui_deployment(namespace)
    template_namespace = namespace
    template_name = None
    for env_var in beui_deployment['spec']['template']['spec']['containers'][0]['env']:
        if env_var['name'] == 'CATALOG_TEMPLATE_NAME':
            template_name = env_var['value']
        elif env_var['name'] == 'CATALOG_TEMPLATE_NAMESPACE':
            template_namespace = env_var['value']
    if not template_name:
        raise Exception('Unable to find CATALOG_NAME env var for babylon-event-ui deployment')
    return template_namespace, template_name

def process_template(template_namespace, template_name):
    '''
    Use `oc` to process template and produce resource list
    '''
    oc_process_cmd = [
        'oc', 'process', template_namespace + '//' + template_name,
        '-o', 'json'
    ]
    oc_process_result = subprocess.run(oc_process_cmd, stdout=subprocess.PIPE, check=True)
    resource_list = json.loads(oc_process_result.stdout)
    if len(resource_list['items']) != 1:
        raise Exception('Template {0}//{1} did not return a single resource item'.format(template_namespace, template_name))
    return resource_list['items'][0]

def provision_one(namespace, template_namespace, template_name):
    resource_claim = process_template(template_namespace, template_name)
    resource_claim['metadata']['namespace'] = namespace
    return custom_objects_api.create_namespaced_custom_object('poolboy.gpte.redhat.com', 'v1', namespace, 'resourceclaims', resource_claim)

def check_for_result(resource_claim, tower_api):
    resource_claim = custom_objects_api.get_namespaced_custom_object('poolboy.gpte.redhat.com', 'v1', resource_claim['metadata']['namespace'], 'resourceclaims', resource_claim['metadata']['name'])
    status_resources = resource_claim.get('status', {}).get('resources', [])
    if not status_resources:
        return False
    result = 'completed'
    for status_resource in status_resources:
        anarchy_subject = status_resource['state']
        anarchy_subject_status = anarchy_subject.get('status', {})
        tower_jobs = anarchy_subject_status.get('towerJobs', {})
        provision_job = tower_jobs.get('provision', {})
        deployer_job_id = provision_job.get('deployerJob')
        launch_job_id = provision_job.get('launchJob')
        
        if provision_job.get('completeTimestamp'):
            continue
        else:
            # No result if not complete...
            result = None
            if deployer_job_id:
                tower_job = get_tower_job(tower_api, deployer_job_id)
                if tower_job['status'] in ['canceled', 'error', 'failed']:
                    logger.info("AgnosticD {0} for {1}".format(tower_job['status'], anarchy_subject['metadata']['name']))
                    logger.info("Please check https://{0}/#/jobs/playbook/{1}".format(tower_api['hostname'], deployer_job_id))
                    return resource_claim, tower_job['status']
            if launch_job_id:
                tower_job = get_tower_job(tower_api, launch_job_id)
                if tower_job['status'] in ['canceled', 'error', 'failed']:
                    logger.info("DarkTower job-runner {0} for {1}".format(tower_job['status'], anarchy_subject['metadata']['name']))
                    logger.info("Please check https://{0}/#/jobs/playbook/{1}".format(tower_api['hostname'], launch_job_id))
                    return resource_claim, tower_job['status']
    return resource_claim, result

def provision(namespace, count, concurrency, delay):
    tower_api = get_tower_api_config()
    template_namespace, template_name = get_template(namespace)
    remaining_count = count
    inprocess = {}
    result_count = {
        'canceled': 0,
        'completed': 0,
        'error': 0,
        'failed': 0,
    }

    annotate_overwatch(
        "Provision {0} with {1} instances with concurrency {2} and delay {3}".format(namespace, count, concurrency, delay),
        ['summit2020', namespace]
    )

    # Loop while there are still items to provision
    last_provision_time = 0
    polling_interval = delay if delay < 10 else 10
    while inprocess or remaining_count > 0:

        # Check for status change
        for resource_claim_name, resource_claim in inprocess.copy().items():
            resource_claim_update, result = check_for_result(resource_claim, tower_api)
            if result:
                result_count[result] += 1
                logger.info('ResourceClaim {0} {1}'.format(resource_claim_name, result))
                del inprocess[resource_claim_name]
            else:
                inprocess[resource_claim_name] = resource_claim_update
                resource_handle = resource_claim_update.get('status', {}).get('resourceHandle')
                if resource_handle and not resource_claim.get('status', {}).get('resourceHandle'):
                    logger.info('ResourceClaim {0} assigned ResourceHandle {1}'.format(resource_claim_name, resource_handle['name']))

        # Start new provision if remaining and concurrency limit allows
        if remaining_count > 0 \
        and len(inprocess) < concurrency \
        and last_provision_time < time.time() - delay:
            resource_claim = provision_one(namespace, template_namespace, template_name)
            logger.info('Created ResourceClaim {0}'.format(resource_claim['metadata']['name']))
            inprocess[resource_claim['metadata']['name']] = resource_claim
            remaining_count -= 1
            last_provision_time = time.time()
        time.sleep(polling_interval)

    annotate_overwatch(
        "Finished provision {0} with {1} instances. {2}% failed, {3}% error, {4}% canceled".format(
            namespace, count,
            round(result_count['failed'] * 100.0 / count),
            round(result_count['error'] * 100.0 / count),
            round(result_count['canceled'] * 100.0 / count) 
        ),
        ['summit2020', namespace]
    )

def main():
    if len(sys.argv) < 3 or len(sys.argv) > 5:
        sys.stderr.write("Usage: {0} <NAMESPACE> <COUNT> [CONCURRENCY] [DELAY]\n".format(sys.argv[0]))
        sys.exit(1)

    namespace = sys.argv[1]
    count = int(sys.argv[2])
    concurrency = int(sys.argv[3]) if len(sys.argv) > 3 else count
    delay = int(sys.argv[4]) if len(sys.argv) > 4 else 10
    if delay < 1:
        sys.stderr.write("Delay cannot be less than 1\n")
        sys.exit(1)
    configure_logger()
    provision(namespace, count, concurrency, delay)

if __name__ == '__main__':
    main()
