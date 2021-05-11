#!/usr/bin/env python3

import flask
import json
import kubernetes
import os
import pathlib
import random
import re
import redis
import string

from urllib3.connection import HTTPHeaderDict
￼
class PatchedKubeApiClient(kubernetes.client.ApiClient):
￼    """
￼    Kubernetes API client with fixed support for multiple Impersonate-Group header values.
￼    """
￼    def request(
￼        self, method, url,
￼        query_params=None,
￼        headers=None,
￼        post_params=None,
￼        body=None,
￼        _preload_content=True,
￼        _request_timeout=None
￼    ):
￼        """
￼        Override of request method to handle multiple Impersonate-Group header values.
￼        """
￼        if headers and 'Impersonate-Group' in headers:
￼            groups = headers['Impersonate-Group'].split("\t")
￼            headers = HTTPHeaderDict([(k, v) for k, v in headers.items() if k != 'Impersonate-Group'])
￼            for group in groups:
￼                headers.add('Impersonate-Group', group)
￼        return kubernetes.client.ApiClient.request(
￼            self, method, url,
￼            query_params=query_params,
￼            headers=headers,
￼            post_params=post_params,
￼            body=body,
￼            _preload_content=_preload_content,
￼            _request_timeout=_request_timeout
￼        )

def random_string(length):
    return ''.join([random.choice(string.ascii_letters + string.digits) for n in range(length)])

application = flask.Flask('babylon-api', static_url_path='/ui')
redis_connection = None
session_cache = {}
session_lifetime = int(os.environ.get('SESSION_LIFETIME', 600))

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
else:
    kubernetes.config.load_kube_config()

core_v1_api = kubernetes.client.CoreV1Api()
custom_objects_api = kubernetes.client.CustomObjectsApi()

def openshift_auth_user():
    user = custom_objects_api.get_cluster_custom_object(
        'user.openshift.io', 'v1', 'users', '~'
    )
    return(user['metadata']['name'])

def proxy_user():
    user = flask.request.headers.get('X-Forwarded-User')
    # In development get user from authentication
    if not user and os.environ.get('ENVIRONMENT') == 'development':
        user = openshift_auth_user()
    if not user:
        flask.abort(401, description="No X-Forwarded-User header")
    return user

def proxy_api_client(session):
    api_client = PatchedKubeApiClient()
    if os.environ.get('ENVIRONMENT') == 'development':
        return api_client
    api_client.default_headers['Impersonate-User'] = session['user']
    api_client.default_headers['Impersonate-Group'] = session['groups']
    return api_client

def start_user_session(user):
    user_groups = []
    for group in custom_objects_api.list_cluster_custom_object(
        'user.openshift.io', 'v1', 'groups'
    ).get('items', []):
        if user in group.get('users', []):
            user_groups.append(group['metadata']['name'])

    session = {
        'user': user,
        'groups': user_groups
    }

    token = random_string(32)
    if redis_connection:
        redis_connection.setex(token, session_lifetime, json.dumps(session, separators=(',',':')))
    else:
        session_cache[token] = session

    return session, token

def get_user_session(proxy_user):
    authentication_header = flask.request.headers.get('Authentication')
    if not authentication_header:
        flask.abort(401, description='No Authentication header')
    if not authentication_header.startswith('Bearer '):
        flask.abort(401, description='Authentication header is not a bearer token')
    token = authentication_header[7:]
    if redis_connection:
        session_json = redis_connection.get(token)
        if not session_json:
            flask.abort(401, description='Invalid bearer token, not found')
        session = json.loads(session_json)
        if session.get('user') != proxy_user:
            flask.abort(401, description='Invalid bearer token, user mismatch')
        return session
    else:
        session = session_cache.get(token)
        if not session:
            flask.abort(401, description='Invalid bearer token, no session for token')
        elif session.get('user') != proxy_user:
            flask.abort(401, description='Invalid bearer token, user mismatch')
        return session

def get_catalog_namespaces(api_client):
    namespaces = []
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

def get_user_namespace(api_client, user):
    namespaces = []

    user_resource = custom_objects_api.get_cluster_custom_object(
        'user.openshift.io', 'v1', 'users', user 
    )
    user_uid = user_resource['metadata']['uid']

    for ns in core_v1_api.list_namespace(label_selector='usernamespace.gpte.redhat.com/user-uid=' + user_uid).items:
        return { 'name': ns.metadata.name }

    return None

@application.route("/session")
def get_session():
    user = proxy_user()
    session, token = start_user_session(user)
    api_client = proxy_api_client(session)
    catalog_namespaces = get_catalog_namespaces(api_client)
    user_namespace = get_user_namespace(api_client, user)
    return flask.jsonify({
        "user": user,
        "token": token,
        "catalogNamespaces": catalog_namespaces,
        "lifetime": session_lifetime,
        "userNamespace": user_namespace,
    })

@application.route("/api/<path:path>", methods=['GET', 'PUT', 'POST', 'PATCH', 'DELETE'])
@application.route("/apis/<path:path>", methods=['GET', 'PUT', 'POST', 'PATCH', 'DELETE'])
def apis_proxy(path):
    user = proxy_user()
    session = get_user_session(user)

    api_client = proxy_api_client(session)
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
            collection_formats = {'Impersonate-Group': 'multi'},
            body = flask.request.json,
            header_params = header_params,
            query_params = [ (k, v) for k, v in flask.request.args.items() ],
            response_type = 'object',
        )
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

@application.route('/')
def root_path():
    return flask.redirect('/ui/')

@application.route('/ui/')
@application.route('/ui/r/<path:path>')
@application.route('/ui/v/<path:path>')
def ui_path(path=None):
    return flask.send_file(application.static_folder + '/index.html')

if __name__ == "__main__":
    application.run()
