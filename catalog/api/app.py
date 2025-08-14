#!/usr/bin/env python3

import asyncio
import copy
import gzip
import json
import logging
import os
import re

import aiohttp
from aiohttp import web
import time

import kubernetes_asyncio
import redis.asyncio as redis
from hotfix import HotfixKubeApiClient
from randomstring import random_string

app_api_client = core_v1_api = custom_objects_api = None
console_url = None
redis_connection = None
babylon_namespace = os.environ.get('BABYLON_NAMESPACE')
interface_name = os.environ.get('INTERFACE_NAME');
groups = []
groups_last_update = 0
admin_api = os.environ.get('ADMIN_API', 'http://babylon-admin.babylon-admin.svc.cluster.local:8080')
ratings_api = os.environ.get('RATINGS_API', 'http://babylon-ratings.babylon-ratings.svc.cluster.local:8080')
reporting_api = os.environ.get('SALESFORCE_API', 'http://reporting-api.demo-reporting.svc.cluster.local:8080')
sandbox_api = os.environ.get('SANDBOX_API', 'http://sandbox-api.babylon-sandbox-api.svc.cluster.local:8080')
sandbox_api_authorization_token = os.environ.get('SANDBOX_AUTHORIZATION_TOKEN')
reporting_api_authorization_token = os.environ.get('SALESFORCE_AUTHORIZATION_TOKEN')
response_cache = {}
response_cache_clean_interval = int(os.environ.get('RESPONSE_CACHE_CLEAN_INTERVAL', 60))
response_cache_clean_task = None
workshop_id_update_task = None
session_cache = {}
session_lifetime = int(os.environ.get('SESSION_LIFETIME', 600))

logging.basicConfig(level=os.environ.get('LOGGING_LEVEL', 'INFO'))

def proxy_api_client(session):
    api_client = HotfixKubeApiClient()
    if os.environ.get('ENVIRONMENT') == 'development':
        return api_client
    api_client.default_headers['Impersonate-User'] = session['user']
    for group in session['groups']:
        api_client.default_headers.add('Impersonate-Group', group)
    return api_client

async def api_proxy(method, url, headers, data=None, params=None):
    async with aiohttp.ClientSession() as session:
        headers = {
            key: value for (key, value) in headers.items()
            if key.lower() not in ('host', 'content-length')
        }
        if data:
            headers['Content-Length'] = str(len(data))
        resp = await session.request(
            allow_redirects=False,
            data=data,
            headers=headers,
            method=method,
            params=params,
            url=url,
        )
        excluded_headers = [
            'connection', 
            'content-encoding',
            'content-length',
            'keep-alive',
            'proxy-authenticate',
            'proxy-authorization',
            'te',
            'trailers',
            'transfer-encoding',
            'upgrade',
        ]
        headers = {
            name: value for (name, value) in resp.headers.items()
            if name.lower() not in excluded_headers
        }
        data = gzip.compress(await resp.read(), compresslevel=5)
        headers['Content-Encoding'] = 'gzip'
        headers['Content-Type'] = 'application/json'
        return web.Response(
            body=data,
            headers=headers,
            status=resp.status,
        )

async def on_startup(app):
    global app_api_client, babylon_namespace, console_url, core_v1_api, custom_objects_api, redis_connection, response_cache_clean_task
    if os.path.exists('/run/secrets/kubernetes.io/serviceaccount'):
        kubernetes_asyncio.config.load_incluster_config()
        if not babylon_namespace:
            with open('/run/secrets/kubernetes.io/serviceaccount/namespace') as f:
                babylon_namespace = f.read()
    else:
        await kubernetes_asyncio.config.load_kube_config()
        if not babylon_namespace:
            raise Exception(
                'Unable to determine babylon namespace. '
                'Please set BABYLON_NAMESPACE environment variable.'
            )
    app_api_client = kubernetes_asyncio.client.ApiClient()
    core_v1_api = kubernetes_asyncio.client.CoreV1Api(app_api_client)
    custom_objects_api = kubernetes_asyncio.client.CustomObjectsApi(app_api_client)
    console_url = (
        await core_v1_api.read_namespaced_config_map('console-public', 'openshift-config-managed')
    ).data['consoleURL']

    if 'REDIS_PASSWORD' in os.environ:
        redis_connection = redis.Redis(
            db = 0,
            decode_responses = True,
            host = os.environ.get('REDIS_SERVER', 'redis'),
            password = os.environ.get('REDIS_PASSWORD'),
            port = int(os.environ.get('REDIS_PORT', 6379)),
            username = os.environ.get('REDIS_USER', 'default'),
        )

    response_cache_clean_task = asyncio.create_task(response_cache_clean())
    workshop_id_update_task = asyncio.create_task(update_workshop_ids())

async def on_cleanup(app):
    response_cache_clean_task.cancel()
    workshop_id_update_task.cancel()
    await response_cache_clean_task
    await workshop_id_update_task
    await app_api_client.close()

async def check_admin_access(api_client):
    """
    Check and return true if api_client is configured with babylon admin access.
    Access is determined by whether the user can directly manage AnarchySubjects.
    """
    (data, status, headers) = await api_client.call_api(
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
        response_types_map = {
            201: "object",
            401: None,
        }
    )
    return data.get('status', {}).get('allowed', False)

async def check_user_support_access(api_client):
    """
    Check and return true if api_client is configured with babylon admin access.
    Access is determined by whether the user can manage ResourceClaims in any namespace.
    """
    (data, status, headers) = await api_client.call_api(
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
        response_types_map = {
            201: "object",
            401: None,
        }
    )
    return data.get('status', {}).get('allowed', False)

async def get_catalog_namespaces(api_client):
    namespaces = []
    namespace_list = await core_v1_api.list_namespace(
        label_selector = f"babylon.gpte.redhat.com/interface={interface_name}" if interface_name else 'babylon.gpte.redhat.com/catalog'
    )
    for ns in namespace_list.items:
        (data, status, headers) = await api_client.call_api(
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
            },
            response_types_map = {201: "object"},
        )
        if data.get('status', {}).get('allowed', False):
            namespaces.append({
                'name': ns.metadata.name,
                'displayName': ns.metadata.annotations.get('openshift.io/display-name', ns.metadata.name),
                'description': ns.metadata.annotations.get('openshift.io/description', f"Catalog {ns.metadata.name}")
            })
    return namespaces

async def get_openshift_auth_user():
    user = await custom_objects_api.get_cluster_custom_object(
        'user.openshift.io', 'v1', 'users', '~'
    )
    return(user['metadata']['name'])

