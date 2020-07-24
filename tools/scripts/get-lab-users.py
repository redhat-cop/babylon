#!/usr/bin/env python3

import kubernetes
import re
import sys
from base64 import b64decode
import binascii

kubernetes.config.load_kube_config()
core_v1_api = kubernetes.client.CoreV1Api()

namespace = sys.argv[1]

pod = core_v1_api.list_namespaced_pod(namespace, label_selector='app=babylon-events,component=ui').items[0]

emails = {}
success_resp_code = "200"
for line in core_v1_api.read_namespaced_pod_log(pod.metadata.name, namespace).splitlines():
    m = re.match(r'^([^ ]+).*\[(.*)\].*/l/([^ ]+).* (\d\d\d) .*', line)
    if m:
       (ip, datetime, email_b64, resp_code) = m.groups()
       try:
           email = b64decode(email_b64.encode('utf-8')).decode('utf-8')
       except (binascii.Error, UnicodeDecodeError):
           sys.stderr.write("Bad base64: {0}\n".format(line))
       if resp_code == "302":
           success_resp_code = "302"
       if email in emails:
           if resp_code != '404' and emails[email]['resp_code'] != '302':
               emails[email]['resp_code'] = resp_code
           emails[email]['ip'] = ip
       else:
           emails[email] = {
               "datetime": datetime,
               "ip": ip,
               "resp_code": resp_code
           }

for email in sorted(emails.keys()):
    info = emails[email]
    if info['resp_code'] == success_resp_code:
        status = 'accessed lab'
    elif info['resp_code'] == '200':
        status = 'did not start'
    else:
        status = 'denied access'
    print("{0}\t{1}\t{2}\t{3}".format(info['datetime'], info['ip'], email, status))
