import copy
import filecmp
import os
import unittest

import approval_policy
from approval_policy import (
    ApprovalPolicyError,
    compile_approval_policy,
    evaluate_approval_policy,
    load_published_policy,
    parse_duration,
)
from order_test_support import REPO_ROOT, make_parameters

CANONICAL_COPY = os.path.join(
    REPO_ROOT, 'client', 'python', 'babylon_async', 'src', 'babylon_async', 'approval_policy.py'
)

# Examples documented in docs/Catalog_Item_Orders.md.
UNCONDITIONAL_POLICY = {
    'version': 'v1',
    'default': 'manager_required',
    'default_reason': 'All orders of this item require manager approval.',
    'approval': {'approver': 'requester_manager', 'expires_after': '72h'},
}

CONDITIONAL_POLICY = {
    'version': 'v1',
    'rules': {
        'large_training': {
            'when': {
                'all': [
                    {'field': 'request.purpose', 'op': 'in', 'value': ['Training - Internal', 'Other']},
                    {'any': [
                        {'field': 'parameters.num_users', 'op': 'gte', 'value': 20},
                        {'field': 'request.duration_hours', 'op': 'gt', 'value': 48},
                    ]},
                ],
            },
            'require': 'manager',
            'reason': 'Large or long training environments require manager approval.',
        },
        'gpu': {
            'when': {'field': 'parameters.gpu_enabled', 'op': 'eq', 'value': True},
            'require': 'manager',
            'reason': 'GPU environments require manager approval.',
        },
    },
}

RETRY_POLICY = {
    'version': 'v1',
    'default': 'manager_required',
    'approval': {'expires_after': '72h'},
    'retry': {'window': '72h', 'max_attempts': 3},
}


def request(**overrides):
    value = {'order_type': 'service', 'purpose': 'Customer Demo', 'quantity': 1, 'duration_hours': 24.0}
    value.update(overrides)
    return value


def evaluate(raw, req=None, parameters=None, parameter_specs=None):
    specs = make_parameters() if parameter_specs is None else parameter_specs
    published = compile_approval_policy(raw, parameter_specs=specs)
    return evaluate_approval_policy(
        published, req or request(), parameters if parameters is not None else {'num_users': 5}, specs,
    )


class TestVendoredCopy(unittest.TestCase):
    def test_catalog_api_copy_matches_canonical_client_module(self):
        if not os.path.exists(CANONICAL_COPY):
            self.skipTest('canonical client library module not present')
        self.assertTrue(
            filecmp.cmp(approval_policy.__file__, CANONICAL_COPY, shallow=False),
            'catalog/api/approval_policy.py must be identical to the client library copy',
        )