async def get_user_groups(user):
    global groups
    if groups_last_update < time.time() - 60:
        group_list = await custom_objects_api.list_cluster_custom_object(
            group='user.openshift.io',
            plural='groups',
            version='v1',
        )
        groups = group_list.get('items', [])

    user_name = user['metadata']['name'] if isinstance(user, dict) else user
    user_groups = []
    for group in groups:
        if user_name in group.get('users', []):
            user_groups.append(group['metadata']['name'])
    return user_groups

async def get_proxy_user(request):
    email = request.headers.get('X-Forwarded-Email')
    user = request.headers.get('X-Forwarded-User')
    # In development get user from authentication
    if not user and os.environ.get('ENVIRONMENT') == 'development':
        user = await get_openshift_auth_user()
    if not user:
        raise web.HTTPUnauthorized(reason="No X-Forwarded-User header")

    if email:
        try:
            return await custom_objects_api.get_cluster_custom_object(
                group='user.openshift.io',
                name=email,
                plural='users',
                version='v1',
            )
        except kubernetes_asyncio.client.exceptions.ApiException as exception:
            if exception.status != 404:
                raise

    try:
        return await custom_objects_api.get_cluster_custom_object(
            group='user.openshift.io',
            name=user,
            plural='users',
            version='v1',
        )
    except kubernetes_asyncio.client.exceptions.ApiException as exception:
        if exception.status != 404:
            raise

    raise web.HTTPUnauthorized(reason=f"Unable to find user by name ({user}) or email ({email})")

async def get_service_namespaces(user, api_client):
    user_uid = user['metadata']['uid']
    user_namespace_name = 'user-' + re.sub(r'[^a-z0-9]', '-', user['metadata']['name'])

    namespace_list = await core_v1_api.list_namespace(
        label_selector=f"usernamespace.gpte.redhat.com/user-uid={user_uid}"
    )
    user_namespace = None
    service_namespaces = []
    for ns in namespace_list.items:
        name = ns.metadata.name
        requester = ns.metadata.annotations.get('openshift.io/requester')
        if name == user_namespace_name or name == f"{user_namespace_name}-1":
            user_namespace = {
                'name': name,
                'displayName': ns.metadata.annotations.get('openshift.io/display-name', f"User {requester}"),
                'requester': requester,
            }
        else:
            service_namespaces.append({
                'name': name,
                'displayName': ns.metadata.annotations.get('openshift.io/display-name', f"User {requester} (shared)"),
                'requester': requester,
            })
    service_namespaces.insert(0, user_namespace)
    return user_namespace, service_namespaces

async def get_user_session(request, user):
    authentication_header = request.headers.get('Authentication')
    if not authentication_header:
        raise web.HTTPUnauthorized(reason="No Authentication header")
    if not authentication_header.startswith('Bearer '):
        raise web.HTTPUnauthorized(reason="Authentication header is not a bearer token")
    token = authentication_header[7:]

    session = None
    if redis_connection:
        session_json = await redis_connection.get(token)
        if session_json:
            session = json.loads(session_json)
    else:
        session = session_cache.get(token)

    if not session:
        raise web.HTTPUnauthorized(reason="Invalid bearer token, no session for token")
    elif session.get('user') != user['metadata']['name']:
        raise web.HTTPUnauthorized(reason="Invalid bearer token, user mismatch")
    return session

async def start_user_session(user, groups):
    session = {
        'user': user['metadata']['name'],
        'groups': groups,
        'roles': []
    }

    api_client = proxy_api_client(session)
    if await check_admin_access(api_client):
        session['admin'] = True
    elif await check_user_support_access(api_client):
        session['roles'].append('userSupport')

    session['catalogNamespaces'] = await get_catalog_namespaces(api_client)

    user_namespace, service_namespaces = await get_service_namespaces(user, api_client)
    session['userNamespace'] = user_namespace
    session['serviceNamespaces'] = service_namespaces

    token = random_string(32)
    if redis_connection:
        await redis_connection.setex(token, session_lifetime, json.dumps(session, separators=(',',':')))
    else:
        session_cache[token] = session

    return api_client, session, token

def replace_template_variables(data, job_vars):
    """
    Replace Jinja2-like template variables in a data structure with values from job_vars.
    
    Template format: {{ job_vars.variable_name | default('default_value') }}
    Only replaces variables that exist in the job_vars dictionary.
    
    Args:
        data: The data structure (dict, list, str, etc.) to process
        job_vars: Dictionary containing variable values
        
    Returns:
        The data structure with template variables replaced where applicable
    """
    if isinstance(data, dict):
        return {key: replace_template_variables(value, job_vars) for key, value in data.items()}
    elif isinstance(data, list):
        return [replace_template_variables(item, job_vars) for item in data]
    elif isinstance(data, str):
        # Pattern to match both:
        # {{ job_vars.variable_name }} and
        # {{ job_vars.variable_name | default('default_value') }}
        pattern = r'\{\{\s*(job_vars\.[^|\s}]+)(?:\s*\|\s*default\([\'"]([^\'"]*)[\'"]?\))?\s*\}\}'
        
        def replace_match(match):
            var_name = match.group(1)
            default_value = match.group(2)  # The default value if present
            
            # If variable exists in job_vars, use it
            if var_name in job_vars:
                return str(job_vars[var_name])
            # If variable doesn't exist but there's a default value, use the default
            elif default_value is not None:
                return default_value
            else:
                # Return the original template unchanged (no variable and no default)
                return match.group(0)
        
        return re.sub(pattern, replace_match, data)
    else:
        return data

routes = web.RouteTableDef()
@routes.get('/auth/session')
async def get_auth_session(request):
    user = await get_proxy_user(request)
    groups = await get_user_groups(user)
    api_client, session, token = await start_user_session(user, groups)
    try:
        user_is_admin = session.get('admin', False)
        roles = session.get('roles', [])
        ret = {
            "admin": user_is_admin,
            "consoleURL": console_url,
            "groups": groups,
            "user": user['metadata']['name'],
            "token": token,
            "catalogNamespaces": session['catalogNamespaces'],
            "lifetime": session_lifetime,
            "serviceNamespaces": session['serviceNamespaces'],
            "userNamespace": session['userNamespace'],
            "roles": roles,
        }
        if not user_is_admin:
            ret['quota'] = {
                "services": 3,
            }
        if interface_name:
            ret['interface'] = interface_name

        return web.json_response(ret)
    finally:
        await api_client.close()

