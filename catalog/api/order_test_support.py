"""Test support for CatalogItemOrder: in-memory Kubernetes fake and fixtures.

FakeKube implements the KubeOrderClient interface with resourceVersion
compare-and-swap, generation tracking and status validation against the
CatalogItemOrder CRD schema, so that status fields the API server would prune
fail tests instead of disappearing silently."""

import copy
import itertools
import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import yaml

from approval_policy import compile_approval_policy
from catalog_item_order import API_GROUP, API_VERSION, KIND, Requester, build_order
from catalog_item_order_kube import KubeConflictError, KubeError

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ORDER_CRD_PATH = os.path.join(REPO_ROOT, 'helm', 'crds', 'catalogitemorders.babylon.gpte.redhat.com.yaml')
CATALOG_ITEM_CRD_PATH = os.path.join(REPO_ROOT, 'helm', 'crds', 'catalogitems.babylon.gpte.redhat.com.yaml')

NOW = datetime(2026, 10, 26, 12, 0, 0, tzinfo=timezone.utc)
CATALOG_NAMESPACE = 'babylon-catalog-prod'
CATALOG_ITEM_NAME = 'tests.test-item.prod'
USER = 'alice'
USER_UID = 'uid-alice'
USER_NAMESPACE = 'user-alice'


def load_crd_schema(path):
    with open(path) as f:
        crd = yaml.safe_load(f)
    return crd['spec']['versions'][0]['schema']['openAPIV3Schema']


ORDER_SCHEMA = load_crd_schema(ORDER_CRD_PATH)


def stored(value):
    """Round trip through the API server: whole-number floats return as ints."""
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, dict):
        return {key: stored(item) for key, item in value.items()}
    if isinstance(value, list):
        return [stored(item) for item in value]
    return copy.deepcopy(value)


def schema_violations(value, schema, path='$'):
    """Return fields the API server would prune and enum violations."""
    problems = []
    if schema.get('x-kubernetes-preserve-unknown-fields'):
        return problems
    if 'enum' in schema and value not in schema['enum']:
        problems.append(f"{path}: {value!r} not in enum")
    if isinstance(value, dict) and schema.get('type') == 'object':
        properties = schema.get('properties') or {}
        for key, child in value.items():
            if key not in properties:
                problems.append(f"{path}.{key}: unknown field would be pruned")
            else:
                problems.extend(schema_violations(child, properties[key], f"{path}.{key}"))
    elif isinstance(value, list) and schema.get('type') == 'array':
        for index, child in enumerate(value):
            problems.extend(schema_violations(child, schema.get('items') or {}, f"{path}[{index}]"))
    return problems


class Clock:
    def __init__(self, now=NOW):
        self.now = now

    def __call__(self):
        return self.now

    def advance(self, **kwargs):
        self.now += timedelta(**kwargs)


