#!/usr/bin/env python3

import flask
import json
import kubernetes
import openstack
import os
import pathlib
import random
import re
import redis
import string
import urllib3

from base64 import b64decode
from hotfix import HotfixKubeApiClient
from retrying import retry
from simple_salesforce import Salesforce, format_soql
from simple_salesforce.exceptions import SalesforceMalformedRequest
import requests
from datetime import datetime

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def random_string(length):
    return ''.join([random.choice(string.ascii_letters + string.digits) for n in range(length)])

application = flask.Flask('babylon-api', static_url_path='/ui')
babylon_namespace = os.environ.get('BABYLON_NAMESPACE')
interface_name = os.environ.get('INTERFACE_NAME');
redis_connection = None
session_cache = {}
session_lifetime = int(os.environ.get('SESSION_LIFETIME', 600))
ratings_api = os.environ.get('RATINGS_API', 'http://babylon-ratings.babylon-ratings.svc.cluster.local:8080')
admin_api = os.environ.get('ADMIN_API', 'http://babylon-admin.babylon-admin.svc.cluster.local:8080')

if 'REDIS_PASSWORD' in os.environ:
    redis_connection = redis.StrictRedis(
        host = os.environ.get('REDIS_SERVER', 'redis'),
        port = int(os.environ.get('REDIS_PORT', 6379)),
        password = os.environ.get('REDIS_PASSWORD'),
        charset = 'utf-8',
        db = 0,
        decode_responses = True,
    )

if os.path.exists('/var/run/secrets/kubernetes.io/serviceaccount/namespace'):
    kubernetes.config.load_incluster_config()
    if not babylon_namespace:
        with open('/run/secrets/kubernetes.io/serviceaccount/namespace') as f:
            babylon_namespace = f.read()
else:
    kubernetes.config.load_kube_config()

core_v1_api = kubernetes.client.CoreV1Api()
custom_objects_api = kubernetes.client.CustomObjectsApi()

console_url = core_v1_api.read_namespaced_config_map('console-public', 'openshift-config-managed').data['consoleURL']

def openshift_auth_user():
    user = custom_objects_api.get_cluster_custom_object(
        'user.openshift.io', 'v1', 'users', '~'
    )
    return(user['metadata']['name'])

def proxy_user():
    email = flask.request.headers.get('X-Forwarded-Email')
    user = flask.request.headers.get('X-Forwarded-User')
    # In development get user from authentication
    if not user and os.environ.get('ENVIRONMENT') == 'development':
        user = openshift_auth_user()
    if not user:
        flask.abort(401, description="No X-Forwarded-User header")

    if email:
        try:
            return custom_objects_api.get_cluster_custom_object(
                'user.openshift.io', 'v1', 'users', email
            )
        except kubernetes.client.rest.ApiException as e:
            if e.status != 404:
                raise

    try:
        return custom_objects_api.get_cluster_custom_object(
            'user.openshift.io', 'v1', 'users', user
        )
    except kubernetes.client.rest.ApiException as e:
        if e.status != 404:
            raise

    flask.abort(401, description=f"Unable to find user by name ({user}) or email ({email})")

def proxy_api_client(session):
    api_client = HotfixKubeApiClient()
    if os.environ.get('ENVIRONMENT') == 'development':
        return api_client
    api_client.default_headers['Impersonate-User'] = session['user']
    for group in session['groups']:
        api_client.default_headers.add('Impersonate-Group', group)
    return api_client

def get_user_groups(user):
    user_name = user['metadata']['name'] if isinstance(user, dict) else user
    user_groups = []
    for group in custom_objects_api.list_cluster_custom_object(
        'user.openshift.io', 'v1', 'groups'
    ).get('items', []):
        if user_name in group.get('users', []):
            user_groups.append(group['metadata']['name'])
    return user_groups

def start_user_session(user, groups):
    session = {
        'user': user['metadata']['name'],
        'groups': groups,
        'roles': []
    }

    api_client = proxy_api_client(session)
    if check_admin_access(api_client):
        session['admin'] = True
    elif check_user_support_access(api_client):
        session['roles'].append('userSupport')

    token = random_string(32)
    if redis_connection:
        redis_connection.setex(token, session_lifetime, json.dumps(session, separators=(',',':')))
    else:
        session_cache[token] = session

    return api_client, session, token