@routes.get("/auth/users/{user_name}")
async def get_auth_users_info(request):
    user_name = request.match_info.get('user_name')
    puser = await get_proxy_user(request)
    session = await get_user_session(request, puser)
    api_client = proxy_api_client(session)
    test_api_client = None

    try:
        if not session.get('admin'):
            raise web.HTTPForbidden()
    
        test_api_client = HotfixKubeApiClient()
        test_api_client.default_headers['Impersonate-User'] = user_name
    
        groups = await get_user_groups(user_name)
        for group in groups:
            test_api_client.default_headers.add('Impersonate-Group', group)
        user_is_admin = await check_admin_access(test_api_client)
        roles = []
        if not user_is_admin:
            if await check_user_support_access(test_api_client):
                roles.append('userSupport')
    
        try:
            user = await custom_objects_api.get_cluster_custom_object(
                group='user.openshift.io',
                name=user_name,
                plural='users',
                version='v1',
            )
        except kubernetes_asyncio.client.exceptions.ApiException as exception:
            if exception.status == 404:
                raise web.HTTPNotFound()
            else:
                raise
    
        catalog_namespaces = await get_catalog_namespaces(test_api_client)
        user_namespace, service_namespaces = await get_service_namespaces(user, test_api_client)
    
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
        return web.json_response(ret)
    finally:
        await api_client.close()
        if test_api_client:
            await test_api_client.close()

@routes.get("/api/ratings/request/{request_uid}")
async def provision_rating_get(request):
    request_uid = request.match_info.get('request_uid')
    user = await get_proxy_user(request)
    email = user['metadata']['name']
    return await api_proxy(
        headers=request.headers,
        method="GET",
        url=f"{ratings_api}/api/ratings/v1/request/{request_uid}/email/{email}",
    )

@routes.post("/api/ratings/request/{request_uid}")
async def provision_rating_post(request):
    request_uid = request.match_info.get('request_uid')
    user = await get_proxy_user(request)
    data = await request.json()
    data["email"] = user['metadata']['name']
    return await api_proxy(
        data=json.dumps(data),
        headers=request.headers,
        method="POST",
        url=f"{ratings_api}/api/ratings/v1/request/{request_uid}",
    )


@routes.get("/api/user-manager/bookmarks")
async def provision_rating_get(request):
    user = await get_proxy_user(request)
    email = user['metadata']['name']
    return await api_proxy(
        headers=request.headers,
        method="GET",
        url=f"{ratings_api}/api/user-manager/v1/bookmarks/{email}",
    )

@routes.post("/api/user-manager/bookmarks")
async def bookmark_post(request):
    user = await get_proxy_user(request)
    data = await request.json()
    data["email"] = user['metadata']['name']
    return await api_proxy(
        data=json.dumps(data),
        headers=request.headers,
        method="POST",
        url=f"{ratings_api}/api/user-manager/v1/bookmarks",
    )

@routes.delete("/api/user-manager/bookmarks")
async def bookmark_delete(request):
    user = await get_proxy_user(request)
    asset_uuid = request.query.get("asset_uuid")
    email = user['metadata']['name']
    return await api_proxy(
        headers=request.headers,
        method="DELETE",
        url=f"{ratings_api}/api/user-manager/v1/bookmarks/{email}/{asset_uuid}",
    )

@routes.get("/api/ratings/catalogitem/{asset_uuid}/history")
async def provision_rating_get_history(request):
    asset_uuid = request.match_info.get('asset_uuid')
    user = await get_proxy_user(request)
    session = await get_user_session(request, user)
    if not session.get('admin'):
        raise web.HTTPForbidden()
    return await api_proxy(
        headers=request.headers,
        method="GET",
        url=f"{ratings_api}/api/ratings/v1/catalogitem/{asset_uuid}/history",
    )

@routes.get("/api/admin/incidents")
async def incidents_get(request):
    return await api_proxy(
        headers=request.headers,
        method="GET",
        params=request.query,
        url=f"{admin_api}/api/admin/v1/incidents",
    )

@routes.post("/api/admin/incidents")
async def create_incident(request):
    user = await get_proxy_user(request)
    session = await get_user_session(request, user)
    if not session.get('admin'):
        raise web.HTTPForbidden()
    data = await request.json()
    return await api_proxy(
        data=json.dumps(data),
        headers=request.headers,
        method="POST",
        url=f"{admin_api}/api/admin/v1/incidents",
    )

@routes.post("/api/admin/incidents/{incident_id}")
async def update_incident(request):
    incident_id = request.match_info.get('incident_id')
    user = await get_proxy_user(request)
    session = await get_user_session(request, user)
    if not session.get('admin'):
        raise web.HTTPForbidden()
    data = await request.json()
    return await api_proxy(
        data=json.dumps(data),
        headers=request.headers,
        method="POST",
        url=f"{admin_api}/api/admin/v1/incidents/{incident_id}",
    )

@routes.post("/api/admin/workshop/support")
async def create_support(request):
    user = await get_proxy_user(request)
    session = await get_user_session(request, user)

    data = await request.json()
    data["email"] = user['metadata']['name']

    impersonate_user = request.headers.get('Impersonate-User')
    if impersonate_user and session.get('admin'):
        data["email"] = impersonate_user
    else:
        data["email"] = user['metadata']['name']

    return await api_proxy(
        data=json.dumps(data),
        headers=request.headers,
        method="POST",
        url=f"{admin_api}/api/admin/v1/workshop/support",
    )

@routes.get("/api/salesforce/accounts")
async def list_sfdc_accounts(request):
    headers = {
        "Authorization": f"Bearer {reporting_api_authorization_token}"
    }
    queryString = ""
    salesType = request.query.get("sales_type")
    accountValue = request.query.get("value")
    if salesType:
        queryString = f"sales_type={salesType}"
    if accountValue:
        queryString = f"{queryString}&value={accountValue}"
    else:
        queryString = f"{queryString}&value=''"
    return await api_proxy(
        headers=headers,
        method="GET",
        url=f"{reporting_api}/search/accounts?{queryString}",
    )
@routes.get("/api/salesforce/accounts/{account_id}")
async def list_sfdc_accounts(request):
    account_id = request.match_info.get('account_id')
    headers = {
        "Authorization": f"Bearer {reporting_api_authorization_token}"
    }
    queryString = f"account_id={account_id}"
    salesType = request.query.get("sales_type")
    if salesType:
        queryString = f"{queryString}&sales_type={salesType}"
    return await api_proxy(
        headers=headers,
        method="GET",
        url=f"{reporting_api}/search/accounts/sfdc?{queryString}",
    )
    
@routes.get("/api/salesforce/{salesforce_id}")
async def salesforce_id_validation(request):
    salesforce_id = request.match_info.get('salesforce_id')
    headers = {
        "Authorization": f"Bearer {reporting_api_authorization_token}"
    }
    queryString = f"salesforce_id={salesforce_id}"
    salesType = request.query.get("sales_type")
    if salesType:
        queryString = f"{queryString}&sales_type={salesType}"
    return await api_proxy(
        headers=headers,
        method="GET",
        url=f"{reporting_api}/sales_validation?{queryString}",
    )

