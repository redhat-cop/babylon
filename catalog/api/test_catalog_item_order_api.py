import json
import unittest
from unittest.mock import AsyncMock, patch

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

import app as catalog_app
from catalog_item_order_controller import CatalogItemOrderController, ControllerConfig
from catalog_item_order_service import CatalogItemOrderService
from catalog_order_policy import CatalogOrderPolicyError, reject_direct_catalog_item_order_write
from order_test_support import (
    CATALOG_ITEM_NAME,
    CATALOG_NAMESPACE,
    Clock,
    FakeKube,
    USER_NAMESPACE,
    USER_UID,
    grant_default_access,
    make_catalog_item,
    make_session,
    submission,
)
from test_catalog_item_order_controller import MANAGER_POLICY, complete_claim_status

USERS = {
    'alice': {'metadata': {'name': 'alice', 'uid': USER_UID}},
    'bob': {'metadata': {'name': 'bob', 'uid': 'uid-bob'}},
    'admin': {'metadata': {'name': 'admin', 'uid': 'uid-admin'}},
    'carol@example.com': {'metadata': {'name': 'carol@example.com', 'uid': 'uid-carol'}},
}
ORDERS = '/api/catalog-item-orders'


class OrderApiTestCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.clock = Clock()
        self.kube = FakeKube()
        grant_default_access(self.kube)
        self.item = self.kube.add_catalog_item(make_catalog_item())
        self.sessions = {
            'alice': make_session('alice'),
            'bob': make_session('bob', namespaces=('user-bob',)),
            'admin': make_session('admin', namespaces=('user-admin',), admin=True),
            'carol@example.com': make_session('carol@example.com', namespaces=('user-carol-example-com',)),
        }
        self.system_status = {}

        async def get_system_status():
            return dict(self.system_status)

        async def check_create_access(group, plural, namespace):
            return plural not in self.denied_plurals

        self.denied_plurals = set()

        def service(session):
            return CatalogItemOrderService(self.kube, get_system_status, check_create_access, clock=self.clock)

        async def get_proxy_user(request):
            return USERS[request.headers.get('X-Test-User', 'alice')]

        async def get_user_session(request, user):
            return self.sessions[user['metadata']['name']]

        for target, value in (
            ('get_proxy_user', get_proxy_user),
            ('get_user_session', get_user_session),
            ('catalog_item_order_service', service),
            ('catalog_item_orders_enabled', True),
        ):
            patcher = patch.object(catalog_app, target, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.audit = patch.object(catalog_app, 'audit_log')
        self.audit_log = self.audit.start()
        self.addCleanup(self.audit.stop)

        application = web.Application()
        application.add_routes(catalog_app.routes)
        self.client = TestClient(TestServer(application))
        await self.client.start_server()
        self.addAsyncCleanup(self.client.close)

    async def call(self, method, path, user='alice', body=None, headers=None):
        request_headers = {'X-Test-User': user, **(headers or {})}
        response = await self.client.request(method, path, json=body, headers=request_headers)
        if response.content_type != 'application/json':
            return response.status, await response.text()
        return response.status, await response.json()

    async def submit(self, user='alice', **overrides):
        return await self.call('POST', ORDERS, user=user, body=submission(**overrides))

    async def reconcile(self, data):
        controller = CatalogItemOrderController(self.kube, ControllerConfig(), clock=self.clock)
        await controller.reconcile(data['namespace'], data['name'])


class TestSubmit(OrderApiTestCase):
    async def test_disabled_by_default(self):
        with patch.object(catalog_app, 'catalog_item_orders_enabled', False):
            status, _ = await self.submit()
        self.assertEqual(status, 404)
        self.assertEqual(self.kube.orders, {})

    async def test_submit_derives_identity_from_session(self):
        status, data = await self.call(
            'POST', ORDERS, body=submission(), headers={'X-Forwarded-Email': 'alice@example.com'},
        )
        self.assertEqual(status, 202, data)
        self.assertEqual(data['phase'], 'Submitted')
        self.assertEqual(data['requester'], 'alice')
        self.assertEqual(data['statusUrl'], f"{ORDERS}/{USER_NAMESPACE}/{data['name']}")
        order = self.kube.orders[(USER_NAMESPACE, data['name'])]
        self.assertEqual(order['spec']['requester'], {'user': 'alice', 'uid': USER_UID},
                         'a client-supplied X-Forwarded-Email must not become the requester email')
        self.assertNotIn('status', order)
        self.assertEqual(self.kube.resources, {}, 'the API never creates provisioning resources')
        self.audit_log.assert_called()
        self.assertEqual(self.audit_log.call_args.args[0], 'catalog_item_order_submitted')

    async def test_requester_email_comes_from_user_name(self):
        status, data = await self.call(
            'POST', ORDERS, user='carol@example.com', headers={'X-Forwarded-Email': 'boss@example.com'},
            body=submission(namespace='user-carol-example-com'),
        )
        self.assertEqual(status, 202, data)
        order = self.kube.orders[('user-carol-example-com', data['name'])]
        self.assertEqual(order['spec']['requester']['email'], 'carol@example.com')

    async def test_requester_must_be_able_to_create_resources(self):
        self.denied_plurals = {'selfpacedlabs'}
        status, data = await self.submit(order_type='selfPacedLab')
        self.assertEqual((status, data['error']), (403, 'namespace_access_denied'))
        self.assertEqual(self.kube.orders, {})
        status, _ = await self.submit(order_type='workshop', key='key-workshop1')
        self.assertEqual(status, 202)

    async def test_idempotency(self):
        first_status, first = await self.submit()
        replay_status, replay = await self.submit()
        self.assertEqual((first_status, replay_status), (202, 200))
        self.assertEqual(first['id'], replay['id'])
        self.assertEqual(len(self.kube.orders), 1)

        status, data = await self.submit(parameters={'num_users': 9})
        self.assertEqual(status, 409)
        self.assertEqual(data['error'], 'idempotency_key_conflict')

        self.sessions['bob']['serviceNamespaces'].append({'name': USER_NAMESPACE})
        status, bob = await self.submit(user='bob')
        self.assertEqual(status, 202)
        self.assertNotEqual(bob['id'], first['id'], 'idempotency is scoped to the requester')

    async def test_rejects_forged_identity_approval_and_manifests(self):
        for field, value in (
            ('requester', {'user': 'bob'}),
            ('approval', {'state': 'Approved'}),
            ('status', {'phase': 'Ready'}),
            ('spec', {'provider': {'name': 'x'}}),
            ('metadata', {'name': 'mine'}),
        ):
            with self.subTest(field):
                status, data = await self.submit(**{field: value, 'key': f"key-{field}-0001"})
                self.assertEqual(status, 400)
                self.assertEqual(data['error'], 'invalid_request')
        self.assertEqual(self.kube.orders, {})

    async def test_impersonation_rejected(self):
        status, data = await self.call('POST', ORDERS, user='admin', body=submission(namespace='user-admin'),
                                       headers={'Impersonate-User': 'alice'})
        self.assertEqual(status, 400)
        self.assertEqual(data['error'], 'impersonation_not_supported')

    async def test_namespace_and_catalog_checks(self):
        status, data = await self.submit(namespace='user-bob')
        self.assertEqual((status, data['error']), (403, 'namespace_forbidden'))

        status, data = await self.submit(catalogItem={'namespace': 'other-catalog', 'name': CATALOG_ITEM_NAME})
        self.assertEqual((status, data['error']), (403, 'catalog_item_unavailable'))

        status, data = await self.submit(catalogItem={'namespace': CATALOG_NAMESPACE, 'name': 'missing.item.prod'})
        self.assertEqual((status, data['error']), (403, 'catalog_item_unavailable'))

    async def test_existing_ordering_restrictions_apply_at_submission(self):
        self.system_status = {'services_ordering_blocked': True, 'services_ordering_blocked_message': 'Maintenance'}
        status, data = await self.submit()
        self.assertEqual((status, data['error'], data['message']), (403, 'ordering_blocked', 'Maintenance'))
        status, _ = await self.submit(order_type='workshop', key='key-workshop1')
        self.assertEqual(status, 202)

        self.sessions['admin']['serviceNamespaces'] = [{'name': 'user-admin'}]
        status, _ = await self.submit(user='admin', namespace='user-admin', key='key-admin-01')
        self.assertEqual(status, 202, 'admins bypass ordering blocks as in the legacy proxy')

        self.system_status = {}
        self.kube.add_catalog_item(make_catalog_item(accessControl={'allowGroups': ['gpte']}))
        status, data = await self.submit(key='key-denied-1')
        self.assertEqual((status, data['error']), (403, 'catalog_item_access_denied'))

    async def test_validation_errors_are_reported(self):
        status, data = await self.submit(order_type='multiWorkshop')
        self.assertEqual((status, data['error']), (400, 'unsupported_order_type'))
        status, data = await self.submit(parameters={'num_users': 'lots'})
        self.assertEqual((status, data['error']), (400, 'invalid_parameter'))
        response = await self.client.post(ORDERS, data='{not json', headers={'X-Test-User': 'alice'})
        self.assertEqual(response.status, 400)
        self.assertEqual(self.kube.orders, {})

    async def test_backend_errors_are_503(self):
        self.system_status = None

        async def failing():
            raise RuntimeError('boom')
        async def allowed(group, plural, namespace):
            return True
        with patch.object(catalog_app, 'catalog_item_order_service',
                          lambda session: CatalogItemOrderService(self.kube, failing, allowed, clock=self.clock)):
            status, data = await self.submit()
        self.assertEqual((status, data['error']), (503, 'system_status_lookup_failed'))


class TestReadAndOwnership(OrderApiTestCase):
    async def test_get_and_list_are_owner_scoped(self):
        _, alice_order = await self.submit()
        _, bob_order = await self.call('POST', ORDERS, user='bob', body=submission(namespace='user-bob'))
        path = f"{ORDERS}/{USER_NAMESPACE}/{alice_order['name']}"

        status, data = await self.call('GET', path)
        self.assertEqual((status, data['id']), (200, alice_order['id']))
        self.assertIn('retry', data)

        status, data = await self.call('GET', path, user='bob')
        self.assertEqual((status, data['error']), (404, 'order_not_found'))

        status, data = await self.call('GET', ORDERS)
        self.assertEqual([item['id'] for item in data['items']], [alice_order['id']])
        status, data = await self.call('GET', ORDERS, user='bob')
        self.assertEqual([item['id'] for item in data['items']], [bob_order['id']])

        status, data = await self.call('GET', path, user='admin')
        self.assertEqual(status, 200)
        status, data = await self.call('GET', f"{ORDERS}?namespace={USER_NAMESPACE}", user='admin')
        self.assertEqual([item['id'] for item in data['items']], [alice_order['id']])

    async def test_loses_access_when_namespace_no_longer_owned(self):
        _, order = await self.submit()
        self.sessions['alice']['serviceNamespaces'] = []
        status, _ = await self.call('GET', f"{ORDERS}/{USER_NAMESPACE}/{order['name']}")
        self.assertEqual(status, 404)

    async def test_view_hides_workshop_password(self):
        _, order = await self.submit(order_type='workshop', workshop={'accessPassword': 'secret12'})
        status, data = await self.call('GET', f"{ORDERS}/{USER_NAMESPACE}/{order['name']}")
        self.assertNotIn('accessPassword', data['request']['workshop'])
        self.assertNotIn('secret12', json.dumps(data))


class TestCancelAndRetry(OrderApiTestCase):
    async def test_cancel_pending_order(self):
        self.kube.add_catalog_item(make_catalog_item(raw_policy=MANAGER_POLICY))
        _, order = await self.submit()
        await self.reconcile(order)
        path = f"{ORDERS}/{USER_NAMESPACE}/{order['name']}/cancel"

        status, data = await self.call('POST', path, user='bob')
        self.assertEqual(status, 404)

        status, data = await self.call('POST', path)
        self.assertEqual((status, data['phase']), (200, 'Cancelled'))
        status, data = await self.call('POST', path)
        self.assertEqual((status, data['error']), (409, 'order_finished'))
        await self.reconcile(order)
        self.assertEqual(self.kube.resources, {})

    async def test_cancel_after_dispatch_conflicts(self):
        _, order = await self.submit()
        await self.reconcile(order)
        status, data = await self.call('POST', f"{ORDERS}/{USER_NAMESPACE}/{order['name']}/cancel")
        self.assertEqual((status, data['error']), (409, 'dispatch_started'))

    async def test_cancel_retries_on_concurrent_update(self):
        _, order = await self.submit()
        original = self.kube.replace_order_status
        calls = []

        async def conflict_once(current, status):
            if not calls:
                calls.append(True)
                self.kube.force_status(USER_NAMESPACE, order['name'], lambda s: s.update(phase='Submitted'))
            return await original(current, status)
        self.kube.replace_order_status = conflict_once
        status, data = await self.call('POST', f"{ORDERS}/{USER_NAMESPACE}/{order['name']}/cancel")
        self.assertEqual((status, data['phase']), (200, 'Cancelled'))

    async def test_retry_endpoint_enforces_eligibility(self):
        _, order = await self.submit()
        path = f"{ORDERS}/{USER_NAMESPACE}/{order['name']}/retry"
        status, data = await self.call('POST', path)
        self.assertEqual((status, data['error']), (409, 'not_failed'))

        await self.reconcile(order)
        current = self.kube.orders[(USER_NAMESPACE, order['name'])]
        ref = current['status']['attempts'][0]['resources'][0]
        self.kube.set_resource_status('ResourceClaim', ref['namespace'], ref['name'], complete_claim_status('provision-failed'))
        await self.reconcile(order)

        status, data = await self.call('POST', path, user='bob')
        self.assertEqual(status, 404)
        status, data = await self.call('POST', path)
        self.assertEqual(status, 202, data)
        self.assertEqual(data['phase'], 'Failed')
        status, data = await self.call('POST', path)
        self.assertEqual((status, data['error']), (409, 'retry_pending'))

        self.clock.advance(hours=73)
        current = self.kube.orders[(USER_NAMESPACE, order['name'])]
        current['status'].pop('retry')
        status, data = await self.call('POST', path)
        self.assertEqual((status, data['error']), (409, 'retry_window_expired'))


class TestProxyBlocksDirectOrderWrites(unittest.IsolatedAsyncioTestCase):
    def test_reject_function(self):
        base = '/apis/babylon.gpte.redhat.com/v1/namespaces/user-alice/catalogitemorders'
        for method in ('POST', 'PUT', 'PATCH', 'DELETE', 'post'):
            for path in (base, f"{base}/order-1", f"{base}/order-1/status"):
                with self.subTest(method=method, path=path):
                    with self.assertRaises(CatalogOrderPolicyError) as caught:
                        reject_direct_catalog_item_order_write(method, path)
                    self.assertEqual(caught.exception.status, 403)
        reject_direct_catalog_item_order_write('GET', base)
        reject_direct_catalog_item_order_write('POST', '/apis/babylon.gpte.redhat.com/v1/namespaces/user-alice/workshops')

    async def test_proxy_returns_forbidden_without_calling_kubernetes(self):
        api_client = type('ApiClient', (), {})()
        api_client.default_headers = {}
        api_client.call_api = AsyncMock()
        api_client.close = AsyncMock()

        class Request:
            method = 'POST'
            path = '/apis/babylon.gpte.redhat.com/v1/namespaces/user-alice/catalogitemorders/order-1/status'
            headers = {'Content-Type': 'application/merge-patch+json'}
            content_type = 'application/json'
            can_read_body = True
            query = {}

            async def json(self):
                return {'status': {'approval': {'state': 'Approved'}}}

        with patch.object(catalog_app, 'get_proxy_user', AsyncMock(return_value=USERS['admin'])), \
                patch.object(catalog_app, 'get_user_session', AsyncMock(return_value=make_session('admin', admin=True))), \
                patch.object(catalog_app, 'set_impersonation_for_request', AsyncMock()), \
                patch.object(catalog_app, 'audit_log'):
            for method in ('POST', 'PATCH', 'PUT', 'DELETE'):
                request = Request()
                request.method = method
                response = await catalog_app.openshift_api_proxy(request, api_client)
                self.assertEqual(response.status, 403)
        api_client.call_api.assert_not_awaited()


class TestControllerIntegrationThroughApi(OrderApiTestCase):
    async def test_api_cancel_and_controller_dispatch_serialize(self):
        _, order = await self.submit()
        current = self.kube.orders[(USER_NAMESPACE, order['name'])]
        stale = json.loads(json.dumps(current))
        status, data = await self.call('POST', f"{ORDERS}/{USER_NAMESPACE}/{order['name']}/cancel")
        self.assertEqual(data['phase'], 'Cancelled')
        controller = CatalogItemOrderController(self.kube, ControllerConfig(), clock=self.clock)
        claim = await controller.step(stale)
        with self.assertRaises(Exception):
            await self.kube.replace_order_status(stale, claim)
        await self.reconcile(order)
        self.assertEqual(self.kube.orders[(USER_NAMESPACE, order['name'])]['status']['phase'], 'Cancelled')
        self.assertEqual(self.kube.resources, {})



if __name__ == '__main__':
    unittest.main()
