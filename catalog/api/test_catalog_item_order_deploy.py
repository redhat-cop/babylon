"""CRD, published policy and Helm/RBAC checks for CatalogItemOrder."""

import os
import re
import shutil
import subprocess
import unittest

import yaml

from approval_policy import compile_approval_policy
from catalog_item_order_controller import CatalogItemOrderController, ControllerConfig
from order_test_support import (
    CATALOG_ITEM_CRD_PATH,
    ORDER_CRD_PATH,
    REPO_ROOT,
    Clock,
    FakeKube,
    create_order,
    grant_default_access,
    load_crd_schema,
    make_catalog_item,
    make_parameters,
    submission,
)
from test_approval_policy import CONDITIONAL_POLICY, RETRY_POLICY, UNCONDITIONAL_POLICY
from test_catalog_item_order_controller import MANAGER_POLICY, complete_claim_status

ORDER_SCHEMA = load_crd_schema(ORDER_CRD_PATH)
CATALOG_ITEM_SCHEMA = load_crd_schema(CATALOG_ITEM_CRD_PATH)
APPROVAL_POLICY_SCHEMA = CATALOG_ITEM_SCHEMA['properties']['spec']['properties']['approvalPolicy']


def structural_problems(schema, path='$'):
    """Subset of Kubernetes structural schema rules."""
    problems = []
    if schema.get('x-kubernetes-preserve-unknown-fields') and 'properties' not in schema:
        return problems
    if 'type' not in schema and not schema.get('x-kubernetes-int-or-string'):
        problems.append(f"{path}: missing type")
    if 'properties' in schema and 'additionalProperties' in schema:
        problems.append(f"{path}: properties and additionalProperties are mutually exclusive")
    for key in ('$ref', 'oneOf', 'anyOf', 'allOf', 'not'):
        if key in schema:
            problems.append(f"{path}: {key} is not allowed at this level")
    for name, child in (schema.get('properties') or {}).items():
        problems.extend(structural_problems(child, f"{path}.{name}"))
    if schema.get('type') == 'array':
        if 'items' not in schema:
            problems.append(f"{path}: array without items")
        else:
            problems.extend(structural_problems(schema['items'], f"{path}[]"))
    if isinstance(schema.get('additionalProperties'), dict):
        problems.extend(structural_problems(schema['additionalProperties'], f"{path}{{}}"))
    return problems


def validation_problems(value, schema, path='$'):
    """Small OpenAPI v3 validator for the keywords these CRDs use."""
    problems = []
    if schema.get('x-kubernetes-preserve-unknown-fields') and 'properties' not in schema:
        return problems
    expected = schema.get('type')
    types = {
        'object': dict, 'array': list, 'string': str, 'boolean': bool,
        'integer': int, 'number': (int, float),
    }
    if expected and (not isinstance(value, types[expected]) or (expected in ('integer', 'number') and isinstance(value, bool))):
        return [f"{path}: expected {expected}, got {type(value).__name__}"]
    if 'enum' in schema and value not in schema['enum']:
        problems.append(f"{path}: {value!r} not in enum")
    if isinstance(value, str):
        if 'maxLength' in schema and len(value) > schema['maxLength']:
            problems.append(f"{path}: longer than {schema['maxLength']}")
        if 'pattern' in schema and not re.search(schema['pattern'], value):
            problems.append(f"{path}: does not match {schema['pattern']}")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if 'minimum' in schema and value < schema['minimum']:
            problems.append(f"{path}: below minimum")
        if 'maximum' in schema and value > schema['maximum']:
            problems.append(f"{path}: above maximum")
    if isinstance(value, list):
        if 'maxItems' in schema and len(value) > schema['maxItems']:
            problems.append(f"{path}: more than {schema['maxItems']} items")
        for index, item in enumerate(value):
            problems.extend(validation_problems(item, schema.get('items') or {}, f"{path}[{index}]"))
    if isinstance(value, dict):
        for name in schema.get('required') or []:
            if name not in value:
                problems.append(f"{path}.{name}: required")
        properties = schema.get('properties') or {}
        for name, child in value.items():
            if name in properties:
                problems.extend(validation_problems(child, properties[name], f"{path}.{name}"))
            elif not schema.get('x-kubernetes-preserve-unknown-fields') and path != '$.metadata':
                # ObjectMeta is validated by the API server, not the CRD schema.
                problems.append(f"{path}.{name}: unknown field would be pruned")
    return problems