def get_user_session(user):
    authentication_header = flask.request.headers.get('Authentication')
    if not authentication_header:
        flask.abort(401, description='No Authentication header')
    if not authentication_header.startswith('Bearer '):
        flask.abort(401, description='Authentication header is not a bearer token')
    token = authentication_header[7:]

    session = None
    if redis_connection:
        session_json = redis_connection.get(token)
        if session_json:
            session = json.loads(session_json)
    else:
        session = session_cache.get(token)

    if not session:
        flask.abort(401, description='Invalid bearer token, no session for token')
    elif session.get('user') != user['metadata']['name']:
        flask.abort(401, description='Invalid bearer token, user mismatch')
    return session

def check_admin_access(api_client):
    """
    Check and return true if api_client is configured with babylon admin access.
    Access is determined by whether the user can directly manage AnarchySubjects.
    """
    (data, status, headers) = api_client.call_api(
        '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews',
        'POST',
        auth_settings = ['BearerToken'],
        body = {
           "apiVersion": "authorization.k8s.io/v1",
           "kind": "SelfSubjectAccessReview",
           "spec": {
             "resourceAttributes": {
               "group": "anarchy.gpte.redhat.com",
               "resource": "anarchysubjects",
               "verb": "patch",
             }
           },
           "status": {
             "allowed": False
           }
        },
        response_type = 'object',
    )
    return data.get('status', {}).get('allowed', False)

def check_user_support_access(api_client):
    """
    Check and return true if api_client is configured with babylon admin access.
    Access is determined by whether the user can manage ResourceClaims in any namespace.
    """
    (data, status, headers) = api_client.call_api(
        '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews',
        'POST',
        auth_settings = ['BearerToken'],
        body = {
           "apiVersion": "authorization.k8s.io/v1",
           "kind": "SelfSubjectAccessReview",
           "spec": {
             "resourceAttributes": {
               "group": "poolboy.gpte.redhat.com",
               "resource": "resourceclaims",
               "verb": "patch",
             }
           },
           "status": {
             "allowed": False
           }
        },
        response_type = 'object',
    )
    return data.get('status', {}).get('allowed', False)

def get_catalog_namespaces(api_client):
    namespaces = []
    for ns in core_v1_api.list_namespace(
        label_selector = f"babylon.gpte.redhat.com/interface={interface_name}" if interface_name else 'babylon.gpte.redhat.com/catalog'
    ).items:
        (data, status, headers) = api_client.call_api(
            '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews',
            'POST',
            auth_settings = ['BearerToken'],
            body = {
               "apiVersion": "authorization.k8s.io/v1",
               "kind": "SelfSubjectAccessReview",
               "spec": {
                 "resourceAttributes": {
                   "group": "babylon.gpte.redhat.com",
                   "resource": "catalogitems",
                   "verb": "list",
                   "namespace": ns.metadata.name
                 }
               },
               "status": {
                 "allowed": False
               }
            },
            response_type = 'object',
        )
        if data.get('status', {}).get('allowed', False):
            namespaces.append({
                'name': ns.metadata.name,
                'displayName': ns.metadata.annotations.get('openshift.io/display-name', ns.metadata.name),
                'description': ns.metadata.annotations.get('openshift.io/description', 'Catalog')
            })
    return namespaces

def get_resource_claim_as_proxy_user(namespace, name):
    user = proxy_user()
    session = get_user_session(user)
    api_client = proxy_api_client(session)

    impersonate_user = flask.request.headers.get('Impersonate-User')
    if impersonate_user and check_admin_access(api_client):
        api_client.default_headers['Impersonate-User'] = impersonate_user
        api_client.default_headers.discard('Impersonate-Group')
        for group in get_user_groups(impersonate_user):
            api_client.default_headers.add('Impersonate-Group', group)

    user_custom_objects_api = kubernetes.client.CustomObjectsApi(api_client=api_client)

    try:
        return user_custom_objects_api.get_namespaced_custom_object(
            'poolboy.gpte.redhat.com', 'v1', namespace, 'resourceclaims', name
        )
    except kubernetes.client.rest.ApiException as e:
        if e.body:
            resp = flask.make_response(e.body, e.status)
            resp.headers['Content-Type'] = 'application/json'
            flask.abort(resp)
        else:
            flask.abort(flask.make_response(flask.jsonify({"reason": e.reason}), e.status))

