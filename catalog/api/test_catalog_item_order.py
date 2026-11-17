import copy
import unittest
from datetime import timedelta

from catalog_item_order import (
    ApprovalDecisionError,
    OrderConflictError,
    OrderValidationError,
    PHASE_CANCELLED,
    PHASE_PENDING_APPROVAL,
    Requester,
    build_order,
    cancel_order,
    child_resource_name,
    format_time,
    order_name,
    order_view,
    policy_request_inputs,
    record_approval_decision,
    reporting_user_lookup_path,
    resolve_schedule,
    revoke_approval,
    verify_order_integrity,
)
from order_test_support import (
    NOW,
    USER_NAMESPACE,
    USER_UID,
    make_catalog_item,
    submission,
)

MANAGER_AUTHORITY = {'basis': 'direct_manager', 'source': 'reporting-api'}

REQUESTER = Requester(user='alice', uid=USER_UID, email='alice@example.com')


def build(body=None, catalog_item=None, groups=('rhpds-users',), now=NOW):
    catalog_item = catalog_item or make_catalog_item()
    catalog_item['metadata'].setdefault('uid', 'catalog-uid')
    return build_order(
        body or submission(), catalog_item=catalog_item, requester=REQUESTER, groups=list(groups), now=now,
    )


def as_created(order, uid='order-uid', status=None):
    order = copy.deepcopy(order)
    order['metadata'].update({'uid': uid, 'generation': 1, 'resourceVersion': '1'})
    if status is not None:
        order['status'] = status
    return order