class FakeKube:
    def __init__(self):
        self.orders = {}
        self.catalog_items = {}
        self.resources = {}
        self.system_status = {}
        self.user_groups = defaultdict(list)
        self.admins = set()
        self.namespace_access = defaultdict(set)
        self.create_errors = {}
        self.delete_finalizers = False
        self.created = []
        self.deleted = []
        self.status_writes = 0
        self.fail_next_status_write = 0
        self._resource_version = itertools.count(1)
        self._uid = itertools.count(1)

    def _rv(self):
        return str(next(self._resource_version))

    def _new_uid(self, prefix):
        return f"{prefix}-uid-{next(self._uid)}"

    # Orders

    async def create_order(self, body):
        key = (body['metadata']['namespace'], body['metadata']['name'])
        if key in self.orders:
            raise KubeConflictError(409, 'AlreadyExists')
        problems = schema_violations(body['spec'], ORDER_SCHEMA['properties']['spec'], '$.spec')
        assert not problems, problems
        obj = stored(body)
        obj.pop('status', None)
        obj['metadata'].update({
            'uid': self._new_uid('order'),
            'resourceVersion': self._rv(),
            'generation': 1,
            'creationTimestamp': '2026-10-26T12:00:00Z',
        })
        self.orders[key] = obj
        return copy.deepcopy(obj)

    async def get_order(self, namespace, name):
        obj = self.orders.get((namespace, name))
        return copy.deepcopy(obj) if obj else None

    async def list_orders(self, namespace=None, label_selector=None):
        selector = {}
        if label_selector:
            for term in label_selector.split(','):
                key, value = term.split('=', 1)
                selector[key] = value
        result = []
        for (order_namespace, _), obj in sorted(self.orders.items()):
            if namespace and order_namespace != namespace:
                continue
            labels = obj['metadata'].get('labels') or {}
            if all(labels.get(key) == value for key, value in selector.items()):
                result.append(copy.deepcopy(obj))
        return result

    async def replace_order_status(self, order, status):
        key = (order['metadata']['namespace'], order['metadata']['name'])
        current = self.orders.get(key)
        if current is None:
            raise KubeError(404, 'NotFound')
        if self.fail_next_status_write:
            self.fail_next_status_write -= 1
            raise KubeError(503, 'Injected status write failure')
        if order['metadata']['resourceVersion'] != current['metadata']['resourceVersion']:
            raise KubeConflictError(409, 'Conflict')
        problems = schema_violations(status, ORDER_SCHEMA['properties']['status'], '$.status')
        assert not problems, problems
        current['status'] = stored(status)
        current['metadata']['resourceVersion'] = self._rv()
        self.status_writes += 1
        return copy.deepcopy(current)

    async def delete_order(self, order):
        key = (order['metadata']['namespace'], order['metadata']['name'])
        current = self.orders.get(key)
        if current is None or current['metadata']['resourceVersion'] != order['metadata']['resourceVersion']:
            return False
        del self.orders[key]
        return True

    def tamper_spec(self, namespace, name, mutate):
        """Simulate a privileged spec write bypassing validation."""
        current = self.orders[(namespace, name)]
        mutate(current['spec'])
        current['metadata']['generation'] += 1
        current['metadata']['resourceVersion'] = self._rv()

    def force_status(self, namespace, name, mutate):
        """Simulate a trusted writer (e.g. GPTEINFRA-18189 decision service)."""
        current = self.orders[(namespace, name)]
        mutate(current.setdefault('status', {}))
        problems = schema_violations(current['status'], ORDER_SCHEMA['properties']['status'], '$.status')
        assert not problems, problems
        current['metadata']['resourceVersion'] = self._rv()

    # Catalog items

    def add_catalog_item(self, catalog_item):
        catalog_item = stored(catalog_item)
        metadata = catalog_item['metadata']
        metadata.setdefault('uid', self._new_uid('catalogitem'))
        metadata['resourceVersion'] = self._rv()
        self.catalog_items[(metadata['namespace'], metadata['name'])] = catalog_item
        return catalog_item

    async def get_catalog_item(self, namespace, name):
        obj = self.catalog_items.get((namespace, name))
        return copy.deepcopy(obj) if obj else None

    # Provisioning resources

    @staticmethod
    def _ref_key(ref):
        return (ref['kind'], ref['namespace'], ref['name'])

    async def get_resource(self, ref):
        obj = self.resources.get(self._ref_key(ref))
        return copy.deepcopy(obj) if obj else None

    async def create_resource(self, ref, body):
        error = self.create_errors.get(ref['kind'])
        if error is not None:
            raise error
        key = self._ref_key(ref)
        if key in self.resources:
            raise KubeConflictError(409, 'AlreadyExists')
        obj = copy.deepcopy(body)
        obj['metadata']['uid'] = self._new_uid(ref['kind'].lower())
        obj['metadata']['resourceVersion'] = self._rv()
        self.resources[key] = obj
        self.created.append(key)
        return copy.deepcopy(obj)

    def put_resource(self, obj):
        metadata = obj['metadata']
        metadata.setdefault('uid', self._new_uid(obj['kind'].lower()))
        self.resources[(obj['kind'], metadata['namespace'], metadata['name'])] = copy.deepcopy(obj)

    def set_resource_status(self, kind, namespace, name, status):
        self.resources[(kind, namespace, name)]['status'] = copy.deepcopy(status)

    async def delete_resource(self, ref):
        key = self._ref_key(ref)
        if key not in self.resources:
            return False
        if ref.get('uid') and self.resources[key]['metadata'].get('uid') != ref['uid']:
            return False
        self.deleted.append(key)
        if self.delete_finalizers:
            self.resources[key]['metadata']['deletionTimestamp'] = '2026-10-26T12:00:00Z'
        else:
            del self.resources[key]
        return True

    def finish_deletions(self):
        for key in [key for key, obj in self.resources.items() if obj['metadata'].get('deletionTimestamp')]:
            del self.resources[key]

    # Access checks

    async def get_system_status(self):
        if isinstance(self.system_status, Exception):
            raise self.system_status
        return dict(self.system_status)

    async def get_user_groups(self, user):
        return list(self.user_groups[user])

    async def check_access(self, user, groups, group, resource, verb, namespace=None):
        if user in self.admins:
            return True
        if (group, resource, verb) == ('anarchy.gpte.redhat.com', 'anarchysubjects', 'patch'):
            return False
        return namespace in self.namespace_access[user]


