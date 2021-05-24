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

from hotfix import HotfixKubeApiClient

def random_string(length):
    return ''.join([random.choice(string.ascii_letters + string.digits) for n in range(length)])

application = flask.Flask('babylon-admin', static_url_path='/ui')
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
    api_client = HotfixKubeApiClient()
    if os.environ.get('ENVIRONMENT') == 'development':
        return api_client
    api_client.default_headers['Impersonate-User'] = session['user']
    for group in session['groups']:
        api_client.default_headers.add('Impersonate-Group', group)
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

    return token

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

@application.route("/session")
def get_session():
    user = proxy_user()
    token = start_user_session(user)
    return flask.jsonify({
        "token": token,
        "lifetime": session_lifetime,
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
def ui_path(path=None):
    return flask.send_file(application.static_folder + '/index.html')

if __name__ == "__main__":
    application.run()