class TestBuildOrder(unittest.TestCase):
    def test_service_order_applies_effective_defaults(self):
        order = build()
        spec = order['spec']
        self.assertEqual(spec['orderType'], 'service')
        self.assertEqual(spec['requester'], {'user': 'alice', 'uid': USER_UID, 'email': 'alice@example.com'})
        self.assertEqual(spec['request']['parameters'], {
            'num_users': 5, 'gpu_enabled': False, 'region': 'na', 'worker_count': 3,
        })
        self.assertEqual(spec['request']['purpose'], 'Training - Internal')
        self.assertEqual(spec['request']['activity'], 'Internal')
        self.assertEqual(spec['request']['service'], {'autoDetach': True})
        self.assertEqual(spec['request']['schedule'], {'endAfter': '3d', 'stopAfter': '4h'})
        later = NOW + timedelta(hours=30)
        self.assertEqual(resolve_schedule(spec['request']['schedule'], later), {
            'end': format_time(later + timedelta(days=3)),
            'stop': format_time(later + timedelta(hours=4)),
        })
        self.assertEqual(order['metadata']['namespace'], USER_NAMESPACE)
        self.assertEqual(order['metadata']['name'], order_name(USER_UID, USER_NAMESPACE, 'key-0000001'))
        self.assertTrue(spec['requestDigest'].startswith('sha256:'))
        self.assertIsNone(verify_order_integrity(as_created(order)))

    def test_schedule_defaults_follow_start_and_auto_stop_rules(self):
        start = NOW + timedelta(days=1)
        order = build(submission(schedule={'start': format_time(start)}))
        self.assertEqual(order['spec']['request']['schedule'], {
            'start': format_time(start),
            'end': format_time(start + timedelta(days=3)),
            'stop': format_time(start + timedelta(hours=4)),
        })
        no_stop = make_catalog_item(supportedActions={'provision': {}, 'destroy': {}})
        self.assertEqual(build(catalog_item=no_stop)['spec']['request']['schedule'], {'endAfter': '3d'})
        never_stop = make_catalog_item(runtime={'default': '999h'})
        self.assertEqual(build(catalog_item=never_stop)['spec']['request']['schedule'], {'endAfter': '3d'})
        explicit_end = format_time(NOW + timedelta(days=1))
        self.assertEqual(build(submission(schedule={'end': explicit_end}))['spec']['request']['schedule'],
                         {'end': explicit_end, 'stopAfter': '4h'})
        clamped = resolve_schedule({'end': explicit_end, 'stopAfter': '4h'}, NOW + timedelta(hours=22))
        self.assertEqual(clamped['stop'], explicit_end)

    def test_schedule_validation(self):
        cases = {
            'end in past': {'end': format_time(NOW - timedelta(hours=1))},
            'start after end': {'start': format_time(NOW + timedelta(days=2)), 'end': format_time(NOW + timedelta(days=1))},
            'beyond maximum': {'end': format_time(NOW + timedelta(days=6))},
            'no timezone': {'end': '2026-10-28T12:00:00'},
            'not a string': {'end': 12345},
            'unknown key': {'end': format_time(NOW + timedelta(days=1)), 'later': True},
            'readyBy on service': {'readyBy': format_time(NOW + timedelta(hours=1))},
        }
        for name, schedule in cases.items():
            with self.subTest(name):
                with self.assertRaises(OrderValidationError):
                    build(submission(schedule=schedule))

    def test_parameter_validation(self):
        cases = {
            'unknown parameter': ({'unknown': 1}, 'unknown_parameter'),
            'reserved purpose': ({'purpose': 'x'}, 'reserved_parameter'),
            'reserved salesforce_id': ({'salesforce_id': 'x'}, 'reserved_parameter'),
            'string for integer': ({'num_users': '25'}, 'invalid_parameter'),
            'bool for integer': ({'num_users': True}, 'invalid_parameter'),
            'above maximum': ({'num_users': 101}, 'invalid_parameter'),
            'not in enum': ({'region': 'mars'}, 'invalid_parameter'),
        }
        for name, (parameters, code) in cases.items():
            with self.subTest(name):
                with self.assertRaises(OrderValidationError) as caught:
                    build(submission(parameters=parameters))
                self.assertEqual(caught.exception.code, code)
        order = build(submission(parameters={'num_users': 25, 'gpu_enabled': True, 'notes': 'hello'}))
        self.assertEqual(order['spec']['request']['parameters']['num_users'], 25)
        self.assertEqual(order['spec']['request']['parameters']['notes'], 'hello')

    def test_required_parameter(self):
        parameters = [{'name': 'cluster', 'required': True, 'openAPIV3Schema': {'type': 'string'}}]
        catalog_item = make_catalog_item(parameters=parameters)
        with self.assertRaises(OrderValidationError) as caught:
            build(submission(purpose=None), catalog_item=catalog_item)
        self.assertEqual(caught.exception.code, 'missing_required_parameter')
        order = build(submission(purpose=None, parameters={'cluster': 'a'}), catalog_item=catalog_item)
        self.assertEqual(order['spec']['request']['parameters'], {'cluster': 'a'})

    def test_purpose_must_match_catalog_options(self):
        with self.assertRaises(OrderValidationError):
            build(submission(purpose='Training'))
        with self.assertRaises(OrderValidationError):
            build(submission(purpose=None))
        with self.assertRaises(OrderValidationError):
            build(submission(purpose='Training - Internal', activity='Customer'))
        with self.assertRaises(OrderValidationError):
            build(submission(purpose='Other'))
        order = build(submission(purpose='Other', explanation='Partner enablement'))
        self.assertEqual(order['spec']['request']['explanation'], 'Partner enablement')

    def test_purpose_required_roles(self):
        parameters = [{'name': 'purpose', 'openAPIV3Schema': {'type': 'string', 'x-form-options': [
            {'name': 'Restricted', 'activity': 'Internal', 'requiredRoles': ['gpte-admins']},
        ]}}]
        catalog_item = make_catalog_item(parameters=parameters)
        with self.assertRaises(OrderValidationError) as caught:
            build(submission(purpose='Restricted'), catalog_item=catalog_item)
        self.assertEqual(caught.exception.status, 403)
        build(submission(purpose='Restricted'), catalog_item=catalog_item, groups=('gpte-admins',))

    def test_activity_always_comes_from_purpose_option(self):
        self.assertEqual(build()['spec']['request']['activity'], 'Internal')
        parameters = [{'name': 'purpose', 'openAPIV3Schema': {'type': 'string', 'x-form-options': [
            {'name': 'No activity'},
        ]}}]
        catalog_item = make_catalog_item(parameters=parameters)
        order = build(submission(purpose='No activity'), catalog_item=catalog_item)
        self.assertNotIn('activity', order['spec']['request'])
        with self.assertRaises(OrderValidationError):
            build(submission(purpose='No activity', activity='Customer'), catalog_item=catalog_item)

    def test_purpose_catalog_parameters_follow_order_fields_like_ui(self):
        parameters = [
            *make_catalog_item()['spec']['parameters'],
            {'name': 'purpose_activity', 'openAPIV3Schema': {'type': 'string', 'default': 'unset'}},
            {'name': 'purpose_explanation', 'openAPIV3Schema': {'type': 'string'}},
        ]
        parameters = [p for p in parameters if p['name'] != 'salesforce_id']
        parameters.append({'name': 'salesforce_id', 'required': True, 'openAPIV3Schema': {'type': 'string'}})
        order = build(submission(purpose='Other', explanation='Why'), catalog_item=make_catalog_item(parameters=parameters))
        effective = order['spec']['request']['parameters']
        self.assertEqual(effective['purpose_activity'], 'Internal')
        self.assertEqual(effective['purpose_explanation'], 'Why')
        self.assertNotIn('salesforce_id', effective, 'the UI never sends salesforce_id, even when required')

    def test_rejects_identity_manifests_and_unknown_fields(self):
        for field, value in (
            ('requester', 'mallory'),
            ('metadata', {'name': 'x'}),
            ('spec', {}),
            ('approval', {'state': 'Approved'}),
            ('status', {'phase': 'Approved'}),
        ):
            with self.subTest(field):
                with self.assertRaises(OrderValidationError):
                    build(submission(**{field: value}))

    def test_unsupported_order_types_fail_before_lookup(self):
        for order_type in ('multiWorkshop', 'multiuserServiceWorkshop', 'externalUrl', 'whiteGloveRequest', 'zerotouch', None):
            with self.subTest(order_type):
                with self.assertRaises(OrderValidationError) as caught:
                    build(submission(order_type=order_type))
                self.assertEqual(caught.exception.code, 'unsupported_order_type')
        external = make_catalog_item(externalUrl='https://example.com')
        with self.assertRaises(OrderValidationError) as caught:
            build(catalog_item=external)
        self.assertEqual(caught.exception.code, 'unsupported_order_type')

    def test_idempotency_key_validation(self):
        for key in (None, '', 'short', 'x' * 129, 'has space here'):
            with self.subTest(key=key):
                with self.assertRaises(OrderValidationError) as caught:
                    build(submission(key=key))
                self.assertEqual(caught.exception.code, 'invalid_idempotency_key')

    def test_workshop_defaults_match_ui(self):
        order = build(submission(order_type='workshop'))
        workshop = order['spec']['request']['workshop']
        self.assertEqual(workshop['count'], 1)
        self.assertEqual(workshop['concurrency'], 10)
        self.assertEqual(workshop['startDelay'], 30)
        self.assertEqual(workshop['displayName'], 'Test Item')
        self.assertEqual(workshop['description'], '<p></p>')
        self.assertTrue(workshop['openRegistration'])
        self.assertEqual(len(workshop['accessPassword']), 8)
        self.assertEqual(policy_request_inputs(order['spec'])['quantity'], 1)

        multi = make_catalog_item(workshopUserMode='multi')
        self.assertEqual(build(submission(order_type='workshop'), catalog_item=multi)['spec']['request']['workshop']['concurrency'], 1)
        with self.assertRaises(OrderValidationError):
            build(submission(order_type='workshop', workshop={'count': 2}), catalog_item=multi)

    def test_workshop_limits(self):
        with self.assertRaises(OrderValidationError):
            build(submission(order_type='workshop', workshop={'count': 31}))
        disabled = make_catalog_item(workshopUiDisabled=True)
        for order_type in ('workshop', 'selfPacedLab'):
            with self.subTest(order_type):
                with self.assertRaises(OrderValidationError) as caught:
                    build(submission(order_type=order_type), catalog_item=disabled)
                self.assertEqual(caught.exception.code, 'unsupported_order_type')
        with self.assertRaises(OrderValidationError):
            build(submission(order_type='service', workshop={'count': 2}))

    def test_self_paced_lab_defaults_match_ui(self):
        order = build(submission(order_type='selfPacedLab'))
        lab = order['spec']['request']['selfPacedLab']
        self.assertEqual(
            {key: lab[key] for key in ('poolSize', 'assignedLifespan', 'unassignedLifespan', 'concurrency', 'startDelay')},
            {'poolSize': 5, 'assignedLifespan': '4h', 'unassignedLifespan': '4h', 'concurrency': 5, 'startDelay': 10},
        )
        self.assertNotIn('stop', order['spec']['request']['schedule'])
        self.assertEqual(policy_request_inputs(order['spec'])['quantity'], 5)

    def test_whole_number_floats_survive_storage(self):
        from order_test_support import stored
        parameters = [{'name': 'ratio', 'openAPIV3Schema': {'type': 'number'}, 'value': '2'}]
        order = as_created(build(submission(purpose=None, parameters={}), catalog_item=make_catalog_item(parameters=parameters)))
        self.assertEqual(order['spec']['request']['parameters'], {'ratio': 2.0})
        self.assertIsNone(verify_order_integrity(stored(order)))
        order = as_created(build(submission(purpose=None, parameters={'ratio': 3.0}), catalog_item=make_catalog_item(parameters=parameters)))
        self.assertIsNone(verify_order_integrity(stored(order)))

    def test_policy_inputs_use_relative_duration(self):
        self.assertEqual(policy_request_inputs(build()['spec'])['duration_hours'], 72.0)

    def test_policy_inputs(self):
        start = NOW + timedelta(days=1)
        order = build(submission(order_type='workshop', workshop={'count': 12}, schedule={
            'start': format_time(start), 'end': format_time(start + timedelta(hours=60)),
        }))
        self.assertEqual(policy_request_inputs(order['spec']), {
            'order_type': 'workshop', 'quantity': 12, 'duration_hours': 60.0,
            'purpose': 'Training - Internal', 'activity': 'Internal',
        })