def spec_strings_without_max_length(schema, path='$'):
    """CEL `self == oldSelf` cost estimation needs bounded strings."""
    missing = []
    if schema.get('type') == 'string' and 'maxLength' not in schema and 'enum' not in schema:
        missing.append(path)
    for name, child in (schema.get('properties') or {}).items():
        missing.extend(spec_strings_without_max_length(child, f"{path}.{name}"))
    if 'items' in schema:
        missing.extend(spec_strings_without_max_length(schema['items'], f"{path}[]"))
    return missing


class TestCrds(unittest.TestCase):
    def test_order_crd_is_structural_and_namespaced(self):
        with open(ORDER_CRD_PATH) as f:
            crd = yaml.safe_load(f)
        self.assertEqual(crd['spec']['group'], 'babylon.gpte.redhat.com')
        self.assertEqual(crd['spec']['scope'], 'Namespaced')
        version = crd['spec']['versions'][0]
        self.assertEqual((version['name'], version['served'], version['storage']), ('v1', True, True))
        self.assertEqual(version['subresources'], {'status': {}})
        self.assertEqual(structural_problems(ORDER_SCHEMA), [])

    def test_order_spec_is_immutable_and_bounded(self):
        spec_schema = ORDER_SCHEMA['properties']['spec']
        self.assertIn({'rule': 'self == oldSelf', 'message': 'CatalogItemOrder spec is immutable'},
                      spec_schema['x-kubernetes-validations'])
        self.assertEqual(spec_strings_without_max_length(spec_schema), [])

    def test_catalog_item_crd_approval_policy_is_structural(self):
        self.assertEqual(structural_problems(CATALOG_ITEM_SCHEMA), [])

    def test_published_policies_validate_against_catalog_item_crd(self):
        for raw in (UNCONDITIONAL_POLICY, CONDITIONAL_POLICY, RETRY_POLICY, {'version': 'v9'}, None):
            with self.subTest(raw=raw):
                published = compile_approval_policy(
                    raw, parameter_specs=make_parameters(),
                    source={'agnosticvRepo': 'agnosticv', 'path': 'tests/item/prod.yaml', 'gitCommit': 'abc'},
                )
                self.assertEqual(validation_problems(published, APPROVAL_POLICY_SCHEMA), [])


class TestOrderSchemaValidation(unittest.IsolatedAsyncioTestCase):
    async def test_orders_and_controller_statuses_validate(self):
        clock = Clock()
        kube = FakeKube()
        grant_default_access(kube)
        controller = CatalogItemOrderController(kube, ControllerConfig(catalog_base_url='https://c'), clock=clock)
        approval_item = kube.add_catalog_item(make_catalog_item(raw_policy=MANAGER_POLICY))
        orders = []
        for index, order_type in enumerate(('service', 'workshop', 'selfPacedLab')):
            body = submission(order_type=order_type, key=f"key-schema-{index}",
                              salesforceItems=[{'id': '701', 'type': 'campaign'}])
            orders.append(await create_order(kube, approval_item, body=body))
        for order in orders:
            self.assertEqual(validation_problems(order, ORDER_SCHEMA), [])
            await controller.reconcile(order['metadata']['namespace'], order['metadata']['name'])
            current = await kube.get_order(order['metadata']['namespace'], order['metadata']['name'])
            self.assertEqual(current['status']['phase'], 'PendingApproval')
            self.assertEqual(validation_problems(current, ORDER_SCHEMA), [])

        plain_item = kube.add_catalog_item(make_catalog_item(name='tests.plain.prod'))
        order = await create_order(kube, plain_item, body=submission(
            key='key-schema-plain', catalogItem={'namespace': 'babylon-catalog-prod', 'name': 'tests.plain.prod'}))
        await controller.reconcile(order['metadata']['namespace'], order['metadata']['name'])
        current = await kube.get_order(order['metadata']['namespace'], order['metadata']['name'])
        ref = current['status']['attempts'][0]['resources'][0]
        kube.set_resource_status('ResourceClaim', ref['namespace'], ref['name'], complete_claim_status('provision-failed'))
        await controller.reconcile(order['metadata']['namespace'], order['metadata']['name'])
        current = await kube.get_order(order['metadata']['namespace'], order['metadata']['name'])
        self.assertEqual(current['status']['phase'], 'Failed')
        self.assertEqual(validation_problems(current, ORDER_SCHEMA), [])


HELM = shutil.which('helm')


def helm_template(chart, *args):
    result = subprocess.run(
        [HELM, 'template', os.path.join(REPO_ROOT, chart), *args],
        check=True, capture_output=True, text=True,
    )
    return [doc for doc in yaml.safe_load_all(result.stdout) if doc]


