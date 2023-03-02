#!/usr/bin/env python3

import sys
import kubernetes
from pprint import pprint

kubernetes.config.load_kube_config()

custom_objects_api = kubernetes.client.CustomObjectsApi()

response_governors = custom_objects_api.list_cluster_custom_object(
    'anarchy.gpte.redhat.com',
    'v1',
    'anarchygovernors')


governors = response_governors['items']

versions = {}

for governor in governors:
    name = governor['metadata']['name']
    if 'ansibleGalaxyRequirements' in governor['spec']:
        if 'roles' in governor['spec']['ansibleGalaxyRequirements']:
            for role in governor['spec']['ansibleGalaxyRequirements']['roles']:
                if role['name'] == 'babylon_anarchy_governor':
                    if role['version'] not in versions:
                        versions[role['version']] = 1
                    else:
                        versions[role['version']] += 1


# Print versions summary using prettyprint

pprint(versions)
