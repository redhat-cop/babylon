#!/usr/bin/env python3

import asyncio
import gzip
import json
import logging
import os
import re

import aiohttp
from aiohttp import web
from time import time

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
reporting_api_authorization_token = os.environ.get('SALESFORCE_AUTHORIZATION_TOKEN')
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
    global app_api_client, babylon_namespace, console_url, core_v1_api, custom_objects_api, redis_connection
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

async def on_cleanup(app):
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
    if groups_last_update < time() - 60:
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

    token = random_string(32)
    if redis_connection:
        await redis_connection.setex(token, session_lifetime, json.dumps(session, separators=(',',':')))
    else:
        session_cache[token] = session

    return api_client, session, token

routes = web.RouteTableDef()
@routes.get('/auth/session')
async def get_auth_session(request):
    user = await get_proxy_user(request)
    groups = await get_user_groups(user)
    api_client, session, token = await start_user_session(user, groups)
    try:
        catalog_namespaces = await get_catalog_namespaces(api_client)
        user_is_admin = session.get('admin', False)
        roles = session.get('roles', [])
        user_namespace, service_namespaces = await get_service_namespaces(user, api_client)
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
    data = await request.json()
    data["email"] = user['metadata']['name']
    return await api_proxy(
        data=json.dumps(data),
        headers=request.headers,
        method="DELETE",
        url=f"{ratings_api}/api/user-manager/v1/bookmarks",
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


app = web.Application()
app.add_routes(routes)
app.on_startup.append(on_startup)
app.on_cleanup.append(on_cleanup)

if __name__ == '__main__':
    web.run_app(app)
