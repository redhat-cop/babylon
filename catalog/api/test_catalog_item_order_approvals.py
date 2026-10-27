import asyncio
import json
import os
import unittest
from datetime import timedelta
from unittest.mock import patch

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

import app as catalog_app
from approval_policy import compile_approval_policy
from catalog_item_order import cancel_order, format_time, request_retry
from catalog_item_order_approvals import ApprovalService, CachedManagerLookup
from catalog_item_order_controller import CatalogItemOrderController, ControllerConfig
from catalog_item_order_manager import (
    LOOKUP_NOT_FOUND,
    LOOKUP_UNAVAILABLE,
    ManagerLookupError,
    parse_manager_data,
)
from order_test_support import (
    NOW,
    USER_NAMESPACE,
    Clock,
    FakeKube,
    create_order,
    grant_default_access,
    make_catalog_item,
    make_parameters,
    make_session,
    submission,
)
from test_catalog_item_order_controller import MANAGER_POLICY, complete_claim_status

with open(os.path.join(os.path.dirname(__file__), 'fixtures', 'reporting_api', 'user_with_hierarchy.json')) as f:
    REPORTING_USER = json.load(f)

APPROVALS = '/api/catalog-item-order-approvals'
USERS = {
    name: {'metadata': {'name': name, 'uid': f"uid-{name}"}}
    for name in (
        'alice', 'dana.manager@example.com', 'director@example.com', 'bob@example.com',
        'admin@example.com', 'alice@example.com', 'manager-without-email',
    )
}


class FakeManagerLookup:
    def __init__(self):
        self.data = {'alice@example.com': parse_manager_data('alice@example.com', REPORTING_USER)}
        self.error = None
        self.calls = []

    async def get_manager_data(self, email):
        self.calls.append(email)
        if self.error:
            raise self.error
        if email not in self.data:
            raise ManagerLookupError(LOOKUP_NOT_FOUND, 'Requester is not known to the Reporting API')
        return self.data[email]


class ApprovalTestCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.clock = Clock()
        self.kube = FakeKube()
        grant_default_access(self.kube)
        self.lookup = FakeManagerLookup()
        self.config = ControllerConfig(catalog_base_url='https://catalog.example.com')
        self.controller = CatalogItemOrderController(self.kube, self.config, clock=self.clock, manager_resolver=self.lookup)
        self.item = self.kube.add_catalog_item(make_catalog_item(raw_policy=MANAGER_POLICY))
        self.sessions = {name: make_session(name, namespaces=(f"user-{name.split('@')[0]}",)) for name in USERS}
        self.sessions['alice'] = make_session('alice')
        for name in ('admin@example.com', 'alice@example.com'):
            self.sessions[name]['admin'] = True

        async def get_proxy_user(request):
            return USERS[request.headers.get('X-Test-User', 'alice')]

        async def get_user_session(request, user):
            return self.sessions[user['metadata']['name']]

        for target, value in (
            ('get_proxy_user', get_proxy_user),
            ('get_user_session', get_user_session),
            ('catalog_item_order_approval_service', lambda: ApprovalService(self.kube, self.lookup, clock=self.clock)),
            ('catalog_item_orders_enabled', True),
            ('audit_log', lambda *args, **kwargs: None),
        ):
            patcher = patch.object(catalog_app, target, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        application = web.Application()
        application.add_routes(catalog_app.routes)
        self.client = TestClient(TestServer(application))
        await self.client.start_server()
        self.addAsyncCleanup(self.client.close)

    async def pending_order(self, key='key-approve-1', **overrides):
        order = await create_order(self.kube, self.item, body=submission(key=key, **overrides), now=self.clock())
        return await self.reconcile(order)

    async def reconcile(self, order):
        await self.controller.reconcile(order['metadata']['namespace'], order['metadata']['name'])
        return await self.kube.get_order(order['metadata']['namespace'], order['metadata']['name'])

    async def call(self, method, path, user='dana.manager@example.com', body=None, headers=None, raw=None):
        request_headers = {'X-Test-User': user, **(headers or {})}
        if raw is not None:
            response = await self.client.request(method, path, data=raw, headers=request_headers)
        else:
            response = await self.client.request(method, path, json=body, headers=request_headers)
        if response.content_type != 'application/json':
            return response.status, await response.text()
        return response.status, await response.json()

    async def decide(self, order, action='approve', user='dana.manager@example.com', comment=None):
        body = {'comment': comment} if comment is not None else {}
        return await self.call('POST', f"{APPROVALS}/{order['metadata']['uid']}/{action}", user=user, body=body)

    def current(self, order):
        return self.kube.orders[(order['metadata']['namespace'], order['metadata']['name'])]


class TestManagerResolution(ApprovalTestCase):
    async def test_controller_resolves_direct_manager_for_notification(self):
        order = await self.pending_order()
        manager = order['status']['approval']['manager']
        self.assertEqual(manager['state'], 'Resolved')
        self.assertEqual(manager['directManager'], {'email': 'dana.manager@example.com', 'name': 'Dana Manager'})
        self.assertEqual(self.lookup.calls, ['alice@example.com'])
        self.assertEqual(order['status']['orderUrl'], f"https://catalog.example.com/orders/{USER_NAMESPACE}/{order['metadata']['name']}")
        self.assertNotIn('manager_levels', json.dumps(order['status']), 'only minimal manager metadata is kept')

    async def test_lookup_failures_stay_pending_and_retry_without_extending_expiry(self):
        self.lookup.error = ManagerLookupError(LOOKUP_UNAVAILABLE, 'Reporting API is unavailable')
        order = await self.pending_order()
        approval = order['status']['approval']
        expires_at = approval['expiresAt']
        self.assertEqual(order['status']['phase'], 'PendingApproval')
        self.assertEqual(approval['manager']['state'], 'Unresolved')
        self.assertEqual(approval['manager']['reason'], LOOKUP_UNAVAILABLE)
        self.assertIn('retrying', approval['manager']['message'])
        self.assertEqual(approval['manager']['nextAttemptAt'], format_time(NOW + timedelta(minutes=1)))
        condition = next(c for c in order['status']['conditions'] if c['type'] == 'ManagerResolved')
        self.assertEqual((condition['status'], condition['reason']), ('False', LOOKUP_UNAVAILABLE))

        order = await self.reconcile(order)
        self.assertEqual(len(self.lookup.calls), 1, 'backoff is respected')
        self.clock.advance(minutes=1)
        order = await self.reconcile(order)
        self.assertEqual(order['status']['approval']['manager']['attempts'], 2)
        self.assertEqual(order['status']['approval']['manager']['nextAttemptAt'],
                         format_time(self.clock() + timedelta(minutes=2)))

        self.lookup.error = None
        self.clock.advance(minutes=2)
        order = await self.reconcile(order)
        self.assertEqual(order['status']['approval']['manager']['state'], 'Resolved')
        self.assertEqual(order['status']['approval']['expiresAt'], expires_at)
        self.assertEqual(order['status']['phase'], 'PendingApproval')
        self.assertEqual(self.kube.resources, {})

    async def test_unresolvable_cases_never_approve_or_exempt(self):
        cases = {
            'not found': ('carol@example.com', None, LOOKUP_NOT_FOUND),
            'no direct manager': ('carol@example.com', 'empty', 'DirectManagerMissing'),
            'no requester email': (None, None, 'RequesterEmailMissing'),
        }
        from catalog_item_order import Requester
        for index, (name, (email, data, reason)) in enumerate(cases.items()):
            with self.subTest(name):
                if data == 'empty':
                    self.lookup.data['carol@example.com'] = parse_manager_data(
                        'carol@example.com', {'email': 'carol@example.com', 'manager': [], 'manager_levels': []})
                order = await create_order(
                    self.kube, self.item, body=submission(key=f"key-unres-{index}"),
                    requester=Requester(user='carol', uid=f"uid-carol-{index}", email=email), now=self.clock(),
                )
                order = await self.reconcile(order)
                self.assertEqual(order['status']['phase'], 'PendingApproval')
                self.assertEqual(order['status']['approval']['state'], 'Pending')
                self.assertEqual(order['status']['approval']['manager']['reason'], reason)
                self.assertNotIn('exemption', order['status']['approval'])
        self.clock.advance(hours=72)
        for order in list(self.kube.orders.values()):
            self.assertEqual((await self.reconcile(order))['status']['phase'], 'Expired')
        self.assertEqual(self.kube.resources, {})

    async def test_without_resolver_admin_must_review(self):
        self.controller.manager_resolver = None
        order = await self.pending_order()
        self.assertEqual(order['status']['approval']['manager']['reason'], 'ManagerLookupNotConfigured')
        self.assertNotIn('nextAttemptAt', order['status']['approval']['manager'])


class TestDecisions(ApprovalTestCase):
    async def test_direct_manager_approval_releases_provisioning_through_controller(self):
        order = await self.pending_order()
        status, data = await self.decide(order, comment='Go ahead')
        self.assertEqual(status, 200, data)
        decision = data['approval']['decision']
        self.assertEqual(decision['decidedBy'], 'dana.manager@example.com')
        self.assertEqual(decision['decidedByEmail'], 'dana.manager@example.com')
        self.assertEqual(decision['authority'], {'basis': 'direct_manager', 'source': 'reporting-api'})
        self.assertEqual(decision['comment'], 'Go ahead')
        self.assertEqual(decision['requestDigest'], order['spec']['requestDigest'])
        self.assertEqual(decision['policyDigest'], self.item['spec']['approvalPolicy']['digest'])
        self.assertEqual(self.kube.resources, {}, 'the decision endpoint never provisions')
        order = await self.reconcile(order)
        self.assertEqual(order['status']['phase'], 'Provisioning')
        self.assertEqual(len(self.kube.created), 1)

    async def test_higher_manager_can_deny_and_denial_does_not_provision(self):
        order = await self.pending_order()
        status, data = await self.decide(order, action='deny', user='director@example.com', comment='Too big')
        self.assertEqual(status, 200, data)
        self.assertEqual(data['approval']['decision']['authority'],
                         {'basis': 'management_chain', 'source': 'reporting-api', 'level': 3})
        order = await self.reconcile(order)
        self.assertEqual(order['status']['phase'], 'Denied')
        self.assertEqual(self.kube.resources, {})

    async def test_unrelated_and_self_decisions_are_rejected(self):
        order = await self.pending_order()
        for user, expected in (
            ('bob@example.com', (403, 'not_authorized')),
            ('manager-without-email', (403, 'not_authorized')),
            ('alice', (403, 'self_decision')),
            ('alice@example.com', (403, 'self_decision')),
        ):
            with self.subTest(user=user):
                status, data = await self.decide(order, user=user)
                self.assertEqual((status, data['error']), expected)
        self.assertNotIn('decision', self.current(order)['status']['approval'])

    async def test_admin_decides_across_namespaces_during_reporting_outage(self):
        order = await self.pending_order()
        self.lookup.error = ManagerLookupError(LOOKUP_UNAVAILABLE, 'down')
        status, data = await self.decide(order)
        self.assertEqual((status, data['error']), (503, 'manager_lookup_unavailable'))
        status, data = await self.decide(order, user='admin@example.com')
        self.assertEqual(status, 200, data)
        self.assertEqual(data['approval']['decision']['authority']['basis'], 'administrator')
        self.assertEqual((await self.reconcile(order))['status']['phase'], 'Provisioning')

    async def test_reporting_failures_never_grant_authority(self):
        order = await self.pending_order()
        for error in (ManagerLookupError(LOOKUP_NOT_FOUND, 'x'), ManagerLookupError('InvalidManagerData', 'x')):
            self.lookup.error = error
            status, _ = await self.decide(order)
            self.assertEqual(status, 403)
        self.assertNotIn('decision', self.current(order)['status']['approval'])

    async def test_relationship_is_revalidated_at_decision(self):
        order = await self.pending_order()
        self.lookup.data['alice@example.com'] = parse_manager_data(
            'alice@example.com', {'email': 'alice@example.com', 'manager': {'email': 'new.manager@example.com'}, 'manager_levels': []})
        status, data = await self.decide(order)
        self.assertEqual((status, data['error']), (403, 'not_authorized'),
                         'the notified manager is not authorized once the relationship changes')

    async def test_repeated_and_conflicting_decisions(self):
        order = await self.pending_order()
        self.assertEqual((await self.decide(order))[0], 200)
        self.assertEqual((await self.decide(order))[0], 200, 'identical repeat is idempotent')
        status, data = await self.decide(order, action='deny', user='director@example.com')
        self.assertEqual((status, data['error']), (409, 'already_decided'))
        await self.reconcile(order)
        status, data = await self.decide(order)
        self.assertEqual(status, 200, 'still idempotent after the controller transition')
        status, data = await self.decide(order, action='deny')
        self.assertEqual((status, data['error']), (409, 'already_decided'))

    async def test_concurrent_decisions_have_one_winner(self):
        order = await self.pending_order()
        results = await asyncio.gather(
            self.decide(order), self.decide(order, action='deny', user='director@example.com'),
            self.decide(order, user='admin@example.com'),
        )
        statuses = sorted(status for status, _ in results)
        self.assertEqual(statuses.count(200), 1, results)
        decision = self.current(order)['status']['approval']['decision']
        winners = [data for status, data in results if status == 200]
        self.assertEqual(winners[0]['approval']['decision']['decidedBy'], decision['decidedBy'])

    async def test_stale_terminal_and_changed_requests_are_rejected(self):
        expired = await self.pending_order(key='key-expired')
        cancelled = await self.pending_order(key='key-cancel1')
        await self.kube.replace_order_status(cancelled, cancel_order(cancelled, 'alice', self.clock()))
        policy_changed = await self.pending_order(key='key-policy1')
        self.clock.advance(hours=72)
        self.assertEqual(await self.decide(expired), (409, {'error': 'expired', 'message': 'Approval request has expired'}))
        self.assertEqual((await self.decide(cancelled))[1]['error'], 'not_pending')

        self.clock.now = NOW
        item = self.kube.catalog_items[(self.item['metadata']['namespace'], self.item['metadata']['name'])]
        item['spec']['approvalPolicy'] = compile_approval_policy(
            {**MANAGER_POLICY, 'default_reason': 'changed'}, parameter_specs=make_parameters())
        status, data = await self.decide(policy_changed)
        self.assertEqual((status, data['error']), (409, 'policy_changed'))
        item['spec']['approvalPolicy'] = self.item['spec']['approvalPolicy']
        item['spec']['runtime'] = {'default': '1h', 'maximum': '8h'}
        status, data = await self.decide(policy_changed)
        self.assertEqual((status, data['error']), (409, 'request_changed'))

    async def test_cancel_racing_decision_has_one_outcome(self):
        order = await self.pending_order()
        original = self.kube.replace_order_status
        cancelled = []

        async def cancel_first(current, status):
            if not cancelled:
                cancelled.append(True)
                fresh = await self.kube.get_order(USER_NAMESPACE, order['metadata']['name'])
                await original(fresh, cancel_order(fresh, 'alice', self.clock()))
            return await original(current, status)
        self.kube.replace_order_status = cancel_first
        status, data = await self.decide(order)
        self.kube.replace_order_status = original
        self.assertEqual((status, data['error']), (409, 'not_pending'))
        self.assertEqual(self.current(order)['status']['phase'], 'Cancelled')
        self.assertNotIn('decision', self.current(order)['status']['approval'])

    async def test_cross_site_and_malformed_requests(self):
        order = await self.pending_order()
        path = f"{APPROVALS}/{order['metadata']['uid']}/approve"
        status, data = await self.call('POST', path, raw='comment=ok', headers={'Content-Type': 'application/x-www-form-urlencoded'})
        self.assertEqual((status, data['error']), (415, 'unsupported_media_type'))
        status, data = await self.call('POST', path, body={}, headers={'Origin': 'https://evil.example.com'})
        self.assertEqual((status, data['error']), (403, 'cross_site_request'))
        status, data = await self.call('POST', path, body={'comment': 'x', 'outcome': 'Approved'})
        self.assertEqual((status, data['error']), (400, 'invalid_request'))
        status, data = await self.call('POST', path, body={'comment': 'x' * 2049})
        self.assertEqual((status, data['error']), (400, 'invalid_comment'))
        status, data = await self.call('POST', path, body={}, headers={'Impersonate-User': 'alice'}, user='admin@example.com')
        self.assertEqual((status, data['error']), (400, 'impersonation_not_supported'))
        self.assertNotIn('decision', self.current(order)['status']['approval'])

    async def test_retry_reuses_approval_without_new_request(self):
        order = await self.pending_order()
        await self.decide(order)
        order = await self.reconcile(order)
        requested_at = order['status']['approval']['requestedAt']
        ref = order['status']['attempts'][0]['resources'][0]
        self.kube.set_resource_status('ResourceClaim', ref['namespace'], ref['name'], complete_claim_status('provision-failed'))
        order = await self.reconcile(order)
        lookups_before_retry = len(self.lookup.calls)
        await self.kube.replace_order_status(order, request_retry(order, 'alice', self.clock()))
        order = await self.reconcile(order)
        self.assertEqual(order['status']['phase'], 'Provisioning')
        self.assertEqual(order['status']['approval']['state'], 'Approved')
        self.assertEqual(order['status']['approval']['requestedAt'], requested_at)
        self.assertEqual(len(self.lookup.calls), lookups_before_retry, 'no new manager resolution or approval request')


class TestReviewAndList(ApprovalTestCase):
    async def test_review_is_authenticated_sanitized_and_never_decides(self):
        order = await self.pending_order(order_type='workshop', workshop={'accessPassword': 'secret12'})
        writes = self.kube.status_writes
        path = f"{APPROVALS}/{order['metadata']['uid']}"
        for _ in range(3):
            status, data = await self.call('GET', path)
            self.assertEqual(status, 200, data)
        self.assertEqual(self.kube.status_writes, writes)
        self.assertNotIn('decision', self.current(order)['status']['approval'])
        self.assertTrue(data['canDecide'])
        self.assertEqual(data['authority']['basis'], 'direct_manager')
        self.assertEqual(data['requester'], {'user': 'alice', 'email': 'alice@example.com'})
        self.assertEqual(data['catalogItem']['displayName'], 'Test Item')
        self.assertEqual(data['reasons'], ['Manager approval is required for this catalog item.'])
        self.assertNotIn('secret12', json.dumps(data))
        status, data = await self.call('GET', path, user='bob@example.com')
        self.assertEqual((status, data['error']), (403, 'not_authorized'))
        status, data = await self.call('GET', f"{APPROVALS}/no-such-uid")
        self.assertEqual(status, 404)

    async def test_review_redacts_sensitive_parameters(self):
        parameters = [*make_parameters(),
                      {'name': 'db_password', 'openAPIV3Schema': {'type': 'string', 'default': 'hunter2'}},
                      {'name': 'pull_secret_value', 'openAPIV3Schema': {'type': 'string', 'format': 'password'}, 'value': 'abc'},
                      {'name': 'opaque', 'openAPIV3Schema': {'type': 'string', 'format': 'password'}, 'value': 'xyz'}]
        self.item = self.kube.add_catalog_item(make_catalog_item(raw_policy=MANAGER_POLICY, parameters=parameters))
        order = await self.pending_order()
        status, data = await self.call('GET', f"{APPROVALS}/{order['metadata']['uid']}")
        self.assertEqual(status, 200)
        for leaked in ('hunter2', 'abc', 'xyz', 'db_password', 'opaque'):
            self.assertNotIn(leaked, json.dumps(data['parameters']))
        self.assertEqual(data['parameters']['num_users'], 5)

    async def test_list_is_scoped_paginated_and_reports_outages(self):
        orders = [await self.pending_order(key=f"key-list-00{index}") for index in range(3)]
        from catalog_item_order import Requester
        other = await create_order(self.kube, self.item, body=submission(key='key-other-01'),
                                   requester=Requester(user='erin', uid='uid-erin', email='erin@example.com'))
        await self.reconcile(other)

        status, data = await self.call('GET', APPROVALS)
        self.assertEqual(status, 200)
        self.assertEqual({item['uid'] for item in data['items']}, {o['metadata']['uid'] for o in orders})
        self.assertFalse(data['incomplete'])

        status, data = await self.call('GET', APPROVALS, user='admin@example.com')
        self.assertEqual(len(data['items']), 4)
        self.assertEqual({item['authority']['basis'] for item in data['items']}, {'administrator'})

        status, page1 = await self.call('GET', f"{APPROVALS}?limit=2")
        self.assertEqual(len(page1['items']), 2)
        status, page2 = await self.call('GET', f"{APPROVALS}?limit=2&continue={page1['continue']}")
        self.assertEqual(len(page2['items']), 1)
        self.assertNotIn('continue', page2)

        await self.decide(orders[0])
        status, data = await self.call('GET', APPROVALS)
        self.assertEqual(len(data['items']), 2, 'decided orders leave the pending list')

        status, data = await self.call('GET', APPROVALS, user='bob@example.com')
        self.assertEqual(data['items'], [])
        status, data = await self.call('GET', APPROVALS, user='alice')
        self.assertEqual(data['items'], [], 'requesters never see their own orders as reviewable')

        self.lookup.error = ManagerLookupError(LOOKUP_UNAVAILABLE, 'down')
        status, data = await self.call('GET', APPROVALS)
        self.assertEqual((data['items'], data['incomplete']), ([], True))
        for query, code in (('limit=0', 'invalid_limit'), ('limit=x', 'invalid_limit'), ('continue=%%%', 'invalid_continue')):
            status, data = await self.call('GET', f"{APPROVALS}?{query}")
            self.assertEqual((status, data['error']), (400, code))

    async def test_disabled_feature_returns_404(self):
        with patch.object(catalog_app, 'catalog_item_orders_enabled', False):
            status, _ = await self.call('GET', APPROVALS)
        self.assertEqual(status, 404)


class TestCachedLookup(unittest.IsolatedAsyncioTestCase):
    async def test_caches_within_ttl(self):
        lookup = FakeManagerLookup()
        now = [0]
        cached = CachedManagerLookup(lookup, ttl=60, clock=lambda: now[0])
        await cached.get_manager_data('alice@example.com')
        await cached.get_manager_data('alice@example.com')
        now[0] = 61
        await cached.get_manager_data('alice@example.com')
        self.assertEqual(len(lookup.calls), 2)


if __name__ == '__main__':
    unittest.main()