class TestNamesAndDigests(unittest.TestCase):
    def test_order_name_scope(self):
        name = order_name('uid-a', 'user-a', 'key-0000001')
        self.assertEqual(name, order_name('uid-a', 'user-a', 'key-0000001'))
        self.assertNotEqual(name, order_name('uid-b', 'user-a', 'key-0000001'))
        self.assertNotEqual(name, order_name('uid-a', 'user-b', 'key-0000001'))
        self.assertRegex(name, r'^order-[0-9a-f]{20}$')

    def test_child_resource_name_is_valid_and_unpredictable(self):
        from catalog_item_order import generate_name_suffix
        name = child_resource_name('tests.test-item.prod', 'a1b2c3d4')
        self.assertEqual(name, 'tests.test-item.prod-a1b2c3d4')
        self.assertNotEqual(generate_name_suffix(), generate_name_suffix())
        self.assertRegex(generate_name_suffix(), r'^[0-9a-f]{8}$')
        long_name = child_resource_name('a' * 54 + '.b' * 10, 'a1b2c3d4')
        self.assertLessEqual(len(long_name), 63)
        self.assertRegex(long_name, r'^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$')
        self.assertNotIn('.-', child_resource_name('a' * 53 + '.bbbbbbb', 'a1b2c3d4'))

    def test_request_digest_detects_changes(self):
        order = as_created(build())
        for mutate in (
            lambda spec: spec['request']['parameters'].update(num_users=50),
            lambda spec: spec['request'].update(purpose='Customer Demo'),
            lambda spec: spec['requester'].update(user='mallory'),
            lambda spec: spec['catalogItem'].update(uid='other'),
            lambda spec: spec.update(orderType='workshop'),
            lambda spec: spec['request']['schedule'].update(end=format_time(NOW + timedelta(days=5))),
        ):
            changed = copy.deepcopy(order)
            mutate(changed['spec'])
            self.assertIsNotNone(verify_order_integrity(changed))
        moved = copy.deepcopy(order)
        moved['metadata']['namespace'] = 'user-bob'
        self.assertIsNotNone(verify_order_integrity(moved))
        regenerated = copy.deepcopy(order)
        regenerated['metadata']['generation'] = 2
        self.assertIsNotNone(verify_order_integrity(regenerated))

    def test_reporting_user_lookup_path_encodes_email_as_one_segment(self):
        self.assertEqual(reporting_user_lookup_path('a+b/c@example.com'), '/users/by-email/a%2Bb%2Fc%40example.com?details=true')