# Expects a request body with the following structure:
# {
#   [
#     {
#       "kind": "OcpSandbox", # The kind of the resource to check availability for
#       "annotations": {
#         "virt": "true" # Example of an annotation that is used to determine the resource pool
#       }
#     }
#   ]
# }
@routes.post("/api/{agnosticv_name}/check-availability")
async def catalog_item_check_availability(request):
    agnosticv_name = request.match_info.get('agnosticv_name')
    # TODO: Look if there is a resourcePool that is available for this catalog item
    agnosticv_component = await custom_objects_api.get_namespaced_custom_object(
        group = 'gpte.redhat.com',
        name = agnosticv_name,
        namespace = 'babylon-config',
        plural = 'agnosticvcomponents',
        version = 'v1',
    )
    spec = agnosticv_component.get('spec')
    if not spec:
        raise web.HTTPNotFound(reason="AgnosticV component has no spec")
    definition = spec.get('definition')
    if not definition:
        raise web.HTTPNotFound(reason="AgnosticV component has no definition")
    meta = definition.get('__meta__')
    if not meta:
        raise web.HTTPNotFound(reason="AgnosticV component has no __meta__ section")
    sandboxes = meta.get('sandboxes')
    if not sandboxes:
        raise web.HTTPNotFound(reason="AgnosticV component has no sandboxes defined")
    
    # Get request data (array of objects)
    request_data = await request.json()
    
    # Process each request object in the array
    resources = []
    for request_obj in request_data:
        request_kind = request_obj.get('kind')
        annotations = request_obj.get('annotations', {})
        
        # Prepend 'job_vars.param_selector_' to each annotation key
        job_vars = {f"job_vars.param_selector_{key}": value for key, value in annotations.items()}
        
        # Find matching sandbox for this request's kind
        for sandbox in sandboxes:
            if sandbox.get('kind') == request_kind:
                # Deep copy the sandbox to avoid modifying the original
                sandbox_copy = copy.deepcopy(sandbox)
                # Replace all template variables in the sandbox with this request's variables
                sandbox_copy = replace_template_variables(sandbox_copy, job_vars)
                # Create processed request object with the modified sandbox
                resources.append(sandbox_copy)
    
    # First, get access token from login endpoint
    async with aiohttp.ClientSession() as session:
        login_headers = {
            "Authorization": f"Bearer {sandbox_api_authorization_token}"
        }
        async with session.get(f"{sandbox_api}/api/v1/login", headers=login_headers) as login_resp:
            if login_resp.status != 200:
                raise web.HTTPInternalServerError(reason=f"Failed to login to sandbox API: {login_resp.status}")
            login_data = await login_resp.json()
            access_token = login_data.get("access_token")
            
            if not access_token:
                raise web.HTTPInternalServerError(reason="Failed to get access token from sandbox API")
    
    # Use access token for placements/dry-run endpoint
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    return await api_proxy(
        headers=headers,
        data=json.dumps({"resources": resources}),
        method="POST",
        url=f"{sandbox_api}/api/v1/placements/dry-run",
    )

@routes.get("/api/catalog_item/metrics/{asset_uuid}")
async def catalog_item_metrics(request):
    asset_uuid = request.match_info.get('asset_uuid')
    headers = {
        "Authorization": f"Bearer {reporting_api_authorization_token}"
    }
    return await api_proxy(
        headers=headers,
        method="GET",
        url=f"{reporting_api}/catalog_item/metrics/{asset_uuid}?use_cache=true",
    )

@routes.get("/api/catalog_incident/active-incidents")
async def catalog_item_active_incidents(request):
    stage = request.query.get("stage")
    queryString = ""
    if stage:
        queryString = f"?stage={stage}"
    headers = {
        "Authorization": f"Bearer {reporting_api_authorization_token}"
    }
    return await api_proxy(
        headers=headers,
        method="GET",
        url=f"{reporting_api}/catalog_incident/active-incidents{queryString}",
    )

@routes.get("/api/catalog_incident/last-incident/{asset_uuid}/{stage}")
async def catalog_item_last_incident(request):
    asset_uuid = request.match_info.get('asset_uuid')
    stage = request.match_info.get('stage')
    headers = {
        "Authorization": f"Bearer {reporting_api_authorization_token}"
    }
    return await api_proxy(
        headers=headers,
        method="GET",
        url=f"{reporting_api}/catalog_incident/last-incident/{asset_uuid}/{stage}",
    )

@routes.post("/api/catalog_incident/incidents/{asset_uuid}/{stage}")
async def catalog_item_incidents(request):
    asset_uuid = request.match_info.get('asset_uuid')
    stage = request.match_info.get('stage')
    data = await request.json()
    headers = {
        'Authorization': f"Bearer {reporting_api_authorization_token}",
        'Content-Type': 'application/json'
    }
    return await api_proxy(
        headers=headers,
        method="POST",
        data=json.dumps(data),
        url=f"{reporting_api}/catalog_incident/incidents/{asset_uuid}/{stage}",
    )

@routes.post("/api/external_item/{asset_uuid}")
async def external_item_request(request):
    asset_uuid = request.match_info.get('asset_uuid')
    data = await request.json()
    user = await get_proxy_user(request)
    data["ordered_by"] = user['metadata']['name']
    headers = {
        'Authorization': f"Bearer {reporting_api_authorization_token}",
        'Content-Type': 'application/json'
    }
    return await api_proxy(
        headers=headers,
        method="POST",
        data=json.dumps(data),
        url=f"{reporting_api}/external_item/{asset_uuid}/request",
    )

@routes.get("/api/usage-cost/request/{request_id}")
async def usage_cost_request(request):
    request_id = request.match_info.get('request_id')
    headers = {
        "Authorization": f"Bearer {reporting_api_authorization_token}"
    }
    return await api_proxy(
        headers=headers,
        method="GET",
        url=f"{reporting_api}/usage-cost/request/{request_id}",
    )

@routes.get("/api/usage-cost/workshop/{workshop_id}")
async def usage_cost_workshop(request):
    workshop_id = request.match_info.get('workshop_id')
    headers = {
        "Authorization": f"Bearer {reporting_api_authorization_token}"
    }
    return await api_proxy(
        headers=headers,
        method="GET",
        url=f"{reporting_api}/usage-cost/workshop/{workshop_id}",
    )

@routes.get("/api/workshop/{workshop_id}")
async def workshop_get(request):
    """
    Fetch workshop for a workshop attendee in order to present overview.
    """
    workshop_id = request.match_info.get('workshop_id')
    workshop_list = await custom_objects_api.list_cluster_custom_object(
        group='babylon.gpte.redhat.com',
        label_selector=f"babylon.gpte.redhat.com/workshop-id={workshop_id}",
        plural='workshops',
        version='v1',
    )
    if not workshop_list.get('items'):
        raise web.HTTPNotFound()
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
    return web.json_response(ret)