def get_service_namespaces(api_client, user_namespace):
    namespaces = [user_namespace]

    # FIXME - Add logic for finding service namespaces for this user

    return namespaces

def get_user_namespace(user, api_client):
    user_uid = user['metadata']['uid']

    for ns in core_v1_api.list_namespace(label_selector='usernamespace.gpte.redhat.com/user-uid=' + user_uid).items:
        name = ns.metadata.name
        requester = ns.metadata.annotations.get('openshift.io/requester')
        display_name = ns.metadata.annotations.get('openshift.io/display-name', 'User ' + requester)

        return {
            'name': name,
            'displayName': display_name,
            'requester': requester,
        }

    return None

def openstack_connection_from_secret(secret):
    osp_auth_password = json.loads(b64decode(secret.data['osp_auth_password']).decode('utf8'))
    osp_auth_project_domain = json.loads(b64decode(secret.data['osp_auth_project_domain']).decode('utf8'))
    osp_auth_url = json.loads(b64decode(secret.data['osp_auth_url']).decode('utf8'))
    osp_auth_user_domain = json.loads(b64decode(secret.data['osp_auth_user_domain']).decode('utf8'))
    osp_auth_username = json.loads(b64decode(secret.data['osp_auth_username']).decode('utf8'))

    return openstack.connection.Connection(
        auth=dict(
            auth_url = osp_auth_url,
            password = osp_auth_password,
            username = osp_auth_username,
            project_domain_name = osp_auth_project_domain,
            user_domain_name = osp_auth_user_domain,
        ),
        identity_api_version = 3,
    )

def resolve_openstack_subjects(resource_claim):
    openstack_apis = {}
    subjects = []
    for resource in resource_claim.get('status', {}).get('resources', []):
        resource_name = resource.get('name')
        resource_state = resource.get('state')
        if not resource_state:
            continue
        if resource_state.get('kind') != 'AnarchySubject':
            continue
        subject_vars = resource_state.get('spec', {}).get('vars')
        if not subject_vars:
            continue
        job_vars = subject_vars.get('job_vars')
        if not job_vars:
            continue
        uuid = job_vars.get('uuid')
        if not uuid:
            continue
        subject = {
            "name": resource_state['metadata']['name'],
            "uuid": uuid,
        }
        if resource_name:
            subject['resourceName'] = resource_name
        provision_data = subject_vars.get('provision_data')
        openstack_auth_url = provision_data.get('openstack_auth_url') \
            or provision_data.get('osp_auth_url') \
            or provision_data.get('osp_cluster_api')
        if not openstack_auth_url:
            continue
        api_url_match = re.match(r'^https://api\.([^.]+).*', openstack_auth_url)
        if not api_url_match:
            continue
        openstack_cluster_name = api_url_match.group(1)
        openstack_api = openstack_apis.get(openstack_cluster_name)
        if not openstack_api:
            cluster_secret_name = f"openstack-{api_url_match.group(1)}-secret"
            try:
                secret = core_v1_api.read_namespaced_secret(cluster_secret_name, 'gpte')
            except kubernetes.client.rest.ApiException as e:
                if e.status == 404:
                    continue
                else:
                    raise
            openstack_api = openstack_connection_from_secret(secret)
            openstack_apis[openstack_cluster_name] = openstack_api
        openstack_projects = openstack_api.identity.projects(tags=f"uuid={uuid}")
        if not openstack_projects:
            continue
        subject['openstack_api'] = openstack_api
        subject['openstack_projects'] = [p for p in openstack_projects]
        subjects.append(subject)
    return(subjects)