def make_parameters():
    return [
        {
            'name': 'purpose',
            'openAPIV3Schema': {
                'type': 'string',
                'x-form-options': [
                    {'name': 'Training - Internal', 'activity': 'Internal', 'sfdcRequired': False},
                    {'name': 'Customer Demo', 'activity': 'Customer', 'sfdcRequired': True},
                    {
                        'name': 'Other', 'activity': 'Internal', 'sfdcRequired': False,
                        'requireUserInput': True,
                    },
                ],
            },
        },
        {'name': 'salesforce_id', 'openAPIV3Schema': {'type': 'string'}},
        {
            'name': 'num_users',
            'openAPIV3Schema': {'type': 'integer', 'default': 5, 'minimum': 1, 'maximum': 100},
        },
        {'name': 'gpu_enabled', 'openAPIV3Schema': {'type': 'boolean', 'default': False}},
        {'name': 'region', 'openAPIV3Schema': {'type': 'string', 'enum': ['na', 'emea', 'apac']}, 'value': 'na'},
        {'name': 'worker_count', 'openAPIV3Schema': {'type': 'integer'}, 'value': '3'},
        {'name': 'notes', 'openAPIV3Schema': {'type': 'string'}},
    ]


def make_catalog_item(
    name=CATALOG_ITEM_NAME, namespace=CATALOG_NAMESPACE, policy=None, raw_policy=None,
    parameters=None, **spec_overrides
):
    parameters = make_parameters() if parameters is None else parameters
    spec = {
        'category': 'Labs',
        'displayName': 'Test Item',
        'lifespan': {'default': '3d', 'maximum': '14d', 'relativeMaximum': '5d'},
        'runtime': {'default': '4h', 'maximum': '8h'},
        'parameters': parameters,
        'resources': [{'name': 'test-item', 'provider': {'name': name, 'namespace': 'poolboy'}}],
        'supportedActions': {'destroy': {}, 'provision': {}, 'start': {}, 'status': {}, 'stop': {}},
        'workshopUiMaxInstances': 30,
        'workshopUserMode': 'none',
        'messageTemplates': {'info': {'template': 'info', 'templateFormat': 'asciidoc'}},
    }
    if raw_policy is not None:
        policy = compile_approval_policy(raw_policy, parameter_specs=parameters)
    if policy is not None:
        spec['approvalPolicy'] = policy
    spec.update(spec_overrides)
    return {
        'apiVersion': f"{API_GROUP}/v1",
        'kind': 'CatalogItem',
        'metadata': {
            'name': name,
            'namespace': namespace,
            'labels': {'gpte.redhat.com/asset-uuid': 'asset-123'},
            'annotations': {'babylon.gpte.redhat.com/displayNameComponent0': 'Cluster'},
        },
        'spec': spec,
    }


def make_session(user=USER, groups=('rhpds-users',), namespaces=(USER_NAMESPACE,), admin=False):
    session = {
        'user': user,
        'groups': list(groups),
        'roles': [],
        'catalogNamespaces': [{'name': CATALOG_NAMESPACE}],
        'serviceNamespaces': [{'name': namespace, 'requester': user} for namespace in namespaces],
        'userNamespace': {'name': namespaces[0], 'requester': user} if namespaces else None,
    }
    if admin:
        session['admin'] = True
    return session


def submission(order_type='service', key='key-0000001', **overrides):
    body = {
        'idempotencyKey': key,
        'catalogItem': {'namespace': CATALOG_NAMESPACE, 'name': CATALOG_ITEM_NAME},
        'namespace': USER_NAMESPACE,
        'orderType': order_type,
        'purpose': 'Training - Internal',
    }
    body.update(overrides)
    return body


async def create_order(kube, catalog_item, body=None, requester=None, now=NOW, groups=('rhpds-users',)):
    """Build and create an order the way the catalog API does."""
    body = body or submission()
    requester = requester or Requester(user=USER, uid=USER_UID, email='alice@example.com')
    definition = build_order(body, catalog_item=catalog_item, requester=requester, groups=list(groups), now=now)
    return await kube.create_order(definition)


def grant_default_access(kube, user=USER, namespace=USER_NAMESPACE, groups=('rhpds-users',)):
    kube.user_groups[user] = list(groups)
    kube.namespace_access[user].add(namespace)


assert KIND == 'CatalogItemOrder' and API_VERSION == 'v1'
