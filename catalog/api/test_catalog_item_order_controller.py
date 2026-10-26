import asyncio
import copy
import unittest
from datetime import timedelta
from unittest.mock import patch

from approval_policy import compile_approval_policy
from catalog_item_order import (
    cancel_order,
    format_time,
    record_approval_decision,
    request_retry,
    revoke_approval,
)
from catalog_item_order_adapters import build_resource, plan_resources
from catalog_item_order_controller import (
    CatalogItemOrderController,
    ControllerConfig,
    NoApprovalExemptions,
    order_needs_reconcile,
    run,
)
from catalog_item_order_kube import KubeError
from order_test_support import (
    Clock,
    FakeKube,
    NOW,
    USER_NAMESPACE,
    create_order,
    grant_default_access,
    make_catalog_item,
    make_parameters,
    submission,
)

BASE_URL = 'https://catalog.example.com'
MANAGER_POLICY = {'version': 'v1', 'default': 'manager_required', 'approval': {'expires_after': '72h'}}
LARGE_POLICY = {'version': 'v1', 'rules': {'large': {
    'when': {'all': [
        {'field': 'request.purpose', 'op': 'eq', 'value': 'Training - Internal'},
        {'field': 'parameters.num_users', 'op': 'gte', 'value': 20},
    ]},
    'require': 'manager',
    'reason': 'Large training environments require manager approval.',
}}}
RETRY_POLICY = {**MANAGER_POLICY, 'retry': {'window': '72h', 'max_attempts': 3}}


def complete_claim_status(current_state='started'):
    state = {'kind': 'AnarchySubject', 'spec': {'vars': {'current_state': current_state}}}
    if not current_state.endswith('failed'):
        state['status'] = {'towerJobs': {'provision': {'completeTimestamp': '2026-10-26T13:00:00Z'}}}
    return {'resources': [{'state': state}]}