def find(docs, kind, name=None):
    return [doc for doc in docs if doc['kind'] == kind and (name is None or doc['metadata']['name'] == name)]


def order_rules(role):
    return {
        resource: sorted(rule['verbs'])
        for rule in role['rules'] for resource in rule['resources']
        if resource.startswith('catalogitemorders')
    }


@unittest.skipUnless(HELM, 'helm is not installed')
class TestHelm(unittest.TestCase):
    def test_disabled_by_default(self):
        docs = helm_template('catalog/helm')
        self.assertEqual([d for d in docs if 'order-controller' in d['metadata']['name']], [])
        api_role = find(docs, 'ClusterRole', 'babylon-catalog-api')[0]
        self.assertEqual(order_rules(api_role), {})
        api = find(docs, 'Deployment', 'babylon-catalog-api')[0]
        env = {e['name']: e.get('value') for e in api['spec']['template']['spec']['containers'][0]['env']}
        self.assertEqual(env['CATALOG_ITEM_ORDERS_ENABLED'], 'false')

    def test_enabled_renders_controller_with_least_privilege(self):
        docs = helm_template(
            'catalog/helm', '--set', 'catalogItemOrders.enabled=true',
            '--set', 'catalogItemOrders.controller.catalogBaseUrl=https://catalog.example.com',
            '--set', 'catalogItemOrders.controller.retry.maxAttempts=2',
        )
        api_role = find(docs, 'ClusterRole', 'babylon-catalog-api')[0]
        self.assertEqual(order_rules(api_role), {
            'catalogitemorders': ['create', 'get', 'list'],
            'catalogitemorders/status': ['get', 'update'],
        })
        controller_role = find(docs, 'ClusterRole', 'babylon-catalog-order-controller')[0]
        self.assertEqual(order_rules(controller_role), {
            'catalogitemorders': ['get', 'list', 'watch'],
            'catalogitemorders/status': ['get', 'update'],
        })
        for role in (api_role, controller_role):
            for rule in role['rules']:
                self.assertNotIn('*', rule['verbs'])
                self.assertNotIn('*', rule['resources'])
        binding = find(docs, 'ClusterRoleBinding', 'babylon-catalog-order-controller')[0]
        self.assertEqual(binding['subjects'][0]['name'], 'babylon-catalog-order-controller')
        self.assertTrue(find(docs, 'ServiceAccount', 'babylon-catalog-order-controller'))
        role = find(docs, 'Role', 'babylon-catalog-order-controller')[0]
        self.assertEqual(role['rules'][0]['resourceNames'], ['babylon-system-status'])

        deployment = find(docs, 'Deployment', 'babylon-catalog-order-controller')[0]
        pod = deployment['spec']['template']['spec']
        container = pod['containers'][0]
        self.assertEqual(pod['serviceAccountName'], 'babylon-catalog-order-controller')
        self.assertEqual(container['command'], ['python3', '/opt/app-root/src/catalog_item_order_controller.py'])
        api = find(docs, 'Deployment', 'babylon-catalog-api')[0]
        self.assertEqual(container['image'], api['spec']['template']['spec']['containers'][0]['image'])
        env = {e['name']: e.get('value') for e in container['env']}
        self.assertEqual(env['CATALOG_BASE_URL'], 'https://catalog.example.com')
        self.assertEqual(env['ORDER_RETRY_MAX_ATTEMPTS'], '2')
        self.assertFalse(container['securityContext']['allowPrivilegeEscalation'])
        api_env = {e['name']: e.get('value') for e in api['spec']['template']['spec']['containers'][0]['env']}
        self.assertEqual(api_env['CATALOG_ITEM_ORDERS_ENABLED'], 'true')

    def test_main_chart_crd_and_user_roles(self):
        docs = helm_template('helm', '--include-crds', '--set', 'environmentLevel=dev')
        crds = {doc['metadata']['name'] for doc in find(docs, 'CustomResourceDefinition')}
        self.assertIn('catalogitemorders.babylon.gpte.redhat.com', crds)
        for name in ('babylon-cluster-reader', 'babylon-cluster-admin'):
            with self.subTest(name):
                self.assertEqual(order_rules(find(docs, 'ClusterRole', name)[0]), {
                    'catalogitemorders': ['get', 'list', 'watch'],
                })
        for role in find(docs, 'ClusterRole'):
            if role['metadata']['name'] in ('babylon-cluster-reader', 'babylon-cluster-admin'):
                continue
            with self.subTest(role=role['metadata']['name']):
                self.assertEqual(order_rules(role), {}, 'users must not write or read orders directly')


if __name__ == '__main__':
    unittest.main()