def api_proxy(method, url, headers, data = None, params = None):
    resp = requests.request(method=method, url=url,
        headers={key: value for (key, value) in headers if key != 'Host'},
        data=data,
        params=params,
        allow_redirects=False)
    excluded_headers = ['content-encoding', 'content-length', 'transfer-encoding', 'connection', 
    'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'upgrade']
    headers = [(name, value) for (name, value) in resp.raw.headers.items()
               if name.lower() not in excluded_headers]

    response = flask.Response(resp.content, resp.status_code, headers)
    return response

@retry(stop_max_attempt_number=3, wait_exponential_multiplier=500, wait_exponential_max=5000)
def salesforce_connection():
    # Cannot read salesforce secret without babylon namespace value
    if not babylon_namespace:
        flask.abort(400)

    sfdc_instance = sfdc_consumer_key = sfdc_privatekey = sfdc_username = None

    try:
        sfdc_secret = core_v1_api.read_namespaced_secret(
            os.environ.get('SALESFORCE_SECRET', 'salesforce'),
            babylon_namespace
        )
        sfdc_consumer_key = b64decode(sfdc_secret.data['consumer_key']).decode('utf8')
        sfdc_instance = b64decode(sfdc_secret.data['instance']).decode('utf8')
        sfdc_privatekey = b64decode(sfdc_secret.data['privatekey']).decode('utf8')
        sfdc_username = b64decode(sfdc_secret.data['username']).decode('utf8')
    except kubernetes.client.rest.ApiException as e:
        if e.status != 404:
            flask.abort(400)

    try:
        session = requests.Session()
        sf = Salesforce(instance=sfdc_instance,
                        consumer_key=sfdc_consumer_key,
                        privatekey=sfdc_privatekey,
                        username=sfdc_username,
                        client_id="PFE Babylon API", session=session)
        return sf
    except Exception as e:
        flask.abort(400)


@retry(stop_max_attempt_number=3, wait_exponential_multiplier=500, wait_exponential_max=5000)
def salesforce_validation(salesforce_id):
    opportunity_info = {}
    salesforce_id = str(salesforce_id).strip()
    salesforce_type = 'opportunity'

    if redis_connection:
        opportunity_json = redis_connection.get("salesforce_" + salesforce_id)
        if opportunity_json:
            opportunity_info = json.loads(opportunity_json)
            salesforce_type = opportunity_info.get('salesforce_type', 'opportunity')

    if not opportunity_info:
        salesforce_api = salesforce_connection()

        # if opportunity_id starts with PR it's a project id
        if salesforce_id.startswith('PR'):
            salesforce_type = 'project'
            opportunity_query = format_soql("SELECT Id, pse__Start_Date__c, pse__End_Date__c, "
                                            "pse__Is_Active__c, pse__Project_ID__c "
                                            "FROM pse__Proj__c "
                                            "WHERE pse__Is_Active__c = true AND pse__Project_ID__c = {}",
                                            salesforce_id)
        # If opportunity_id starts with 701 it's a campaign number/id
        elif salesforce_id.startswith('701'):
            salesforce_type = 'campaign'
            opportunity_query = format_soql("SELECT "
                                            "  Id, StartDate, EndDate, IsActive "
                                            "FROM Campaign "
                                            "WHERE Id = {}", salesforce_id)
        else:
            salesforce_type = 'opportunity'
            opportunity_query = format_soql("SELECT "
                                            "  Id, Name, AccountId, IsClosed, "
                                            "  CloseDate, StageName, OpportunityNumber__c "
                                            "FROM Opportunity "
                                            "WHERE OpportunityNumber__c = {} AND IsClosed = false", salesforce_id)
            try: 
                opp_results = salesforce_api.query(opportunity_query)
                totalSize = opp_results.get('totalSize', 0)
                if totalSize == 0:
                    salesforce_type = 'cdh'
                    opportunity_query = format_soql("SELECT "
                                            "  Id, CDHPartyNumber__c "
                                            "FROM Account "
                                            "WHERE CDHPartyNumber__c = {}", str(salesforce_id))
            except SalesforceMalformedRequest:
                flask.abort(404, description='Invalid SalesForce Request')
        try:
            opp_results = salesforce_api.query(opportunity_query)
            opportunity_info['totalSize'] = opp_results.get('totalSize', 0)
            for i in opp_results['records']:
                if 'attributes' in i:
                    del i['attributes']
                opportunity_info.update(i)
                opportunity_info['salesforce_type'] = salesforce_type
                if salesforce_type == 'opportunity':
                    # Rename custom field to be readable
                    opportunity_info['Number'] = opportunity_info.pop('OpportunityNumber__c')

        except SalesforceMalformedRequest:
            flask.abort(404, description='Invalid SalesForce Request')

    saleforce_valid = opportunity_info.get('totalSize', 0)

    if redis_connection:
        redis_connection.setex("salesforce_" + salesforce_id, session_lifetime, json.dumps(opportunity_info))

    # If the opportunity not found in SFDC that means its invalid opportunity number
    if saleforce_valid == 0:
        return False
    else:
        if salesforce_type == 'campaign':
            # Business rules for a invalid Campaign
            # if IsActive is false
            current_date = datetime.utcnow().strftime("%Y-%m-%d")
            end_date = opportunity_info.get('EndDate')
            is_active = opportunity_info.get('IsActive', False)
            if not is_active or current_date > end_date:
                return False
        elif salesforce_type == 'cdh':
            return True
        elif salesforce_type == 'project':
            is_active = opportunity_info.get('pse__Is_Active__c', False)
            if not is_active:
                return False
        else:
            # Business rules for invalid opportunity:
            # If the opportunity is Closed
            # If the current date is more than the CloseDate
            # If opportunity's stage in Closed Booked, Closed Lost or Closed On
            current_date = datetime.utcnow().strftime("%Y-%m-%d")
            is_closed = opportunity_info.get('IsClosed', False)
            close_date = opportunity_info.get('CloseDate')
            stage_name = opportunity_info.get('StageName')
            if is_closed or current_date > close_date or \
                    stage_name in ('Closed Booked', 'Closed Lost', 'Closed Won'):
                return False

        return True


@application.route("/auth/session")
def get_auth_session():
    user = proxy_user()
    groups = get_user_groups(user)
    api_client, session, token = start_user_session(user, groups)
    catalog_namespaces = get_catalog_namespaces(api_client)
    user_is_admin = session.get('admin', False)
    roles = session.get('roles', [])
    user_namespace = get_user_namespace(user, api_client)
    service_namespaces = get_service_namespaces(
        api_client,
        user_namespace,
    )
    ret = {
        "admin": user_is_admin,
        "consoleURL": console_url,
        "groups": groups,
        "user": user['metadata']['name'],
        "token": token,
        "catalogNamespaces": catalog_namespaces,
        "lifetime": session_lifetime,
        "serviceNamespaces": service_namespaces,
        "userNamespace": user_namespace,
        "roles": roles,
    }
    if not user_is_admin:
        ret['quota'] = {
            "services": 3,
        }
    if interface_name:
        ret['interface'] = interface_name

    return flask.jsonify(ret)

@application.route("/auth/users/<user_name>")
def get_auth_users_info(user_name):
    puser = proxy_user()
    session = get_user_session(puser)
    api_client = proxy_api_client(session)

    if not check_admin_access(api_client):
        flask.abort(403)

    test_api_client = HotfixKubeApiClient()
    test_api_client.default_headers['Impersonate-User'] = user_name
    groups = get_user_groups(user_name)
    for group in groups:
        test_api_client.default_headers.add('Impersonate-Group', group)
    user_is_admin = check_admin_access(test_api_client)
    roles = []
    if not user_is_admin:
        if check_user_support_access(test_api_client):
            roles.append('userSupport')

    try:
        user = custom_objects_api.get_cluster_custom_object(
            'user.openshift.io', 'v1', 'users', user_name
        )
    except kubernetes.client.rest.ApiException as e:
        if e.status == 404:
            flask.abort(404)
        else:
            raise

    catalog_namespaces = get_catalog_namespaces(test_api_client)
    user_namespace = get_user_namespace(user, test_api_client)
    service_namespaces = get_service_namespaces(
        test_api_client,
        user_namespace,
    )

    ret = {
        "admin": user_is_admin,
        "groups": groups,
        "roles": roles,
        "user": user_name,
        "catalogNamespaces": catalog_namespaces,
        "serviceNamespaces": service_namespaces,
        "userNamespace": user_namespace,
    }
    if not user_is_admin:
        ret['quota'] = {
            "services": 3,
        }
    return flask.jsonify(ret)

@application.route("/api/service/<service_namespace>/<service_name>/openstack/servers", methods=['GET'])
def service_openstack_servers(service_namespace, service_name):
    resource_claim = get_resource_claim_as_proxy_user(service_namespace, service_name)
    subjects = resolve_openstack_subjects(resource_claim)
    for subject in subjects:
        subject['openStackServers'] = []
        openstack_api = subject.pop('openstack_api')
        openstack_projects = subject.pop('openstack_projects')
        for project in openstack_projects:
            for server in openstack_api.compute.servers(all_tenants=1, project_id=project.id):
                subject['openStackServers'].append(server.to_dict())
    return flask.jsonify(subjects)

@application.route("/api/service/<service_namespace>/<service_name>/openstack/server/<project_id>/<server_id>/console", methods=['POST'])
def service_openstack_server_console(service_namespace, service_name, project_id, server_id):
    resource_claim = get_resource_claim_as_proxy_user(service_namespace, service_name)
    subjects = resolve_openstack_subjects(resource_claim)
    for subject in subjects:
        openstack_api = subject.pop('openstack_api')
        openstack_projects = subject.pop('openstack_projects')
        for project in openstack_projects:
            if project.id == project_id:
                server = openstack_api.compute.find_server(server_id)
                if not server:
                    flask.abort(404)
                if server.project_id != project_id:
                    flask.abort(403)
                if server.status != 'ACTIVE':
                    flask.abort(409)
                resp = openstack_api.session.post(
                    f"/servers/{server.id}/action",
                    json = {'os-getVNCConsole': {'type': 'novnc'}},
                    headers = {'Accept': 'application/json'},
                    endpoint_filter = {'service_type': 'compute'}
                )
                return resp.content
    flask.abort(404)

@application.route("/api/service/<service_namespace>/<service_name>/openstack/server/<project_id>/<server_id>/reboot", methods=['POST'])
def service_openstack_server_reboot(service_namespace, service_name, project_id, server_id):
    request_data = flask.request.get_json()
    resource_claim = get_resource_claim_as_proxy_user(service_namespace, service_name)
    subjects = resolve_openstack_subjects(resource_claim)
    for subject in subjects:
        openstack_api = subject.pop('openstack_api')
        openstack_projects = subject.pop('openstack_projects')
        for project in openstack_projects:
            if project.id == project_id:
                server = openstack_api.compute.find_server(server_id)
                if not server:
                    flask.abort(404)
                if server.project_id != project_id:
                    flask.abort(403)
                openstack_api.compute.reboot_server(
                    server,
                    reboot_type = request_data.get('rebootType', 'HARD'),
                )
                return flask.jsonify({"success": True})
    flask.abort(404)

@application.route("/api/service/<service_namespace>/<service_name>/openstack/server/<project_id>/<server_id>/start", methods=['POST'])
def service_openstack_server_start(service_namespace, service_name, project_id, server_id):
    resource_claim = get_resource_claim_as_proxy_user(service_namespace, service_name)
    subjects = resolve_openstack_subjects(resource_claim)
    for subject in subjects:
        openstack_api = subject.pop('openstack_api')
        openstack_projects = subject.pop('openstack_projects')
        for project in openstack_projects:
            if project.id == project_id:
                server = openstack_api.compute.find_server(server_id)
                if not server:
                    flask.abort(404)
                if server.project_id != project_id:
                    flask.abort(403)
                openstack_api.compute.start_server(server)
                return flask.jsonify({"success": True})
    flask.abort(404)

@application.route("/api/service/<service_namespace>/<service_name>/openstack/server/<project_id>/<server_id>/stop", methods=['POST'])
def service_openstack_server_stop(service_namespace, service_name, project_id, server_id):
    resource_claim = get_resource_claim_as_proxy_user(service_namespace, service_name)
    subjects = resolve_openstack_subjects(resource_claim)
    for subject in subjects:
        openstack_api = subject.pop('openstack_api')
        openstack_projects = subject.pop('openstack_projects')
        for project in openstack_projects:
            if project.id == project_id:
                server = openstack_api.compute.find_server(server_id)
                if not server:
                    flask.abort(404)
                if server.project_id != project_id:
                    flask.abort(403)
                openstack_api.compute.stop_server(server)
                return flask.jsonify({"success": True})
    flask.abort(404)

@application.route("/api/<path:path>", methods=['GET', 'PUT', 'POST', 'PATCH', 'DELETE'])
@application.route("/apis/<path:path>", methods=['GET', 'PUT', 'POST', 'PATCH', 'DELETE'])
def apis_proxy(path):
    user = proxy_user()
    session = get_user_session(user)
    api_client = proxy_api_client(session)

    impersonate_user = flask.request.headers.get('Impersonate-User')
    if impersonate_user and check_admin_access(api_client):
        api_client.default_headers['Impersonate-User'] = impersonate_user
        api_client.default_headers.discard('Impersonate-Group')
        for group in get_user_groups(impersonate_user):
            api_client.default_headers.add('Impersonate-Group', group)

    header_params = {}
    if flask.request.headers.get('Accept'):
        header_params['Accept'] = flask.request.headers['Accept']
    if flask.request.content_type:
        header_params['Content-Type'] = flask.request.content_type
    try:
        (data, status, headers) = api_client.call_api(
            flask.request.path,
            flask.request.method,
            auth_settings = ['BearerToken'],
            body = flask.request.json,
            header_params = header_params,
            query_params = [ (k, v) for k, v in flask.request.args.items() ],
            response_type = 'object',
        )
        # Strip out metadata.managedFields
        if 'managedFields' in data.get('metadata', {}):
            del data['metadata']['managedFields']
        for item in data.get('items', []):
            if 'managedFields' in item.get('metadata', {}):
                del item['metadata']['managedFields']
        return flask.make_response(
            json.dumps(data, separators=(',',':')),
            status,
            [(k, v) for k, v in headers.items() if k not in ('Content-Length', 'Transfer-Encoding')]
        )
    except kubernetes.client.rest.ApiException as e:
        if e.body:
            resp = flask.make_response(e.body, e.status)
            resp.headers['Content-Type'] = 'application/json'
            flask.abort(resp)
        else:
            flask.abort(flask.make_response(flask.jsonify({"reason": e.reason}), e.status))


@application.route("/api/salesforce/opportunity/<opportunity_id>", methods=['GET'])
def salesforce_opportunity(opportunity_id):
    if salesforce_validation(opportunity_id):
        return flask.jsonify({"success": True})
    flask.abort(404)

@application.route("/api/ratings/request/<request_uid>", methods=['POST'])
def provision_rating_set(request_uid):
    user = proxy_user()
    data = flask.request.get_json()
    data["email"] = user['metadata']['name']
    return api_proxy(method="POST", url=f"{ratings_api}/api/ratings/v1/request/{request_uid}", data=json.dumps(data), headers=flask.request.headers)

@application.route("/api/ratings/request/<request_uid>", methods=['GET'])
def provision_rating_get(request_uid):
    user = proxy_user()
    email = user['metadata']['name']
    return api_proxy(method="GET", url=f"{ratings_api}/api/ratings/v1/request/{request_uid}/email/{email}", headers=flask.request.headers)

@application.route("/api/ratings/catalogitem/<asset_uuid>/history", methods=['GET'])
def provision_rating_get_history(asset_uuid):
    user = proxy_user()
    session = get_user_session(user)
    api_client = proxy_api_client(session)
    if not check_admin_access(api_client):
        flask.abort(403)
    return api_proxy(method="GET", url=f"{ratings_api}/api/ratings/v1/catalogitem/{asset_uuid}/history", headers=flask.request.headers)

@application.route("/api/admin/incidents", methods=['GET'])
def incidents_get():
    return api_proxy(method="GET", url=f"{admin_api}/api/admin/v1/incidents", params=flask.request.args, headers=flask.request.headers)

@application.route("/api/admin/incidents", methods=['POST'])
def create_incident():
    data = flask.request.get_json()
    return api_proxy(method="POST", url=f"{admin_api}/api/admin/v1/incidents", data=json.dumps(data), headers=flask.request.headers)

@application.route("/api/admin/incidents/<incident_id>", methods=['POST'])
def update_incident(incident_id):
    data = flask.request.get_json()
    return api_proxy(method="POST", url=f"{admin_api}/api/admin/v1/incidents/{incident_id}", data=json.dumps(data), headers=flask.request.headers)

@application.route("/api/workshop/<workshop_id>", methods=['GET'])
def workshop_get(workshop_id):
    """
    Fetch workshop for a workshop attendee in order to present overview.
    """
    workshop_list = custom_objects_api.list_cluster_custom_object(
        'babylon.gpte.redhat.com', 'v1', 'workshops',
        label_selector=f"babylon.gpte.redhat.com/workshop-id={workshop_id}"
    )
    if not workshop_list.get('items'):
        flask.abort(404)
    workshop = workshop_list['items'][0]
    ret = {
        "accessPasswordRequired": True if workshop['spec'].get('accessPassword') else False,
        "description": workshop['spec'].get('description'),
        "displayName": workshop['spec'].get('displayName'),
        "name": workshop['metadata']['name'],
        "namespace": workshop['metadata']['namespace'],
        "template": workshop['metadata'].get('annotations', {}).get('demo.redhat.com/user-message-template') 
            or workshop['metadata'].get('annotations', {}).get('demo.redhat.com/info-message-template')
    }
    return flask.jsonify(ret)

@application.route("/api/workshop/<workshop_id>", methods=['PUT'])
def workshop_put(workshop_id):
    """
    Access workshop as an attendee with login information.
    """
    if not flask.request.json:
        flask.abort(400)
    access_password = flask.request.json.get('accessPassword')
    email = flask.request.json.get('email')
    if not email:
        flask.abort(400)

    workshop_list = custom_objects_api.list_cluster_custom_object(
        'babylon.gpte.redhat.com', 'v1', 'workshops',
        label_selector=f"babylon.gpte.redhat.com/workshop-id={workshop_id}"
    )
    if not workshop_list.get('items'):
        flask.abort(404)
    workshop = workshop_list['items'][0]
    workshop_access_password = workshop['spec'].get('accessPassword')
    workshop_name = workshop['metadata']['name']
    workshop_namespace = workshop['metadata']['namespace']
    workshop_open_registration = workshop['spec'].get('openRegistration', True)

    if access_password:
        if access_password != workshop_access_password:
            flask.abort(403)
    elif workshop_access_password:
        flask.abort(400)

    ret = {
        "accessPasswordRequired": True if workshop_access_password else False,
        "labUserInterfaceRedirect": workshop['spec'].get('labUserInterface', {}).get('redirect'),
        "description": workshop['spec'].get('description'),
        "displayName": workshop['spec'].get('displayName'),
        "name": workshop_name,
        "namespace": workshop_namespace,
        "template": workshop['metadata'].get('annotations', {}).get('demo.redhat.com/user-message-template')
            or workshop['metadata'].get('annotations', {}).get('demo.redhat.com/info-message-template')
    }

    while not 'assignment' in ret:
        for user_assignment in workshop['spec'].get('userAssignments', []):
            if email == user_assignment.get('assignment', {}).get('email'):
                ret['assignment'] = user_assignment
                break
        else:
            if not workshop_open_registration:
                flask.abort(409)
            try:
                for user_assignment in workshop['spec'].get('userAssignments', []):
                    if not 'assignment' in user_assignment:
                        user_assignment['assignment'] = {"email": email}
                        workshop = custom_objects_api.replace_namespaced_custom_object(
                            'babylon.gpte.redhat.com', 'v1', workshop_namespace, 'workshops', workshop_name, workshop
                        )
                        ret['assignment'] = user_assignment
                        break
                else:
                    flask.abort(409)
            except kubernetes.client.rest.ApiException as e:
                if e.status == 409:
                    # Conflict, get latest version and retry assignment of user email
                    workshop = custom_objects_api.get_namespaced_custom_object(
                        'babylon.gpte.redhat.com', 'v1', workshop_namespace, 'workshops', name, workshop
                    )
                else:
                    raise

    return flask.jsonify(ret)

if __name__ == "__main__":
    application.run()