@routes.post("/api/workshop/{workshop_id}")
@routes.put("/api/workshop/{workshop_id}")
async def workshop_post(request):
    """
    Access workshop as an attendee with login information.
    """
    workshop_id = request.match_info.get('workshop_id')
    if not request.can_read_body:
        raise web.HTTPBadRequest()

    data = await request.json()
    if not data:
        raise web.HTTPBadRequest()

    access_password = data.get('accessPassword')
    email = data.get('email')
    if not email:
        raise web.HTTPBadRequest()

    workshop_list = await custom_objects_api.list_cluster_custom_object(
        'babylon.gpte.redhat.com', 'v1', 'workshops',
        label_selector=f"babylon.gpte.redhat.com/workshop-id={workshop_id}"
    )
    if not workshop_list.get('items'):
        raise web.HTTPConflict()

    workshop = workshop_list['items'][0]
    workshop_access_password = workshop['spec'].get('accessPassword')
    workshop_name = workshop['metadata']['name']
    workshop_namespace = workshop['metadata']['namespace']
    workshop_open_registration = workshop['spec'].get('openRegistration', True)

    if access_password:
        if access_password != workshop_access_password:
            raise web.HTTPForbidden()
    elif workshop_access_password:
        raise web.HTTPBadRequest()

    workshop_user_assignments = await custom_objects_api.list_namespaced_custom_object(
        group='babylon.gpte.redhat.com',
        label_selector=f"babylon.gpte.redhat.com/workshop={workshop_name}",
        namespace=workshop_namespace,
        plural='workshopuserassignments', 
        version='v1',
    )

    if not workshop_user_assignments.get('items'):
        raise web.HTTPNotFound()

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

    for user_assignment in workshop_user_assignments.get('items', []):
        if email == user_assignment['spec'].get('assignment', {}).get('email'):
            ret['assignment'] = user_assignment['spec']
            return web.json_response(ret)

    if not workshop_open_registration:
        raise web.HTTPConflict()

    for user_assignment in workshop_user_assignments.get('items', []):
        if not 'assignment' in user_assignment['spec']:
            try:
                user_assignment['spec']['assignment'] = {"email": email}
                await custom_objects_api.replace_namespaced_custom_object(
                    body=user_assignment,
                    group='babylon.gpte.redhat.com',
                    name=user_assignment['metadata']['name'],
                    namespace=user_assignment['metadata']['namespace'],
                    plural='workshopuserassignments',
                    version='v1',
                )
                ret['assignment'] = user_assignment['spec']
                return web.json_response(ret)
            except kubernetes_asyncio.client.exceptions.ApiException as exception:
                if exception.status != 409:
                    raise

    raise web.HTTPConflict()

@routes.post("/api/multiworkshop")
async def multiworkshop_post(request):
    """
    Create a new MultiWorkshop CRD in the user's namespace.
    Supports both proxy user authentication and service token with user email.
    """
    if not request.can_read_body:
        raise web.HTTPBadRequest(reason="Request body is required")
    
    data = await request.json()
    if not data:
        raise web.HTTPBadRequest(reason="Request body cannot be empty")
    
    # Validate required fields
    required_fields = ['name', 'startDate', 'endDate']
    for field in required_fields:
        if field not in data:
            raise web.HTTPBadRequest(reason=f"Required field '{field}' is missing")
    
    # Determine user and session based on authentication method
    user = None
    session = None
    user_email = data.get('userEmail')
    
    if user_email:
        # Service token scenario - get user from email
        try:
            user = await custom_objects_api.get_cluster_custom_object(
                group='user.openshift.io',
                name=user_email,
                plural='users',
                version='v1',
            )
        except kubernetes_asyncio.client.exceptions.ApiException as exception:
            if exception.status == 404:
                raise web.HTTPBadRequest(reason=f"User with email '{user_email}' not found")
            else:
                raise web.HTTPInternalServerError(reason=f"Failed to get user: {exception.reason}")
        
        # Create a basic session for the service token user
        groups = await get_user_groups(user)
        api_client, session, _ = await start_user_session(user, groups)
        await api_client.close()
    else:
        # Standard proxy user scenario
        user = await get_proxy_user(request)
        session = await get_user_session(request, user)
    
    # Determine target namespace
    # Use provided namespace if specified, otherwise use user's default namespace
    target_namespace = data.get('namespace')
    
    if target_namespace:
        # Validate that user has access to the specified namespace
        user_namespaces = session.get('serviceNamespaces', [])
        is_admin = session.get('admin', False)
        
        # Allow admin users to create in any namespace, or check user has access to the namespace
        if not is_admin:
            user_namespace_names = [ns['name'] for ns in user_namespaces]
            if target_namespace not in user_namespace_names:
                raise web.HTTPForbidden(reason=f"Access denied to namespace '{target_namespace}'")
        
        namespace_name = target_namespace
    else:
        # Use user's default namespace
        user_namespace = session.get('userNamespace')
        if not user_namespace:
            logging.error(f"User namespace not found in session: {session}")
            raise web.HTTPInternalServerError(reason="User namespace not found")
        namespace_name = user_namespace['name']
    
    logging.info(f"Creating MultiWorkshop in namespace: {namespace_name}")
    
    # Create MultiWorkshop CRD object
    # Generate Kubernetes-compliant resource name from the display name
    multiworkshop_name = data['name'].lower().replace(' ', '-').replace('_', '-')
    # Ensure name follows Kubernetes naming conventions
    multiworkshop_name = re.sub(r'[^a-z0-9\-]', '-', multiworkshop_name)
    multiworkshop_name = re.sub(r'-+', '-', multiworkshop_name).strip('-')
    
    # If the name is empty after sanitization, generate a default name
    if not multiworkshop_name:
        multiworkshop_name = "multiworkshop"
    
    # Add random suffix to prevent name conflicts
    random_suffix = random_string(4).lower()
    multiworkshop_name = f"{multiworkshop_name}-{random_suffix}"
    
    multiworkshop_object = {
        "apiVersion": "babylon.gpte.redhat.com/v1",
        "kind": "MultiWorkshop",
        "metadata": {
            "name": multiworkshop_name,
            "namespace": namespace_name,
            "annotations": {
                "babylon.gpte.redhat.com/created-by": user['metadata']['name']
            }
        },
        "spec": {
            "name": data['name'],  # Required field
            "displayName": data['name'],  # Store original name as displayName
            "startDate": data['startDate'],
            "endDate": data['endDate']
        }
    }
    
    # Add optional fields if provided
    optional_fields = ['description', 'backgroundImage', 'logoImage', 'numberSeats', 'assets', 'salesforceId', 'purpose', 'purpose-activity']
    for field in optional_fields:
        if field in data:
            multiworkshop_object['spec'][field] = data[field]
    
    try:
        # Create the MultiWorkshop CRD object
        result = await custom_objects_api.create_namespaced_custom_object(
            group='babylon.gpte.redhat.com',
            version='v1',
            namespace=namespace_name,
            plural='multiworkshops',
            body=multiworkshop_object
        )
        
        # Remove managedFields from response
        if 'managedFields' in result.get('metadata', {}):
            del result['metadata']['managedFields']
        
        return web.json_response(result, status=201)
        
    except kubernetes_asyncio.client.exceptions.ApiException as exception:
        # Debug: Log the full exception details
        logging.error(f"Kubernetes API exception creating MultiWorkshop: {exception}")
        logging.error(f"Exception body: {exception.body}")
        
        if exception.status == 409:
            raise web.HTTPConflict(reason=f"MultiWorkshop with name '{multiworkshop_name}' already exists")
        elif exception.status == 403:
            raise web.HTTPForbidden(reason="Insufficient permissions to create MultiWorkshop")
        elif exception.status == 422:
            # Unprocessable Entity - validation error
            raise web.HTTPBadRequest(reason=f"Validation error creating MultiWorkshop: {exception.body}")
        else:
            raise web.HTTPInternalServerError(reason=f"Failed to create MultiWorkshop: {exception.reason}")

