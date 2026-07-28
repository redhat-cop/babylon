#!/usr/bin/env python3

import argparse
import json
import logging
import os
import subprocess
import sys
import time
from base64 import b64decode
from datetime import datetime
from pprint import pprint
import urllib3

import kubernetes
from kubernetes.client import CoreV1Api, CustomObjectsApi


def setup_logging():
    logger = logging.getLogger(__name__)
    logger.setLevel(logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    formatter = logging.Formatter('%(asctime)s [%(levelname)s] %(message)s')
    handler.setFormatter(formatter)

    logger.addHandler(handler)

    return logger
    

def fetch_governors(api: CustomObjectsApi) -> list:
    response = api.list_cluster_custom_object(
        'anarchy.gpte.redhat.com',
        'v1',
        'anarchygovernors'
    )

    return response.get('items', [])


def get_governor_roles(governor: dict) -> list:
    roles = governor['spec'].get('ansibleGalaxyRequirements', {}).get('roles', [])
    return [role for role in roles if role['name'] == 'babylon_anarchy_governor']


def count_versions(governors: list) -> dict:
    versions = {}

    for governor in governors:
        for role in get_governor_roles(governor):
            version = role['version']
            versions[version] = versions.get(version, 0) + 1

    return versions


def main():
    parser = argparse.ArgumentParser(description='Count the versions of the babylon_anarchy_governor role')
    parser.add_argument('--namespace', default='default', help='Kubernetes namespace to query')
    args = parser.parse_args()

    kubernetes.config.load_kube_config()
    core_api = CoreV1Api()
    custom_api = CustomObjectsApi()

    governors = fetch_governors(custom_api)

    versions = count_versions(governors)

    logger = setup_logging()

    logger.info(f"Versions summary:\n{versions}")



if __name__ == '__main__':
    main()