def pending_order(expires_in=timedelta(hours=72)):
    order = as_created(build())
    order['status'] = {
        'phase': PHASE_PENDING_APPROVAL,
        'approval': {
            'state': 'Pending',
            'requestDigest': order['spec']['requestDigest'],
            'policyDigest': 'sha256:policy',
            'requestedAt': format_time(NOW),
            'expiresAt': format_time(NOW + expires_in),
        },
    }
    return order


class TestDecisionContract(unittest.TestCase):
    def test_records_decision_bound_to_digests(self):
        order = pending_order()
        status = record_approval_decision(order, authority=MANAGER_AUTHORITY, outcome='Approved', decided_by='manager', now=NOW + timedelta(hours=1),
            source='catalog-api/approvals', comment='ok',
        )
        decision = status['approval']['decision']
        self.assertEqual(decision['requestDigest'], order['spec']['requestDigest'])
        self.assertEqual(decision['policyDigest'], 'sha256:policy')
        self.assertEqual(status['phase'], PHASE_PENDING_APPROVAL)

    def test_rejects_invalid_decisions(self):
        order = pending_order()
        cases = {
            'self approval': dict(outcome='Approved', decided_by='alice'),
            'bad outcome': dict(outcome='Maybe', decided_by='manager'),
            'missing approver': dict(outcome='Approved', decided_by=''),
        }
        for name, kwargs in cases.items():
            with self.subTest(name):
                with self.assertRaises(ApprovalDecisionError):
                    record_approval_decision(order, authority=MANAGER_AUTHORITY, now=NOW, source='s', **kwargs)
        with self.assertRaises(ApprovalDecisionError):
            record_approval_decision(order, authority=MANAGER_AUTHORITY, outcome='Approved', decided_by='manager', now=NOW + timedelta(hours=73), source='s')
        stale = pending_order()
        stale['status']['approval']['requestDigest'] = 'sha256:old'
        with self.assertRaises(ApprovalDecisionError):
            record_approval_decision(stale, authority=MANAGER_AUTHORITY, outcome='Approved', decided_by='manager', now=NOW, source='s')
        cancelled = pending_order()
        cancelled['status']['phase'] = PHASE_CANCELLED
        with self.assertRaises(ApprovalDecisionError):
            record_approval_decision(cancelled, authority=MANAGER_AUTHORITY, outcome='Approved', decided_by='manager', now=NOW, source='s')

    def test_conflicting_second_decision_rejected(self):
        order = pending_order()
        order['status'] = record_approval_decision(order, authority=MANAGER_AUTHORITY, outcome='Denied', decided_by='manager', now=NOW, source='s')
        self.assertEqual(
            record_approval_decision(order, authority=MANAGER_AUTHORITY, outcome='Denied', decided_by='manager', now=NOW, source='s'),
            order['status'],
        )
        with self.assertRaises(ApprovalDecisionError):
            record_approval_decision(order, authority=MANAGER_AUTHORITY, outcome='Approved', decided_by='manager', now=NOW, source='s')

    def test_revoke(self):
        order = pending_order()
        status = revoke_approval(order, revoked_by='manager', reason='Changed plans', now=NOW)
        self.assertEqual(status['approval']['revocation']['reason'], 'Changed plans')


