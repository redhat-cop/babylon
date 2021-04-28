#!/usr/bin/env python
import kubernetes
kubernetes.config.load_kube_config()

core_v1_api = kubernetes.client.CoreV1Api()

api_client = kubernetes.client.ApiClient()
#api_client.default_headers['Impersonate-User'] = 'bob'
#api_client.default_headers['Impersonate-Group'] = session['groups']

namespaces = {}
for ns in core_v1_api.list_namespace(label_selector='babylon.gpte.redhat.com/catalog').items:
    (data, status, headers) = api_client.call_api(
        '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews',
        'POST',
        auth_settings = ['BearerToken'],
        collection_formats = {'Impersonate-Group': 'multi'},
        body = {
           "apiVersion": "authorization.k8s.io/v1",
           "kind": "SelfSubjectAccessReview",
           "spec": {
             "resourceAttributes": {
               "group": "babylon.gpte.redhat.com",
               "resource":"catalogitems",
               "verb":"list",
               "namespace": ns.metadata.name
             }
           },
           "status": {
             "allowed": False
           }
        },
        header_params = [],
        query_params = [],
        response_type = 'object',
    )
    if data.get('status', {}).get('allowed', False):
       namespaces[ns.metadata.name] = {
           'displayName': ns.metadata.annotations.get('babylon.gpte.redhat.com/display-name', ns.metadata.name),
           'description': ns.metadata.annotations.get('babylon.gpte.redhat.com/description', 'Catalog')
       }


print(namespaces)