class TestCompile(unittest.TestCase):
    def test_documented_examples_are_valid(self):
        for raw in (UNCONDITIONAL_POLICY, CONDITIONAL_POLICY, RETRY_POLICY):
            with self.subTest(raw=raw):
                published = compile_approval_policy(raw, parameter_specs=make_parameters())
                self.assertEqual(published['state'], 'Valid', published.get('errors'))
                self.assertTrue(published['digest'].startswith('sha256:'))
                load_published_policy(published, make_parameters())

    def test_published_form_is_camel_case_and_sorted(self):
        published = compile_approval_policy(
            {**CONDITIONAL_POLICY, 'retry': {'window': '24h', 'max_attempts': 2}},
            parameter_specs=make_parameters(),
            source={'path': 'tests/test-item/prod.yaml'},
        )
        self.assertEqual([rule['id'] for rule in published['rules']], ['gpu', 'large_training'])
        self.assertEqual(published['retry'], {'window': '24h', 'maxAttempts': 2})
        self.assertEqual(published['source'], {'path': 'tests/test-item/prod.yaml'})
        self.assertEqual(published['default'], 'not_required')

    def test_digest_ignores_source_but_tracks_semantics(self):
        first = compile_approval_policy(CONDITIONAL_POLICY, source={'gitCommit': 'a'})
        second = compile_approval_policy(CONDITIONAL_POLICY, source={'gitCommit': 'b'})
        self.assertEqual(first['digest'], second['digest'])
        changed = copy.deepcopy(CONDITIONAL_POLICY)
        changed['rules']['gpu']['reason'] = 'Changed reason'
        self.assertNotEqual(compile_approval_policy(changed)['digest'], first['digest'])

    def test_invalid_policies_publish_invalid_state_with_errors(self):
        cases = {
            'missing version': {'rules': {}},
            'unsupported version': {'version': 'v2'},
            'null policy from merge': None,
            'unknown top-level key': {'version': 'v1', 'requires': 'manager'},
            'unsupported operator': {'version': 'v1', 'rules': {'r': {
                'when': {'field': 'request.quantity', 'op': 'matches', 'value': 1},
                'require': 'manager', 'reason': 'x'}}},
            'unsupported field': {'version': 'v1', 'rules': {'r': {
                'when': {'field': 'requester.email', 'op': 'eq', 'value': 'x'},
                'require': 'manager', 'reason': 'x'}}},
            'undefined parameter': {'version': 'v1', 'rules': {'r': {
                'when': {'field': 'parameters.missing', 'op': 'eq', 'value': 1},
                'require': 'manager', 'reason': 'x'}}},
            'string compared numerically': {'version': 'v1', 'rules': {'r': {
                'when': {'field': 'parameters.num_users', 'op': 'gte', 'value': '20'},
                'require': 'manager', 'reason': 'x'}}},
            'bool literal against integer parameter': {'version': 'v1', 'rules': {'r': {
                'when': {'field': 'parameters.num_users', 'op': 'eq', 'value': True},
                'require': 'manager', 'reason': 'x'}}},
            'mixed in list': {'version': 'v1', 'rules': {'r': {
                'when': {'field': 'request.purpose', 'op': 'in', 'value': ['a', 1]},
                'require': 'manager', 'reason': 'x'}}},
            'mixed node from merge': {'version': 'v1', 'rules': {'r': {
                'when': {'all': [{'field': 'request.quantity', 'op': 'gt', 'value': 1}],
                         'field': 'request.quantity', 'op': 'gt', 'value': 5},
                'require': 'manager', 'reason': 'x'}}},
            'rules as list': {'version': 'v1', 'rules': [{'id': 'r'}]},
            'require none': {'version': 'v1', 'rules': {'r': {
                'when': {'field': 'request.quantity', 'op': 'gt', 'value': 1},
                'require': 'none', 'reason': 'x'}}},
            'missing reason': {'version': 'v1', 'rules': {'r': {
                'when': {'field': 'request.quantity', 'op': 'gt', 'value': 1}, 'require': 'manager'}}},
            'reserved rule id': {'version': 'v1', 'rules': {'default': {
                'when': {'field': 'request.quantity', 'op': 'gt', 'value': 1},
                'require': 'manager', 'reason': 'x'}}},
            'disabled without reason': {'version': 'v1', 'rules': {'r': {
                'when': {'field': 'request.quantity', 'op': 'gt', 'value': 1},
                'require': 'manager', 'reason': 'x', 'disabled': True}}},
            'explicit not_required without override reason': {'version': 'v1', 'default': 'not_required'},
            'approver other than manager': {'version': 'v1', 'approval': {'approver': 'anyone'}},
            'expiry too long': {'version': 'v1', 'approval': {'expires_after': '90d'}},
            'too many attempts': {'version': 'v1', 'retry': {'max_attempts': 50}},
            'empty all': {'version': 'v1', 'rules': {'r': {
                'when': {'all': []}, 'require': 'manager', 'reason': 'x'}}},
            'template string is just a value': {'version': 'v1', 'rules': {'r': {
                'when': {'field': '{{ request.purpose }}', 'op': 'eq', 'value': 'x'},
                'require': 'manager', 'reason': 'x'}}},
        }
        for name, raw in cases.items():
            with self.subTest(name):
                published = compile_approval_policy(raw, parameter_specs=make_parameters())
                self.assertEqual(published['state'], 'Invalid')
                self.assertTrue(published['errors'])

    def test_reserved_parameter_fields_are_rejected(self):
        specs = make_parameters() + [
            {'name': 'purpose_activity', 'openAPIV3Schema': {'type': 'string'}},
            {'name': 'purpose_explanation', 'openAPIV3Schema': {'type': 'string'}},
        ]
        for name in ('purpose', 'purpose_activity', 'purpose_explanation', 'salesforce_id'):
            with self.subTest(name):
                published = compile_approval_policy({'version': 'v1', 'rules': {'r': {
                    'when': {'field': f'parameters.{name}', 'op': 'eq', 'value': 'x'},
                    'require': 'manager', 'reason': 'x'}}}, parameter_specs=specs)
                self.assertEqual(published['state'], 'Invalid')
                self.assertIn('request.purpose', ' '.join(published['errors']))

    def test_digest_is_stable_for_whole_number_floats(self):
        raw = {'version': 'v1', 'rules': {'r': {
            'when': {'field': 'request.duration_hours', 'op': 'gt', 'value': 48.0},
            'require': 'manager', 'reason': 'x'}}}
        published = compile_approval_policy(raw)
        stored = copy.deepcopy(published)
        stored['rules'][0]['when']['value'] = 48
        self.assertEqual(load_published_policy(stored).digest, published['digest'])
        self.assertEqual(approval_policy.canonical_json({'a': 2.0, 'b': [1.0, 1.5]}), '{"a":2,"b":[1,1.5]}')

    def test_depth_and_size_limits(self):
        node = {'field': 'request.quantity', 'op': 'gt', 'value': 1}
        for _ in range(approval_policy.MAX_DEPTH):
            node = {'all': [node]}
        published = compile_approval_policy({'version': 'v1', 'rules': {'deep': {
            'when': node, 'require': 'manager', 'reason': 'x'}}})
        self.assertEqual(published['state'], 'Invalid')
        self.assertIn('depth', ' '.join(published['errors']))

        wide = {'any': [{'field': 'request.quantity', 'op': 'eq', 'value': i} for i in range(21)]}
        published = compile_approval_policy({'version': 'v1', 'rules': {'wide': {
            'when': wide, 'require': 'manager', 'reason': 'x'}}})
        self.assertEqual(published['state'], 'Invalid')

    def test_explicit_not_required_override_is_recorded(self):
        published = compile_approval_policy({
            'version': 'v1',
            'default': 'not_required',
            'default_override_reason': 'Sandbox variant of a governed item; approved by owners.',
        })
        self.assertEqual(published['state'], 'Valid')
        self.assertEqual(published['defaultOverrideReason'], 'Sandbox variant of a governed item; approved by owners.')
        load_published_policy(published)

    def test_disabled_rule_is_published_with_reason(self):
        raw = copy.deepcopy(CONDITIONAL_POLICY)
        raw['rules']['gpu'].update({'disabled': True, 'disabled_reason': 'GPU not offered for this stage.'})
        published = compile_approval_policy(raw, parameter_specs=make_parameters())
        rule = next(rule for rule in published['rules'] if rule['id'] == 'gpu')
        self.assertEqual(rule['disabledReason'], 'GPU not offered for this stage.')

    def test_parse_duration(self):
        self.assertEqual(parse_duration('72h'), 72 * 3600)
        self.assertEqual(parse_duration('1d12h'), 36 * 3600)
        for value in ('', '72', 'h', '1w', None, 72):
            self.assertIsNone(parse_duration(value))