class TestCancel(unittest.TestCase):
    def test_cancel_before_dispatch(self):
        for phase in (None, 'Submitted', 'PendingApproval', 'Approved', 'Blocked'):
            with self.subTest(phase=phase):
                order = as_created(build(), status={'phase': phase} if phase else None)
                self.assertEqual(order_view(order, NOW)['cancel'], {'allowed': True})
                status = cancel_order(order, 'alice', NOW)
                self.assertEqual(status['phase'], PHASE_CANCELLED)
                self.assertEqual(status['history'][-1]['event'], 'Cancelled')

    def test_cancel_after_dispatch_or_terminal_conflicts(self):
        for status in (
            {'phase': 'Approved', 'attempts': [{'number': 1, 'state': 'Dispatching'}]},
            {'phase': 'Blocked', 'attempts': [{'number': 1, 'state': 'Dispatching'}]},
            {'phase': 'Approved', 'attempts': [{'number': 1, 'state': 'Created'}]},
            {'phase': 'Cancelled'},
            {'phase': 'Denied'},
        ):
            with self.subTest(status=status):
                order = as_created(build(), status=status)
                with self.assertRaises(OrderConflictError) as caught:
                    cancel_order(order, 'alice', NOW)
                view = order_view(order, NOW)['cancel']
                self.assertFalse(view['allowed'])
                self.assertEqual(view['code'], caught.exception.code, 'view and endpoint use the same rule')


class TestOrderView(unittest.TestCase):
    def test_view_hides_planned_names_until_created(self):
        order = as_created(build(), status={'phase': 'Approved', 'attempts': [{
            'number': 1, 'state': 'Dispatching',
            'resources': [
                {'apiVersion': 'v1', 'kind': 'Workshop', 'namespace': 'n', 'name': 'planned-1', 'uid': 'u1'},
                {'apiVersion': 'v1', 'kind': 'WorkshopProvision', 'namespace': 'n', 'name': 'planned-1'},
            ],
        }]})
        resources = order_view(order)['attempts'][0]['resources']
        self.assertEqual([ref['kind'] for ref in resources], ['Workshop'])

    def test_view_hides_access_password(self):
        order = as_created(build(submission(order_type='workshop', workshop={'accessPassword': 'secret12'})))
        view = order_view(order, NOW)
        self.assertNotIn('accessPassword', view['request']['workshop'])
        self.assertEqual(order['spec']['request']['workshop']['accessPassword'], 'secret12')
        self.assertEqual(view['phase'], 'Submitted')
        self.assertNotIn('retry', view)


if __name__ == '__main__':
    unittest.main()