@routes.post("/api/multiworkshop/{multiworkshop_namespace}/{multiworkshop_name}/approve")
async def multiworkshop_approve(request):
    """
    Approve a MultiWorkshop and create Workshop resources for each asset.
    Only accessible by admin users.
    """
    multiworkshop_namespace = request.match_info.get('multiworkshop_namespace')
    multiworkshop_name = request.match_info.get('multiworkshop_name')
    user = await get_proxy_user(request)
    session = await get_user_session(request, user)
    
    # Check admin access
    if not session.get('admin'):
        raise web.HTTPForbidden(reason="Admin access required")
    
    try:
        # Get the MultiWorkshop from the specified namespace
        multiworkshop = await custom_objects_api.get_namespaced_custom_object(
            group='babylon.gpte.redhat.com',
            version='v1',
            namespace=multiworkshop_namespace,
            plural='multiworkshops',
            name=multiworkshop_name
        )
        target_namespace = multiworkshop_namespace
        
        spec = multiworkshop.get('spec', {})
        assets = spec.get('assets', [])
        
        if not assets:
            raise web.HTTPBadRequest(reason="MultiWorkshop has no assets to create workshops for")
        
        # Create workshops and provisions for each asset
        created_workshops = []
        created_provisions = []
        updated_assets = []
        
        for asset in assets:
            asset_key = asset.get('key')
            asset_namespace = asset.get('assetNamespace')
            
            if not asset_key or not asset_namespace:
                logging.warning(f"Skipping asset with missing key or assetNamespace: key={asset_key}, assetNamespace={asset_namespace}")
                continue
            
            catalog_item_name = asset_key  # Asset key is now just the catalog item name
                
            # Generate workshop name
            # Sanitize asset key to make it Kubernetes-compliant
            sanitized_asset_key = asset_key.lower().replace('.', '-').replace('_', '-')
            sanitized_asset_key = re.sub(r'[^a-z0-9\-]', '-', sanitized_asset_key)
            sanitized_asset_key = re.sub(r'-+', '-', sanitized_asset_key).strip('-')
            
            workshop_name = f"{multiworkshop_name}-{sanitized_asset_key}".lower()
            workshop_name = re.sub(r'[^a-z0-9\-]', '-', workshop_name)
            
            # Add random suffix to prevent name conflicts with same asset keys
            random_suffix = random_string(4).lower()
            workshop_name = f"{workshop_name}-{random_suffix}"
            workshop_name = re.sub(r'-+', '-', workshop_name).strip('-')
            
            # Ensure the workshop name doesn't exceed 63 characters (Kubernetes limit)
            if len(workshop_name) > 63:
                # Truncate to make room for suffix, keeping the random suffix
                max_prefix_length = 63 - len(random_suffix) - 1  # -1 for the dash
                workshop_name = f"{workshop_name[:max_prefix_length]}-{random_suffix}"
            
            # Build workshop annotations
            workshop_annotations = {
                "babylon.gpte.redhat.com/created-by": user['metadata']['name'],
                "babylon.gpte.redhat.com/multiworkshop-source": multiworkshop_name
            }
            
            # Add demo.redhat.com annotations if values are provided
            if spec.get('salesforceId'):
                workshop_annotations['demo.redhat.com/salesforce-id'] = spec['salesforceId']
            
            if spec.get('purpose'):
                workshop_annotations['demo.redhat.com/purpose'] = spec['purpose']
            else:
                workshop_annotations['demo.redhat.com/purpose'] = 'Practice / Enablement'
            
            if spec.get('purpose-activity'):
                workshop_annotations['demo.redhat.com/purpose-activity'] = spec['purpose-activity']
            else:
                workshop_annotations['demo.redhat.com/purpose-activity'] = 'Multi Workshop'
            
            # Create Workshop object
            workshop_object = {
                "apiVersion": "babylon.gpte.redhat.com/v1",
                "kind": "Workshop",
                "metadata": {
                    "name": workshop_name,
                    "namespace": target_namespace,
                    "labels": {
                        "babylon.gpte.redhat.com/multiworkshop": multiworkshop_name,
                        "babylon.gpte.redhat.com/asset-key": asset_key
                    },
                    "annotations": workshop_annotations
                },
                "spec": {
                    "displayName": asset.get('workshopDisplayName', f"{spec.get('displayName', multiworkshop_name)} - {asset_key}"),
                    "description": asset.get('workshopDescription', ''),
                    "openRegistration": True,
                    "multiuserServices": False
                }
            }
            
            # Add lifespan if start/end dates are provided
            if spec.get('startDate') and spec.get('endDate'):
                workshop_object['spec']['lifespan'] = {
                    "start": spec['startDate'],
                    "end": spec['endDate']
                }
            
            try:
                # Log workshop object for debugging
                logging.info(f"Creating workshop object: {workshop_object}")
                
                # Create the Workshop
                created_workshop = await custom_objects_api.create_namespaced_custom_object(
                    group='babylon.gpte.redhat.com',
                    version='v1',
                    namespace=target_namespace,
                    plural='workshops',
                    body=workshop_object
                )
                
                created_workshops.append(created_workshop)
                workshop_created = True
                
            except kubernetes_asyncio.client.exceptions.ApiException as e:
                logging.error(f"Failed to create workshop for asset {asset_key}: status={e.status}, reason={e.reason}, body={e.body}")
                if e.status == 409:
                    # Workshop already exists, get the existing one
                    existing_workshop = await custom_objects_api.get_namespaced_custom_object(
                        group='babylon.gpte.redhat.com',
                        version='v1',
                        namespace=target_namespace,
                        plural='workshops',
                        name=workshop_name
                    )
                    created_workshops.append(existing_workshop)
                    workshop_created = False
                else:
                    raise web.HTTPInternalServerError(reason=f"Failed to create workshop for asset {asset_key}: {e.reason} - Details: {e.body}")
            
            # Create WorkshopProvision for the workshop
            provision_name = f"{workshop_name}"
            
            # Get default count from numberSeats or use 1 as default
            provision_count = spec.get('numberSeats', 1)
            
            # Try to get the catalogItem from the specified asset namespace
            catalog_item = None
            catalog_item_namespace = asset_namespace  # Use the stored asset namespace
            
            try:
                catalog_item = await custom_objects_api.get_namespaced_custom_object(
                    group='babylon.gpte.redhat.com',
                    version='v1',
                    namespace=asset_namespace,
                    plural='catalogitems',
                    name=catalog_item_name
                )

            except kubernetes_asyncio.client.exceptions.ApiException as e:
                logging.warning(f"Catalog item {catalog_item_name} not found in namespace {asset_namespace}: {e.reason}")
                # Continue with provision creation even if catalog item is not found
                # This allows for more flexibility in case the catalog item is temporarily unavailable
            
            # Build labels for WorkshopProvision
            provision_labels = {
                "babylon.gpte.redhat.com/multiworkshop": multiworkshop_name,
                "babylon.gpte.redhat.com/asset-key": asset_key,
                "babylon.gpte.redhat.com/workshop": workshop_name,
                "babylon.gpte.redhat.com/catalogItemName": catalog_item_name,
                "babylon.gpte.redhat.com/catalogItemNamespace": catalog_item_namespace
            }
            
            # Add asset-uuid label if catalogItem exists and has it
            if catalog_item and catalog_item.get('metadata', {}).get('labels', {}).get('gpte.redhat.com/asset-uuid'):
                provision_labels['gpte.redhat.com/asset-uuid'] = catalog_item['metadata']['labels']['gpte.redhat.com/asset-uuid']
            
            # Build annotations for WorkshopProvision
            provision_annotations = {
                "babylon.gpte.redhat.com/created-by": user['metadata']['name'],
                "babylon.gpte.redhat.com/multiworkshop-source": multiworkshop_name
            }
            
            # Add category annotation if catalogItem exists and has it
            if catalog_item and catalog_item.get('spec', {}).get('category'):
                provision_annotations['babylon.gpte.redhat.com/category'] = catalog_item['spec']['category']
            
            provision_object = {
                "apiVersion": "babylon.gpte.redhat.com/v1",
                "kind": "WorkshopProvision",
                "metadata": {
                    "name": provision_name,
                    "namespace": target_namespace,
                    "labels": provision_labels,
                    "annotations": provision_annotations,
                    "ownerReferences": [
                        {
                            "apiVersion": "babylon.gpte.redhat.com/v1",
                            "controller": True,
                            "kind": "Workshop",
                            "name": created_workshops[-1]['metadata']['name'],
                            "uid": created_workshops[-1]['metadata']['uid']
                        }
                    ]
                },
                "spec": {
                    "catalogItem": {
                        "name": catalog_item_name,  # Using catalog item name from asset key
                        "namespace": catalog_item_namespace  # Use asset namespace from CRD
                    },
                    "concurrency": 10,  # Default concurrency for provisions
                    "count": provision_count,
                    "parameters": {
                        "purpose": spec.get('purpose', 'Practice / Enablement'),
                        "purpose_activity": spec.get('purpose-activity', 'Multi Workshop'),
                        "salesforce_id": spec.get('salesforceId', '')
                    },
                    "startDelay": 10,  # Default start delay in seconds
                    "workshopName": workshop_name
                }
            }
            
            # Add lifespan if start/end dates are provided
            if spec.get('startDate') and spec.get('endDate'):
                provision_object['spec']['lifespan'] = {
                    "start": spec['startDate'],
                    "end": spec['endDate']
                }
            
            try:
                # Create the WorkshopProvision
                created_provision = await custom_objects_api.create_namespaced_custom_object(
                    group='babylon.gpte.redhat.com',
                    version='v1',
                    namespace=target_namespace,
                    plural='workshopprovisions',
                    body=provision_object
                )
                
                created_provisions.append(created_provision)
                
            except kubernetes_asyncio.client.exceptions.ApiException as e:
                logging.error(f"Failed to create provision for asset {asset_key}: status={e.status}, reason={e.reason}, body={e.body}")
                if e.status == 409:
                    # WorkshopProvision already exists, get the existing one
                    existing_provision = await custom_objects_api.get_namespaced_custom_object(
                        group='babylon.gpte.redhat.com',
                        version='v1',
                        namespace=target_namespace,
                        plural='workshopprovisions',
                        name=provision_name
                    )
                    created_provisions.append(existing_provision)
                else:
                    raise web.HTTPInternalServerError(reason=f"Failed to create workshop provision for asset {asset_key}: {e.reason} - Details: {e.body}")
            
            # Update the asset with workshop info (workshop ID will be updated asynchronously)
            updated_asset = asset.copy()
            updated_asset['workshopName'] = workshop_name
            # Note: workshopId will be populated by a background task once the operator creates the label
            updated_assets.append(updated_asset)
        
        # Update the MultiWorkshop with the workshop information
        multiworkshop['spec']['assets'] = updated_assets
        
        # Add approval metadata
        if 'annotations' not in multiworkshop['metadata']:
            multiworkshop['metadata']['annotations'] = {}
        multiworkshop['metadata']['annotations']['babylon.gpte.redhat.com/approved-by'] = user['metadata']['name']
        multiworkshop['metadata']['annotations']['babylon.gpte.redhat.com/approved-at'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        
        # Update the MultiWorkshop
        updated_multiworkshop = await custom_objects_api.replace_namespaced_custom_object(
            group='babylon.gpte.redhat.com',
            version='v1',
            namespace=multiworkshop_namespace,
            plural='multiworkshops',
            name=multiworkshop_name,
            body=multiworkshop
        )
        
        # Remove managedFields from response
        if 'managedFields' in updated_multiworkshop.get('metadata', {}):
            del updated_multiworkshop['metadata']['managedFields']
        
        return web.json_response({
            "multiworkshop": updated_multiworkshop,
            "createdWorkshops": [w['metadata']['name'] for w in created_workshops],
            "createdProvisions": [p['metadata']['name'] for p in created_provisions],
            "message": f"Successfully approved MultiWorkshop and created {len(created_workshops)} workshops with {len(created_provisions)} provisions"
        })
        
    except kubernetes_asyncio.client.exceptions.ApiException as exception:
        if exception.status == 404:
            raise web.HTTPNotFound(reason=f"MultiWorkshop '{multiworkshop_name}' not found")
        elif exception.status == 403:
            raise web.HTTPForbidden(reason="Insufficient permissions to approve MultiWorkshop")
        else:
            raise web.HTTPInternalServerError(reason=f"Failed to approve MultiWorkshop: {exception.reason}")

@routes.get("/apis/babylon.gpte.redhat.com/v1/namespaces/{namespace}/catalogitems")
@routes.get("/apis/babylon.gpte.redhat.com/v1/namespaces/{namespace}/catalogitems/{name}")
async def openshift_api_proxy_with_cache(request):
    namespace = request.match_info.get('namespace')

    user = await get_proxy_user(request)
    session = await get_user_session(request, user)

    for catalog_namespace in session.get('catalogNamespaces', []):
        if catalog_namespace['name'] == namespace:
            break
    else:
        raise web.HTTPForbidden()

    resp, cache_time = response_cache.get(request.path_qs, (None, None))
    if resp != None and time.time() - cache_time < response_cache_clean_interval:
        return web.Response(
            body=resp.body,
            headers=resp.headers,
            status=resp.status,
        )

    resp = await openshift_api_proxy(request)
    response_cache[request.path_qs] = (resp, time.time())
    return resp

@routes.delete("/{path:apis?/.*}")
@routes.get("/{path:apis?/.*}")
@routes.patch("/{path:apis?/.*}")
@routes.post("/{path:apis?/.*}")
@routes.put("/{path:apis?/.*}")
async def openshift_api_proxy(request):
    user = await get_proxy_user(request)
    session = await get_user_session(request, user)
    api_client = proxy_api_client(session)

    try:
        impersonate_user = request.headers.get('Impersonate-User')
        if impersonate_user and session.get('admin'):
            api_client.default_headers['Impersonate-User'] = impersonate_user
            api_client.default_headers.discard('Impersonate-Group')
            groups = await get_user_groups(impersonate_user)
            for group in groups:
                api_client.default_headers.add('Impersonate-Group', group)

        header_params = {}
        if request.headers.get('Accept'):
            header_params['Accept'] = request.headers['Accept']
        if request.content_type and request.can_read_body:
            header_params['Content-Type'] = request.content_type

        response = await api_client.call_api(
            request.path,
            request.method,
            auth_settings = ['BearerToken'],
            body = await request.json() if request.can_read_body else None,
            header_params = header_params,
            query_params = [(k, v) for k, v in request.query.items()] if request.query else None,
            _preload_content = False,
        )
        data = json.loads(await response.read())

        # Strip out metadata.managedFields
        if 'managedFields' in data.get('metadata', {}):
            del data['metadata']['managedFields']
        for item in data.get('items', []):
            if 'managedFields' in item.get('metadata', {}):
                del item['metadata']['managedFields']

        headers={
            key: val for key, val in response.headers.items()
            if key.lower() not in ('content-encoding', 'content-length', 'content-type', 'transfer-encoding')
        }

        data = gzip.compress(bytes(json.dumps(data), 'utf-8'), compresslevel=5)
        headers['Content-Encoding'] = 'gzip'
        headers['Content-Type'] = 'application/json'

        return web.Response(
            body=data,
            headers=headers,
            status=response.status,
        )
    except kubernetes_asyncio.client.exceptions.ApiException as exception:
        if exception.body:
            return web.Response(
                body=exception.body,
                headers={"Content-Type": "application/json"},
                status=exception.status,
            )
        else:
            return web.Response(
                status=exception.status,
            )
    finally:
        await api_client.close()

async def response_cache_clean():
    """Periodically remove old cache entries to avoid memory leak."""
    try:
        while True:
            for key, value in list(response_cache.items()):
                cache_time = value[1]
                if time.time() - cache_time > response_cache_clean_interval:
                    response_cache.pop(key, None)
            await asyncio.sleep(response_cache_clean_interval)
    except asyncio.CancelledError:
        return

async def update_workshop_ids():
    """Periodically check for workshop IDs and update MultiWorkshop assets."""
    try:
        while True:
            await asyncio.sleep(30)  # Check every 30 seconds
            try:
                # Get all MultiWorkshops that are approved but missing workshop IDs
                multiworkshops = await custom_objects_api.list_cluster_custom_object(
                    group='babylon.gpte.redhat.com',
                    version='v1',
                    plural='multiworkshops'
                )
                
                for multiworkshop in multiworkshops.get('items', []):
                    # Check if this MultiWorkshop is approved and has assets without workshop IDs
                    if not multiworkshop.get('metadata', {}).get('annotations', {}).get('babylon.gpte.redhat.com/approved-at'):
                        continue
                    
                    assets = multiworkshop.get('spec', {}).get('assets', [])
                    if not assets:
                        continue
                    
                    # Check if any assets are missing workshop IDs
                    needs_update = False
                    updated_assets = []
                    
                    for asset in assets:
                        if asset.get('workshopName') and not asset.get('workshopId'):
                            # Try to get the workshop and its ID
                            try:
                                workshop = await custom_objects_api.get_namespaced_custom_object(
                                    group='babylon.gpte.redhat.com',
                                    version='v1',
                                    namespace=multiworkshop['metadata']['namespace'],
                                    plural='workshops',
                                    name=asset['workshopName']
                                )
                                
                                workshop_id = workshop.get('metadata', {}).get('labels', {}).get('babylon.gpte.redhat.com/workshop-id')
                                if workshop_id:
                                    asset = asset.copy()
                                    asset['workshopId'] = workshop_id
                                    needs_update = True
                                    logging.info(f"Found workshop ID {workshop_id} for MultiWorkshop {multiworkshop['metadata']['name']} asset {asset['key']}")
                                
                            except kubernetes_asyncio.client.exceptions.ApiException:
                                # Workshop might not exist yet or other error, skip
                                pass
                        
                        updated_assets.append(asset)
                    
                    # Update the MultiWorkshop if any assets were updated
                    if needs_update:
                        try:
                            multiworkshop['spec']['assets'] = updated_assets
                            await custom_objects_api.replace_namespaced_custom_object(
                                group='babylon.gpte.redhat.com',
                                version='v1',
                                namespace=multiworkshop['metadata']['namespace'],
                                plural='multiworkshops',
                                name=multiworkshop['metadata']['name'],
                                body=multiworkshop
                            )
                            logging.info(f"Updated workshop IDs for MultiWorkshop {multiworkshop['metadata']['name']}")
                        except kubernetes_asyncio.client.exceptions.ApiException as e:
                            logging.error(f"Failed to update MultiWorkshop {multiworkshop['metadata']['name']}: {e}")
                            
            except Exception as e:
                logging.error(f"Error in workshop ID update task: {e}")
                
    except asyncio.CancelledError:
        return


app = web.Application()
app.add_routes(routes)
app.on_startup.append(on_startup)
app.on_cleanup.append(on_cleanup)

if __name__ == '__main__':
    web.run_app(app)
