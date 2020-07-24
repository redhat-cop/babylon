#!/usr/bin/env python3

import kubernetes
import logging
import sys

beui_domain = os.environ.get('BEUI_DOMAIN', 'beui.gpte.redhat.com')
core_v1_api = kubernetes.client.CoreV1Api()
custom_objects_api = kubernetes.client.CustomObjectsApi()
kubernetes.config.load_kube_config()
logger = logging.getLogger(sys.argv[0])

def assign_lab_env(namespace, session_id):
    config_map = get_session_lab_config_map(session_id)
    if config_map:
        logger.info("Found lab env %s for %s", config_map.metadata.name, session_id)
        return

    unowned_config_maps = get_unowned_lab_config_maps()
    if not unowned_config_maps:
        logger.error("Unable to find unowned lab env for %s", session_id)
        return

def assign_lab_envs_from_file(namespace, userfile):
    with open(userfile) as fh:
        for session_id in fh:
            assign_lab_env(namespace, session_id)

def get_session_lab_config_map(namespace, session_id):
    config_maps = core_v1_api.list_namespaced_config_map(
        namespace, label_selector=beui_domain + '/session-id={0}'.format(encode_session_id(session_id))
    ).items
    if config_maps:
        return config_maps[0]
    else:
        return None

def get_unowned_lab_config_maps(namespace):
    return core_v1_api.list_namespaced_config_map(
        namespace, label_selector=beui_domain + '/session-id='
    ).items

def encode_session_id(session_id):
    return b32encode(session_id.encode('utf-8')).decode('ascii').replace('=','z')

def main():
    if len(sys.argv) != 3:
        sys.stderr.write("Usage: {0} <NAMESPACE> <USERFILE>\n".format(sys.argv[0]))
        sys.exit(1)

    namespace = sys.argv[1]
    userfile = sys.argv[2]
    assign_lab_envs_from_file(namespace, userfile)

if __name__ == '__main__':
    main()