class TestLoadPublished(unittest.TestCase):
    def test_tampered_published_policy_is_rejected(self):
        published = compile_approval_policy(CONDITIONAL_POLICY, parameter_specs=make_parameters())
        tampered = copy.deepcopy(published)
        tampered['rules'][0]['when']['value'] = False
        with self.assertRaises(ApprovalPolicyError):
            load_published_policy(tampered, make_parameters())

    def test_unknown_published_fields_are_rejected(self):
        published = compile_approval_policy(CONDITIONAL_POLICY, parameter_specs=make_parameters())
        published['rules'][0]['allow'] = True
        with self.assertRaises(ApprovalPolicyError):
            load_published_policy(published, make_parameters())

    def test_invalid_state_and_unknown_state(self):
        with self.assertRaises(ApprovalPolicyError):
            load_published_policy({'state': 'Invalid', 'errors': ['bad']})
        with self.assertRaises(ApprovalPolicyError):
            load_published_policy({'state': 'Pending'})


class TestEvaluate(unittest.TestCase):
    def test_absent_policy_requires_no_approval(self):
        result = evaluate_approval_policy(None, request(), {}, make_parameters())
        self.assertEqual(result['state'], 'NotConfigured')
        self.assertFalse(result['approvalRequired'])

    def test_unconditional_policy(self):
        result = evaluate(UNCONDITIONAL_POLICY)
        self.assertTrue(result['approvalRequired'])
        self.assertEqual(result['matchedRules'], [{
            'id': 'default', 'reason': 'All orders of this item require manager approval.',
        }])

    def test_and_or_conditions_use_normalized_values(self):
        cases = (
            ('neither branch', request(purpose='Training - Internal'), {'num_users': 5, 'gpu_enabled': False}, []),
            ('num_users branch', request(purpose='Training - Internal'), {'num_users': 25, 'gpu_enabled': False}, ['large_training']),
            ('duration branch', request(purpose='Other', duration_hours=72.0), {'num_users': 5, 'gpu_enabled': False}, ['large_training']),
            ('purpose excluded', request(purpose='Customer Demo'), {'num_users': 50, 'gpu_enabled': False}, []),
            ('gpu', request(), {'num_users': 5, 'gpu_enabled': True}, ['gpu']),
            ('both', request(purpose='Other'), {'num_users': 50, 'gpu_enabled': True}, ['gpu', 'large_training']),
        )
        for name, req, parameters, matched in cases:
            with self.subTest(name):
                result = evaluate(CONDITIONAL_POLICY, req, parameters)
                self.assertEqual(result['state'], 'Evaluated')
                self.assertEqual([rule['id'] for rule in result['matchedRules']], matched)
                self.assertEqual(result['approvalRequired'], bool(matched))

    def test_any_matching_rule_wins_and_reasons_are_collected(self):
        raw = copy.deepcopy(CONDITIONAL_POLICY)
        raw['default'] = 'manager_required'
        result = evaluate(raw, request(purpose='Other'), {'num_users': 50, 'gpu_enabled': True})
        self.assertEqual([rule['id'] for rule in result['matchedRules']], ['default', 'gpu', 'large_training'])
        self.assertEqual(len({rule['reason'] for rule in result['matchedRules']}), 3)

    def test_absent_optional_value_is_false_and_exists_is_explicit(self):
        raw = {'version': 'v1', 'rules': {
            'notes': {'when': {'field': 'parameters.notes', 'op': 'ne', 'value': ''}, 'require': 'manager', 'reason': 'x'},
            'has_notes': {'when': {'field': 'parameters.notes', 'op': 'exists'}, 'require': 'manager', 'reason': 'y'},
            'no_activity': {'when': {'field': 'request.activity', 'op': 'exists', 'value': False}, 'require': 'manager', 'reason': 'z'},
        }}
        result = evaluate(raw, request(), {'num_users': 5})
        self.assertEqual([rule['id'] for rule in result['matchedRules']], ['no_activity'])
        result = evaluate(raw, request(activity='Internal'), {'num_users': 5, 'notes': 'hi'})
        self.assertEqual([rule['id'] for rule in result['matchedRules']], ['has_notes', 'notes'])

    def test_type_mismatch_at_runtime_blocks(self):
        raw = {'version': 'v1', 'rules': {'r': {
            'when': {'field': 'parameters.num_users', 'op': 'gte', 'value': 20},
            'require': 'manager', 'reason': 'x'}}}
        result = evaluate(raw, request(), {'num_users': '25'})
        self.assertEqual(result['state'], 'Error')
        self.assertTrue(result['approvalRequired'])
        self.assertEqual(result['matchedRules'], [])

    def test_errors_in_unmatched_branches_still_block(self):
        raw = {'version': 'v1', 'rules': {'r': {
            'when': {'any': [
                {'field': 'request.quantity', 'op': 'gte', 'value': 1},
                {'field': 'parameters.num_users', 'op': 'gte', 'value': 20},
            ]},
            'require': 'manager', 'reason': 'x'}}}
        result = evaluate(raw, request(), {'num_users': True})
        self.assertEqual(result['state'], 'Error')

    def test_unavailable_fields_block_even_for_negative_operators(self):
        raw = {'version': 'v1', 'rules': {'r': {
            'when': {'field': 'request.purpose', 'op': 'ne', 'value': 'Customer Demo'},
            'require': 'manager', 'reason': 'x'}}}
        published = compile_approval_policy(raw, parameter_specs=make_parameters())
        result = evaluate_approval_policy(
            published, request(purpose='anything'), {}, make_parameters(),
            unavailable_fields=('request.purpose', 'request.activity'),
        )
        self.assertEqual(result['state'], 'Error')
        self.assertTrue(result['approvalRequired'])

    def test_bool_is_not_number(self):
        raw = {'version': 'v1', 'rules': {'r': {
            'when': {'field': 'parameters.gpu_enabled', 'op': 'in', 'value': [1]},
            'require': 'manager', 'reason': 'x'}}}
        published = compile_approval_policy(raw, parameter_specs=make_parameters())
        self.assertEqual(published['state'], 'Invalid')

    def test_parameter_removed_from_catalog_item_blocks(self):
        raw = {'version': 'v1', 'rules': {'r': {
            'when': {'field': 'parameters.gpu_enabled', 'op': 'eq', 'value': True},
            'require': 'manager', 'reason': 'x'}}}
        published = compile_approval_policy(raw, parameter_specs=make_parameters())
        specs = [spec for spec in make_parameters() if spec['name'] != 'gpu_enabled']
        result = evaluate_approval_policy(published, request(), {}, specs)
        self.assertEqual(result['state'], 'Invalid')
        self.assertTrue(result['approvalRequired'])

    def test_malformed_published_policy_never_allows(self):
        for published in (
            {'state': 'Invalid', 'errors': ['bad']},
            {'state': 'Valid'},
            {'state': 'Valid', 'version': 'v1', 'default': 'not_required', 'rules': [], 'digest': 'sha256:wrong'},
            'not a mapping',
        ):
            with self.subTest(published=published):
                result = evaluate_approval_policy(published, request(), {}, make_parameters())
                self.assertEqual(result['state'], 'Invalid')
                self.assertTrue(result['approvalRequired'])

    def test_disabled_rules_do_not_match_but_are_reported(self):
        raw = copy.deepcopy(CONDITIONAL_POLICY)
        raw['rules']['gpu'].update({'disabled': True, 'disabled_reason': 'Not offered.'})
        result = evaluate(raw, request(), {'num_users': 5, 'gpu_enabled': True})
        self.assertFalse(result['approvalRequired'])
        self.assertEqual(result['disabledRules'], [{'id': 'gpu', 'reason': 'Not offered.'}])


if __name__ == '__main__':
    unittest.main()