class ControllerTestCase(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.clock = Clock()
        self.kube = FakeKube()
        grant_default_access(self.kube)
        self.config = ControllerConfig(catalog_base_url=BASE_URL)
        self.controller = CatalogItemOrderController(self.kube, self.config, clock=self.clock)

    def add_item(self, **kwargs):
        return self.kube.add_catalog_item(make_catalog_item(**kwargs))

    async def submit(self, catalog_item=None, body=None):
        catalog_item = catalog_item or self.add_item()
        return await create_order(self.kube, catalog_item, body=body, now=self.clock())

    async def reconcile(self, order, controller=None):
        controller = controller or self.controller
        metadata = order['metadata']
        await controller.reconcile(metadata['namespace'], metadata['name'])
        return await self.kube.get_order(metadata['namespace'], metadata['name'])

    def claims(self):
        return [key for key in self.kube.resources if key[0] == 'ResourceClaim']

    def set_claim_status(self, order, status, attempt=None):
        attempt = attempt or order['status']['attempts'][-1]
        ref = attempt['resources'][0]
        self.kube.set_resource_status('ResourceClaim', ref['namespace'], ref['name'], status)

    async def decide(self, order, outcome='Approved', decided_by='manager', **kwargs):
        current = await self.kube.get_order(order['metadata']['namespace'], order['metadata']['name'])
        status = record_approval_decision(
            current, outcome=outcome, decided_by=decided_by, now=self.clock(),
            source='test-decision-service', **kwargs,
        )
        await self.kube.replace_order_status(current, status)

    def history_events(self, order):
        return [entry['event'] for entry in order['status'].get('history', [])]


class TestNoApproval(ControllerTestCase):
    async def test_no_policy_order_creates_resources_once(self):
        order = await self.reconcile(await self.submit())
        self.assertEqual(order['status']['phase'], 'Provisioning')
        self.assertEqual(order['status']['approval']['state'], 'NotRequired')
        self.assertEqual(order['status']['policy']['state'], 'NotConfigured')
        self.assertEqual(len(self.claims()), 1)
        attempt = order['status']['attempts'][0]
        self.assertEqual(attempt['state'], 'Provisioning')
        self.assertTrue(attempt['resources'][0]['uid'])
        for _ in range(3):
            order = await self.reconcile(order)
        self.assertEqual(len(self.kube.created), 1)
        self.assertEqual(len(order['status']['attempts']), 1)

        self.set_claim_status(order, complete_claim_status())
        order = await self.reconcile(order)
        self.assertEqual(order['status']['phase'], 'Provisioned')
        self.assertEqual(order['status']['attempts'][0]['state'], 'Succeeded')
        self.assertIsNone(await self.controller.step(order))
        self.assertFalse(order_needs_reconcile(order))

    async def test_policy_not_matching_creates_resources(self):
        item = self.add_item(raw_policy=LARGE_POLICY)
        order = await self.reconcile(await self.submit(item, submission(parameters={'num_users': 10})))
        self.assertEqual(order['status']['phase'], 'Provisioning')
        self.assertEqual(order['status']['policy']['matchedRules'], [])
        self.assertEqual(order['status']['policy']['digest'], item['spec']['approvalPolicy']['digest'])
        self.assertEqual(order['status']['policy']['snapshot'], item['spec']['approvalPolicy'])
        self.assertEqual(len(self.claims()), 1)

    async def test_workshop_and_self_paced_lab_flows(self):
        for order_type, parent, child in (
            ('workshop', 'Workshop', 'WorkshopProvision'),
            ('selfPacedLab', 'SelfPacedLab', 'SelfPacedLabProvisionItem'),
        ):
            with self.subTest(order_type):
                self.kube.resources.clear()
                order = await self.reconcile(await self.submit(body=submission(order_type=order_type, key=f"key-{order_type}")))
                self.assertEqual(order['status']['phase'], 'Provisioning')
                kinds = sorted(key[0] for key in self.kube.resources)
                self.assertEqual(kinds, sorted([parent, child]))
                child_ref = order['status']['attempts'][0]['resources'][1]
                child_obj = await self.kube.get_resource(child_ref)
                parent_obj = await self.kube.get_resource(order['status']['attempts'][0]['resources'][0])
                self.assertEqual(child_obj['metadata']['ownerReferences'][0]['uid'], parent_obj['metadata']['uid'])
                status = (
                    {'activeCount': 1, 'provisioningCount': 0} if order_type == 'workshop'
                    else {'readyCount': 5, 'provisioningCount': 0}
                )
                self.kube.set_resource_status(child, child_ref['namespace'], child_ref['name'], status)
                order = await self.reconcile(order)
                self.assertEqual(order['status']['phase'], 'Provisioned')


class TestApprovalGate(ControllerTestCase):
    async def test_pending_order_creates_nothing_until_trusted_approval(self):
        item = self.add_item(raw_policy=MANAGER_POLICY)
        order = await self.reconcile(await self.submit(item))
        self.assertEqual(order['status']['phase'], 'PendingApproval')
        approval = order['status']['approval']
        self.assertEqual(approval['state'], 'Pending')
        self.assertEqual(approval['requestDigest'], order['spec']['requestDigest'])
        self.assertEqual(approval['policyDigest'], item['spec']['approvalPolicy']['digest'])
        self.assertEqual(approval['expiresAt'], format_time(NOW + timedelta(hours=72)))
        self.assertEqual(approval['reviewUrl'], f"{BASE_URL}/approvals/{order['metadata']['uid']}")
        self.assertEqual(approval['manager']['state'], 'Unresolved')
        self.assertEqual(order['status']['policy']['matchedRules'][0]['id'], 'default')
        for _ in range(3):
            self.clock.advance(hours=1)
            order = await self.reconcile(order)
        self.assertEqual(order['status']['phase'], 'PendingApproval')
        self.assertEqual(self.kube.resources, {})

        await self.decide(order)
        order = await self.reconcile(order)
        self.assertEqual(order['status']['approval']['state'], 'Approved')
        self.assertEqual(order['status']['approval']['satisfiedAt'], format_time(self.clock()))
        self.assertEqual(order['status']['phase'], 'Provisioning')
        self.assertEqual(len(self.claims()), 1)
        self.assertIn('Approved', self.history_events(order))

    async def test_approval_delay_does_not_shorten_default_schedule(self):
        item = self.add_item(raw_policy=MANAGER_POLICY)
        order = await self.reconcile(await self.submit(item))
        self.clock.advance(hours=30)
        await self.decide(order)
        order = await self.reconcile(order)
        self.assertEqual(order['status']['phase'], 'Provisioning')
        approved_at = self.clock()
        self.assertEqual(order['status']['attempts'][0]['schedule'], {
            'end': format_time(approved_at + timedelta(days=3)),
            'stop': format_time(approved_at + timedelta(hours=4)),
        })
        claim = await self.kube.get_resource(order['status']['attempts'][0]['resources'][0])
        self.assertEqual(claim['spec']['lifespan']['end'], format_time(approved_at + timedelta(days=3)))
        self.assertEqual(claim['spec']['provider']['parameterValues']['stop_timestamp'],
                         format_time(approved_at + timedelta(hours=4)))

    async def test_conditional_policy_uses_normalized_defaults(self):
        item = self.add_item(raw_policy=LARGE_POLICY, parameters=[
            *[p for p in make_parameters() if p['name'] != 'num_users'],
            {'name': 'num_users', 'openAPIV3Schema': {'type': 'integer', 'default': 25}},
        ])
        order = await self.reconcile(await self.submit(item))
        self.assertEqual(order['status']['phase'], 'PendingApproval')
        self.assertEqual(order['status']['policy']['matchedRules'], [{
            'id': 'large', 'reason': 'Large training environments require manager approval.',
        }])
        self.assertEqual(self.kube.resources, {})

    async def test_denial_expiry_and_cancellation_do_not_provision(self):
        item = self.add_item(raw_policy=MANAGER_POLICY)
        denied = await self.reconcile(await self.submit(item, submission(key='key-denied1')))
        await self.decide(denied, outcome='Denied')
        denied = await self.reconcile(denied)
        self.assertEqual(denied['status']['phase'], 'Denied')
        self.assertEqual(denied['status']['approval']['state'], 'Denied')

        expired = await self.reconcile(await self.submit(item, submission(key='key-expired')))
        self.clock.advance(hours=72)
        expired = await self.reconcile(expired)
        self.assertEqual(expired['status']['phase'], 'Expired')
        self.assertEqual(expired['status']['approval']['state'], 'Expired')

        cancelled = await self.reconcile(await self.submit(item, submission(key='key-cancel1')))
        await self.kube.replace_order_status(cancelled, cancel_order(cancelled, 'alice', self.clock()))
        cancelled = await self.reconcile(cancelled)
        self.assertEqual(cancelled['status']['phase'], 'Cancelled')

        for order in (denied, expired, cancelled):
            self.kube.force_status(order['metadata']['namespace'], order['metadata']['name'], lambda status: status['approval'].update(
                decision={'outcome': 'Approved', 'decidedBy': 'manager', 'decidedAt': format_time(self.clock()),
                          'requestDigest': order['spec']['requestDigest'], 'policyDigest': status['approval'].get('policyDigest'),
                          'source': 'late'}))
            order = await self.reconcile(order)
            self.assertIn(order['status']['phase'], ('Denied', 'Expired', 'Cancelled'))
        self.assertEqual(self.kube.resources, {})

    async def test_forged_or_stale_decisions_do_not_release(self):
        item = self.add_item(raw_policy=MANAGER_POLICY)
        cases = {
            'wrong request digest': {'requestDigest': 'sha256:forged'},
            'wrong policy digest': {'policyDigest': 'sha256:other'},
            'self approval': {'decidedBy': 'alice'},
            'after expiry': {'decidedAt': format_time(NOW + timedelta(hours=80))},
            'no source': {'source': ''},
        }
        for index, (name, override) in enumerate(cases.items()):
            with self.subTest(name):
                order = await self.reconcile(await self.submit(item, submission(key=f"key-forge-{index}")))

                def forge(status, order=order, override=override):
                    decision = {
                        'outcome': 'Approved', 'decidedBy': 'manager', 'decidedAt': format_time(self.clock()),
                        'requestDigest': order['spec']['requestDigest'],
                        'policyDigest': status['approval']['policyDigest'], 'source': 'forger',
                    }
                    decision.update(override)
                    status['approval']['decision'] = decision
                self.kube.force_status(order['metadata']['namespace'], order['metadata']['name'], forge)
                order = await self.reconcile(order)
                self.assertEqual(order['status']['phase'], 'PendingApproval')
                condition = next(c for c in order['status']['conditions'] if c['type'] == 'ApprovalSatisfied')
                self.assertEqual(condition['reason'], 'InvalidDecision')
                writes = self.kube.status_writes
                order = await self.reconcile(order)
                self.assertEqual(self.kube.status_writes, writes, 'invalid decision must not churn status')
        self.assertEqual(self.kube.resources, {})

    async def test_revoked_pending_approval_is_denied(self):
        item = self.add_item(raw_policy=MANAGER_POLICY)
        order = await self.reconcile(await self.submit(item))
        await self.kube.replace_order_status(order, revoke_approval(order, revoked_by='manager', reason='No', now=self.clock()))
        order = await self.reconcile(order)
        self.assertEqual(order['status']['phase'], 'Denied')
        self.assertEqual(order['status']['approval']['state'], 'Revoked')

    async def test_policy_change_while_pending_blocks(self):
        item = self.add_item(raw_policy=MANAGER_POLICY)
        order = await self.reconcile(await self.submit(item))
        item['spec']['approvalPolicy'] = compile_approval_policy(
            {**MANAGER_POLICY, 'approval': {'expires_after': '24h'}}, parameter_specs=make_parameters(),
        )
        self.kube.catalog_items[(item['metadata']['namespace'], item['metadata']['name'])] = item
        await self.decide(order)
        order = await self.reconcile(order)
        self.assertEqual(order['status']['phase'], 'Blocked')
        self.assertEqual(order['status']['blocked']['reason'], 'PolicyChanged')
        self.assertFalse(order['status']['blocked']['recoverable'])
        self.assertEqual(self.kube.resources, {})

    async def test_exemption_extension_point_never_exempts_by_default(self):
        self.assertIsNone(await NoApprovalExemptions().find_exemption({}, {}))

        class Exempt:
            async def find_exemption(self, order, evaluation):
                return {'source': 'test', 'reason': 'test exemption'}
        controller = CatalogItemOrderController(self.kube, self.config, clock=self.clock, exemptions=Exempt())
        item = self.add_item(raw_policy=MANAGER_POLICY)
        order = await self.reconcile(await self.submit(item), controller)
        self.assertEqual(order['status']['approval']['state'], 'NotRequired')
        self.assertEqual(order['status']['approval']['exemption']['source'], 'test')


class TestPolicyFailuresBlock(ControllerTestCase):
    async def test_invalid_policy_blocks_then_recovers_with_fresh_evaluation(self):
        item = self.add_item(raw_policy={'version': 'v9'})
        order = await self.reconcile(await self.submit(item))
        self.assertEqual(order['status']['phase'], 'Blocked')
        self.assertEqual(order['status']['blocked']['reason'], 'PolicyInvalid')
        self.assertTrue(order['status']['blocked']['recoverable'])
        self.assertEqual(self.kube.resources, {})
        writes = self.kube.status_writes
        order = await self.reconcile(order)
        self.assertEqual(self.kube.status_writes, writes)

        item['spec']['approvalPolicy'] = compile_approval_policy(MANAGER_POLICY, parameter_specs=make_parameters())
        self.kube.catalog_items[(item['metadata']['namespace'], item['metadata']['name'])] = item
        order = await self.reconcile(order)
        self.assertEqual(order['status']['phase'], 'PendingApproval')
        self.assertEqual(self.kube.resources, {})

    async def test_runtime_type_error_blocks(self):
        parameters = [*make_parameters(), {'name': 'free'}]
        policy = {'version': 'v1', 'rules': {'free': {
            'when': {'field': 'parameters.free', 'op': 'gte', 'value': 1},
            'require': 'manager', 'reason': 'x'}}}
        item = self.add_item(raw_policy=policy, parameters=parameters)
        order = await self.reconcile(await self.submit(item, submission(parameters={'free': 'many'})))
        self.assertEqual(order['status']['phase'], 'Blocked')
        self.assertEqual(order['status']['blocked']['reason'], 'PolicyEvaluationFailed')
        self.assertEqual(self.kube.resources, {})

    async def test_policy_on_free_text_purpose_blocks(self):
        parameters = [p for p in make_parameters() if p['name'] != 'purpose']
        policy = {'version': 'v1', 'rules': {'not_demo': {
            'when': {'field': 'request.purpose', 'op': 'ne', 'value': 'Customer Demo'},
            'require': 'manager', 'reason': 'x'}}}
        item = self.add_item(raw_policy=policy, parameters=parameters)
        order = await self.reconcile(await self.submit(item, submission(purpose=None)))
        self.assertEqual(order['status']['blocked']['reason'], 'PolicyEvaluationFailed')
        self.assertEqual(self.kube.resources, {})

    async def test_whole_number_policy_literals_survive_storage(self):
        policy = {'version': 'v1', 'rules': {'long': {
            'when': {'field': 'request.duration_hours', 'op': 'gt', 'value': 48.0},
            'require': 'manager', 'reason': 'Long environments require approval.'}}}
        item = self.add_item(raw_policy=policy)
        self.assertEqual(item['spec']['approvalPolicy']['rules'][0]['when']['value'], 48)
        order = await self.reconcile(await self.submit(item))
        self.assertEqual(order['status']['phase'], 'PendingApproval')

    async def test_hand_edited_published_policy_blocks(self):
        item = make_catalog_item(raw_policy=MANAGER_POLICY)
        item['spec']['approvalPolicy']['default'] = 'not_required'
        item = self.kube.add_catalog_item(item)
        order = await self.reconcile(await self.submit(item))
        self.assertEqual(order['status']['blocked']['reason'], 'PolicyInvalid')
        self.assertEqual(self.kube.resources, {})

    async def test_catalog_item_changes(self):
        item = self.add_item()
        order = await self.submit(item)
        changed = copy.deepcopy(item)
        changed['spec']['parameters'][2]['openAPIV3Schema']['default'] = 50
        self.kube.catalog_items[(item['metadata']['namespace'], item['metadata']['name'])] = changed
        order = await self.reconcile(order)
        self.assertEqual(order['status']['blocked']['reason'], 'CatalogItemChanged')

        cosmetic = copy.deepcopy(item)
        cosmetic['spec']['description'] = {'content': 'new', 'format': 'html'}
        self.kube.catalog_items[(item['metadata']['namespace'], item['metadata']['name'])] = cosmetic
        order = await self.reconcile(await self.submit(item, submission(key='key-cosmetic')))
        self.assertEqual(order['status']['phase'], 'Provisioning')

    async def test_tampered_spec_blocks_without_provisioning(self):
        item = self.add_item(raw_policy=MANAGER_POLICY)
        order = await self.submit(item)
        self.kube.tamper_spec(USER_NAMESPACE, order['metadata']['name'], lambda spec: spec['request']['parameters'].update(num_users=1))
        order = await self.reconcile(order)
        self.assertEqual(order['status']['phase'], 'Blocked')
        self.assertEqual(order['status']['blocked']['reason'], 'OrderIntegrity')
        self.assertEqual(self.kube.resources, {})

    async def test_policy_added_before_dispatch_of_not_required_order_reevaluates(self):
        item = self.add_item()
        self.kube.system_status = {'services_ordering_blocked': True, 'services_ordering_blocked_message': 'Maintenance'}
        order = await self.reconcile(await self.submit(item))
        self.assertEqual(order['status']['blocked']['reason'], 'OrderingBlocked')
        item['spec']['approvalPolicy'] = compile_approval_policy(MANAGER_POLICY, parameter_specs=make_parameters())
        self.kube.catalog_items[(item['metadata']['namespace'], item['metadata']['name'])] = item
        self.kube.system_status = {}
        order = await self.reconcile(order)
        self.assertEqual(order['status']['phase'], 'PendingApproval')
        self.assertEqual(self.kube.resources, {})


class TestDispatchRestrictions(ControllerTestCase):
    async def test_ordering_block_holds_and_resumes(self):
        self.kube.system_status = {'services_ordering_blocked': True, 'services_ordering_blocked_message': 'Maintenance'}
        order = await self.reconcile(await self.submit())
        self.assertEqual(order['status']['phase'], 'Blocked')
        self.assertEqual(order['status']['blocked'], {
            'reason': 'OrderingBlocked', 'message': 'Maintenance', 'recoverable': True,
            'resumePhase': 'Ready', 'since': format_time(NOW),
        })
        self.assertTrue(order_needs_reconcile(order))
        self.assertEqual(self.kube.resources, {})
        self.kube.system_status = {}
        order = await self.reconcile(order)
        self.assertEqual(order['status']['phase'], 'Provisioning')
        self.assertEqual(len(self.claims()), 1)

    async def test_workshop_block_key_applies_to_workshops_only(self):
        self.kube.system_status = {'workshops_ordering_blocked': True}
        service = await self.reconcile(await self.submit(body=submission(key='key-service1')))
        workshop = await self.reconcile(await self.submit(body=submission(order_type='workshop', key='key-workshop')))
        self.assertEqual(service['status']['phase'], 'Provisioning')
        self.assertEqual(workshop['status']['blocked']['message'], 'Ordering is temporarily unavailable')

    async def test_access_revoked_after_submission_blocks(self):
        item = self.add_item(accessControl={'allowGroups': ['rhpds-users']})
        order = await self.submit(item)
        self.kube.user_groups['alice'] = ['other-group']
        order = await self.reconcile(order)
        self.assertEqual(order['status']['blocked']['reason'], 'CatalogItemAccessDenied')
        self.kube.admins.add('alice')
        order = await self.reconcile(order)
        self.assertEqual(order['status']['phase'], 'Provisioning')

    async def test_namespace_access_required(self):
        self.kube.namespace_access['alice'].clear()
        order = await self.reconcile(await self.submit())
        self.assertEqual(order['status']['blocked']['reason'], 'NamespaceAccessDenied')
        self.assertEqual(self.kube.resources, {})

    async def test_admin_bypasses_ordering_block(self):
        self.kube.admins.add('alice')
        self.kube.system_status = {'services_ordering_blocked': True}
        order = await self.reconcile(await self.submit())
        self.assertEqual(order['status']['phase'], 'Provisioning')

    async def test_system_status_error_does_not_dispatch(self):
        self.kube.system_status = KubeError(500, 'boom')
        order = await self.submit()
        with self.assertRaises(KubeError):
            await self.reconcile(order)
        self.assertEqual(self.kube.resources, {})

    async def test_schedule_expired_before_dispatch(self):
        self.kube.system_status = {'services_ordering_blocked': True}
        order = await self.reconcile(await self.submit(body=submission(
            schedule={'end': format_time(NOW + timedelta(hours=10)), 'stop': format_time(NOW + timedelta(hours=4))})))
        self.clock.advance(hours=5)
        order = await self.reconcile(order)
        self.assertEqual(order['status']['blocked']['reason'], 'ScheduleExpired')
        self.assertFalse(order['status']['blocked']['recoverable'])
        self.assertFalse(order_needs_reconcile(order))


class TestDurability(ControllerTestCase):
    async def test_concurrent_reconcilers_create_one_environment(self):
        order = await self.submit()
        other = CatalogItemOrderController(self.kube, self.config, clock=self.clock)
        await asyncio.gather(
            self.reconcile(order), self.reconcile(order, other), self.reconcile(order), self.reconcile(order, other),
        )
        order = await self.kube.get_order(USER_NAMESPACE, order['metadata']['name'])
        self.assertEqual(len(self.kube.created), 1)
        self.assertEqual(len(order['status']['attempts']), 1)

    async def test_restart_after_create_before_status_persisted(self):
        order = await self.submit(body=submission(order_type='workshop'))
        # Advance to the recorded dispatch plan: Submitted -> Ready -> Provisioning/Dispatching.
        order = await self.kube.replace_order_status(order, await self.controller.step(order))
        order = await self.kube.replace_order_status(order, await self.controller.step(order))
        self.assertEqual(order['status']['attempts'][0]['state'], 'Dispatching')

        # Resources are created but the status write recording them fails.
        self.kube.fail_next_status_write = 1
        with self.assertRaises(KubeError):
            await self.controller.reconcile(USER_NAMESPACE, order['metadata']['name'])
        self.assertEqual(len(self.kube.created), 2)
        order = await self.kube.get_order(USER_NAMESPACE, order['metadata']['name'])
        self.assertEqual(order['status']['attempts'][0]['state'], 'Dispatching')

        restarted = CatalogItemOrderController(self.kube, self.config, clock=self.clock)
        order = await self.reconcile(order, restarted)
        self.assertEqual(len(self.kube.created), 2, 'restart rediscovers instead of creating duplicates')
        self.assertEqual(order['status']['attempts'][0]['state'], 'Provisioning')
        self.assertTrue(all(ref.get('uid') for ref in order['status']['attempts'][0]['resources']))

    async def test_partial_creation_resumes_same_plan(self):
        item = self.add_item()
        order = await self.submit(item, submission(order_type='workshop'))
        status = await self.controller.step(order)
        order = await self.kube.replace_order_status(order, status)
        order = await self.kube.replace_order_status(order, await self.controller.step(order))
        workshop_ref, provision_ref = order['status']['attempts'][0]['resources']
        workshop = build_resource(order, workshop_ref, catalog_item=item, attempt=1,
                                  schedule=order['status']['attempts'][0]['schedule'], created={}, now=NOW)
        await self.kube.create_resource(workshop_ref, workshop)
        order = await self.reconcile(order)
        self.assertEqual(order['status']['phase'], 'Provisioning')
        self.assertEqual(len([k for k in self.kube.resources if k[0] == 'Workshop']), 1)
        self.assertEqual(len([k for k in self.kube.resources if k[0] == 'WorkshopProvision']), 1)

    async def test_name_collision_is_never_adopted(self):
        item = self.add_item()
        order = await self.submit(item)
        ref = plan_resources(order, 'c0111de5')[0]
        foreign = {'apiVersion': 'poolboy.gpte.redhat.com/v1', 'kind': 'ResourceClaim',
                   'metadata': {'name': ref['name'], 'namespace': ref['namespace'], 'labels': {}}, 'spec': {}}
        self.kube.put_resource(foreign)
        with patch('catalog_item_order_controller.generate_name_suffix', return_value='c0111de5'):
            order = await self.reconcile(order)
        self.assertEqual(order['status']['phase'], 'Blocked')
        self.assertEqual(order['status']['blocked']['reason'], 'NameCollision')
        self.assertEqual((await self.kube.get_resource(ref))['metadata']['labels'], {})
        self.assertEqual(self.kube.created, [])

    async def test_cancel_racing_dispatch_has_one_winner(self):
        order = await self.submit()
        order = await self.kube.replace_order_status(order, await self.controller.step(order))
        self.assertEqual(order['status']['phase'], 'Ready')
        original_get = self.kube.get_order
        injected = []

        async def get_then_cancel(namespace, name):
            current = await original_get(namespace, name)
            if not injected and current['status']['phase'] == 'Ready':
                injected.append(True)
                await self.kube.replace_order_status(current, cancel_order(current, 'alice', self.clock()))
            return current
        self.kube.get_order = get_then_cancel
        await self.controller.reconcile(USER_NAMESPACE, order['metadata']['name'])
        self.kube.get_order = original_get
        order = await self.kube.get_order(USER_NAMESPACE, order['metadata']['name'])
        self.assertEqual(order['status']['phase'], 'Cancelled')
        self.assertEqual(self.kube.resources, {})

        dispatched = await self.reconcile(await self.submit(body=submission(key='key-race-2')))
        with self.assertRaises(Exception):
            cancel_order(dispatched, 'alice', self.clock())

    async def test_resumed_dispatch_rechecks_before_creating(self):
        item = self.add_item(raw_policy=MANAGER_POLICY)
        order = await self.reconcile(await self.submit(item))
        await self.decide(order)
        order = await self.kube.get_order(USER_NAMESPACE, order['metadata']['name'])
        order = await self.kube.replace_order_status(order, await self.controller.step(order))
        order = await self.kube.replace_order_status(order, await self.controller.step(order))
        self.assertEqual(order['status']['attempts'][0]['state'], 'Dispatching')
        # Controller stopped after the claim; approval is revoked before it resumes.
        self.kube.force_status(USER_NAMESPACE, order['metadata']['name'], lambda status: status['approval'].update(
            revocation={'revokedAt': format_time(NOW), 'revokedBy': 'manager', 'reason': 'no'}))
        order = await self.reconcile(order)
        self.assertEqual(self.kube.resources, {})
        self.assertEqual(order['status']['phase'], 'Blocked')
        self.assertEqual(order['status']['blocked']['reason'], 'ApprovalRevoked')
        self.assertEqual(order['status'].get('attempts'), [])
        self.assertIn('DispatchAborted', self.history_events(order))

    async def test_resumed_dispatch_waits_for_ordering_block(self):
        order = await self.submit()
        order = await self.kube.replace_order_status(order, await self.controller.step(order))
        order = await self.kube.replace_order_status(order, await self.controller.step(order))
        self.kube.system_status = {'services_ordering_blocked': True, 'services_ordering_blocked_message': 'Maintenance'}
        order = await self.reconcile(order)
        self.assertEqual(order['status']['blocked']['reason'], 'OrderingBlocked')
        self.assertEqual(self.kube.resources, {})
        self.kube.system_status = {}
        order = await self.reconcile(order)
        self.assertEqual(order['status']['phase'], 'Provisioning')
        self.assertEqual(len(self.claims()), 1)

    async def test_planned_names_are_not_exposed_before_creation(self):
        order = await self.submit()
        order = await self.kube.replace_order_status(order, await self.controller.step(order))
        order = await self.kube.replace_order_status(order, await self.controller.step(order))
        planned = order['status']['attempts'][0]['resources'][0]['name']
        from catalog_item_order import order_view
        self.assertNotIn(planned, str(order_view(order, self.clock())))

    async def test_deleted_resources_fail_without_retry(self):
        order = await self.reconcile(await self.submit())
        ref = order['status']['attempts'][0]['resources'][0]
        await self.kube.delete_resource(ref)
        order = await self.reconcile(order)
        self.assertEqual(order['status']['phase'], 'Failed')
        self.assertEqual(order['status']['attempts'][0]['failure']['reason'], 'ResourcesDeleted')
        self.assertFalse(order['status']['attempts'][0]['failure']['retryable'])

    async def test_create_rejection_fails_attempt(self):
        self.kube.create_errors['ResourceClaim'] = KubeError(422, 'Invalid')
        order = await self.reconcile(await self.submit())
        self.assertEqual(order['status']['phase'], 'Failed')
        self.assertEqual(order['status']['attempts'][0]['failure']['reason'], 'CreateRejected')
        self.kube.create_errors['ResourceClaim'] = KubeError(503, 'Unavailable')
        retry_order = await self.submit(body=submission(key='key-transient'))
        with self.assertRaises(KubeError):
            await self.reconcile(retry_order)
        retry_order = await self.kube.get_order(USER_NAMESPACE, retry_order['metadata']['name'])
        self.assertEqual(retry_order['status']['attempts'][0]['state'], 'Dispatching')


class TestRetry(ControllerTestCase):
    async def failed_order(self, policy=RETRY_POLICY):
        item = self.add_item(raw_policy=policy) if policy else self.add_item()
        order = await self.reconcile(await self.submit(item))
        if order['status']['phase'] == 'PendingApproval':
            await self.decide(order)
            order = await self.reconcile(order)
        self.set_claim_status(order, complete_claim_status('provision-failed'))
        order = await self.reconcile(order)
        self.assertEqual(order['status']['phase'], 'Failed')
        return item, order

    async def request_retry(self, order):
        await self.kube.replace_order_status(order, request_retry(order, 'alice', self.clock()))
        return await self.reconcile(order)

    async def test_retry_reuses_approval_after_cleanup(self):
        _, order = await self.failed_order()
        first_claim = order['status']['attempts'][0]['resources'][0]
        self.assertEqual(order['status']['attempts'][0]['failure']['reason'], 'ProvisioningFailed')
        self.assertTrue(order['status']['attempts'][0]['failure']['retryable'])
        self.assertEqual(order['status']['policy']['retryLimits'], {'window': '72h', 'maxAttempts': 3})
        self.kube.delete_finalizers = True
        order = await self.request_retry(order)
        self.assertEqual(order['status']['phase'], 'Failed')
        self.assertEqual(order['status']['attempts'][0]['state'], 'CleaningUp')
        self.assertEqual(len(order['status']['attempts']), 1, 'only one active attempt')
        self.kube.finish_deletions()
        order = await self.reconcile(order)
        self.assertEqual(order['status']['phase'], 'Provisioning')
        self.assertEqual([a['state'] for a in order['status']['attempts']], ['CleanedUp', 'Provisioning'])
        second_claim = order['status']['attempts'][1]['resources'][0]
        self.assertNotEqual(first_claim['name'], second_claim['name'])
        self.assertEqual(self.claims(), [('ResourceClaim', second_claim['namespace'], second_claim['name'])])
        self.assertEqual(order['status']['approval']['state'], 'Approved')
        self.assertIn('DecisionApproved', self.history_events(order))

    async def test_relabelled_failed_resources_are_still_cleaned_up(self):
        _, order = await self.failed_order()
        ref = order['status']['attempts'][0]['resources'][0]
        key = ('ResourceClaim', ref['namespace'], ref['name'])
        self.kube.resources[key]['metadata']['labels'] = {}
        order = await self.request_retry(order)
        self.assertNotIn(key, self.kube.resources, 'requester relabelling must not keep the old environment')
        self.assertEqual(len(self.claims()), 1)
        self.assertEqual([a['state'] for a in order['status']['attempts']], ['CleanedUp', 'Provisioning'])

    async def test_replaced_resource_is_not_deleted_on_cleanup(self):
        _, order = await self.failed_order()
        ref = order['status']['attempts'][0]['resources'][0]
        key = ('ResourceClaim', ref['namespace'], ref['name'])
        replacement = copy.deepcopy(self.kube.resources[key])
        replacement['metadata']['uid'] = 'someone-elses'
        self.kube.resources[key] = replacement
        await self.request_retry(order)
        self.assertEqual(self.kube.resources[key]['metadata']['uid'], 'someone-elses')

    async def test_attempt_limit_counts_initial_attempt(self):
        _, order = await self.failed_order({**RETRY_POLICY, 'retry': {'window': '72h', 'max_attempts': 2}})
        order = await self.request_retry(order)
        self.set_claim_status(order, complete_claim_status('provision-failed'))
        order = await self.reconcile(order)
        self.assertEqual(len(order['status']['attempts']), 2)
        with self.assertRaises(Exception):
            request_retry(order, 'alice', self.clock())

    async def test_retry_rejected_after_window_or_changes(self):
        cases = ('window', 'policy', 'revoked', 'material')
        for case in cases:
            with self.subTest(case):
                self.kube = FakeKube()
                grant_default_access(self.kube)
                self.controller = CatalogItemOrderController(self.kube, self.config, clock=self.clock)
                self.clock.now = NOW
                item, order = await self.failed_order()
                await self.kube.replace_order_status(order, request_retry(order, 'alice', self.clock()))
                order = await self.kube.get_order(USER_NAMESPACE, order['metadata']['name'])
                key = (item['metadata']['namespace'], item['metadata']['name'])
                if case == 'window':
                    self.clock.advance(hours=73)
                elif case == 'policy':
                    item['spec']['approvalPolicy'] = compile_approval_policy(
                        {**RETRY_POLICY, 'default_reason': 'changed'}, parameter_specs=make_parameters())
                    self.kube.catalog_items[key] = item
                elif case == 'revoked':
                    self.kube.force_status(USER_NAMESPACE, order['metadata']['name'], lambda status: status['approval'].update(
                        revocation={'revokedAt': format_time(NOW), 'revokedBy': 'manager', 'reason': 'no'}))
                else:
                    item['spec']['runtime'] = {'default': '2h', 'maximum': '8h'}
                    self.kube.catalog_items[key] = item
                order = await self.reconcile(order)
                self.assertEqual(order['status']['phase'], 'Failed')
                self.assertNotIn('retry', order['status'])
                self.assertEqual(len(order['status']['attempts']), 1)
                self.assertIn('RetryRejected', self.history_events(order))
                self.assertEqual(len(self.claims()), 1, 'failed resources are retained')

    async def test_successful_order_cannot_be_retried(self):
        order = await self.reconcile(await self.submit())
        self.set_claim_status(order, complete_claim_status())
        order = await self.reconcile(order)
        with self.assertRaises(Exception):
            request_retry(order, 'alice', self.clock())

    async def test_no_approval_order_retry_uses_controller_defaults(self):
        self.config.retry_max_attempts = 2
        _, order = await self.failed_order(policy=None)
        self.assertEqual(order['status']['policy']['retryLimits'], {'window': '72h', 'maxAttempts': 2})
        order = await self.request_retry(order)
        self.assertEqual(order['status']['phase'], 'Provisioning')
        self.assertEqual(len(order['status']['attempts']), 2)

    async def test_policy_change_after_approval_blocks_dispatch_of_retry(self):
        item, order = await self.failed_order()
        self.kube.delete_finalizers = True
        order = await self.request_retry(order)
        item['spec']['approvalPolicy'] = compile_approval_policy(
            {**RETRY_POLICY, 'default_reason': 'changed'}, parameter_specs=make_parameters())
        self.kube.catalog_items[(item['metadata']['namespace'], item['metadata']['name'])] = item
        self.kube.finish_deletions()
        order = await self.reconcile(order)
        self.assertEqual(order['status']['phase'], 'Failed')
        self.assertEqual([a['state'] for a in order['status']['attempts']], ['CleanedUp'])
        self.assertEqual(self.claims(), [])


class TestRunLoop(ControllerTestCase):
    async def test_resync_drives_orders_when_watch_fails(self):
        class FailingCustomObjectsApi:
            async def list_cluster_custom_object(self, *args, **kwargs):
                raise RuntimeError('watch unavailable')
        self.kube.custom_objects_api = FailingCustomObjectsApi()
        order = await self.submit()
        self.config.resync_interval = 1
        task = asyncio.create_task(run(self.controller, self.kube, self.config))
        for _ in range(50):
            await asyncio.sleep(0.01)
            current = await self.kube.get_order(USER_NAMESPACE, order['metadata']['name'])
            if (current.get('status') or {}).get('phase') == 'Provisioning':
                break
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertEqual(current['status']['phase'], 'Provisioning')
        self.assertEqual(len(self.kube.created), 1)


class TestConfig(unittest.TestCase):
    def test_from_env_and_validation(self):
        config = ControllerConfig.from_env({
            'ORDER_RETRY_WINDOW': '48h', 'ORDER_RETRY_MAX_ATTEMPTS': '2',
            'CATALOG_BASE_URL': 'https://catalog', 'ORDER_APPROVAL_EXPIRES_AFTER': '24h',
        })
        self.assertEqual((config.retry_window, config.retry_max_attempts), ('48h', 2))
        self.assertEqual(config.review_base_url, 'https://catalog')
        with self.assertRaises(ValueError):
            ControllerConfig(retry_window='forever')
        with self.assertRaises(ValueError):
            ControllerConfig(retry_max_attempts=0)


if __name__ == '__main__':
    unittest.main()
