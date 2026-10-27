import asyncio
import copy
import json
import os
import unittest

import aiohttp

from catalog_item_order_manager import (
    BASIS_DIRECT_MANAGER,
    BASIS_MANAGEMENT_CHAIN,
    LOOKUP_INVALID,
    LOOKUP_NOT_FOUND,
    LOOKUP_UNAVAILABLE,
    MAX_MANAGER_LEVEL,
    ManagerLookupError,
    ReportingApiClient,
    parse_manager_data,
    trusted_user_email,
)

FIXTURES = os.path.join(os.path.dirname(__file__), 'fixtures', 'reporting_api')


def fixture(name):
    with open(os.path.join(FIXTURES, name)) as f:
        return json.load(f)


CONTRACT = fixture('users_by_email_contract.json')
USER = fixture('user_with_hierarchy.json')
NO_MANAGER = fixture('user_without_manager.json')


class TestContract(unittest.TestCase):
    """Fixtures and parser follow the Reporting API v1.10.3 schema."""

    def test_contract_fields_used_by_the_parser(self):
        user_schema = CONTRACT['schemas']['User']
        self.assertEqual(CONTRACT['path'], '/users/by-email/{email}')
        self.assertIn('email', user_schema['required'])
        self.assertIn('manager', user_schema['properties'])
        self.assertIn('manager_levels', user_schema['properties'])
        level_schema = CONTRACT['schemas']['UserManagerLevel']
        for key in ('user_email', 'active'):
            self.assertIn(key, level_schema['properties'])
        levels = sorted(int(key.split('_')[1]) for key in level_schema['properties'] if key.endswith('_email') and key.startswith('level_'))
        self.assertEqual(levels, list(range(1, MAX_MANAGER_LEVEL + 1)))
        self.assertEqual(CONTRACT['securitySchemes']['PermissionDependency']['name'], 'Authorization')

    def test_fixtures_only_use_contract_fields(self):
        user_fields = set(CONTRACT['schemas']['User']['properties']) | {
            'user_group', 'full_name', 'is_manager', 'employee_number', 'supervisor_number', 'last_day_of_work',
        }
        level_fields = set(CONTRACT['schemas']['UserManagerLevel']['properties'])
        for user in (USER, NO_MANAGER, USER['manager']):
            self.assertLessEqual(set(user) - {'id'}, user_fields | {'id'})
        for record in USER['manager_levels']:
            self.assertLessEqual(set(record), level_fields)


class TestParse(unittest.TestCase):
    def test_direct_manager_and_active_chain(self):
        data = parse_manager_data('Alice@Example.com', USER)
        self.assertEqual(data.direct_manager_email, 'dana.manager@example.com')
        self.assertEqual(data.direct_manager_name, 'Dana Manager')
        self.assertTrue(data.chain_available)
        self.assertEqual(data.authority_for('dana.manager@example.com'), (BASIS_DIRECT_MANAGER, None))
        self.assertEqual(data.authority_for('Director@example.com'), (BASIS_MANAGEMENT_CHAIN, 3))
        self.assertEqual(data.authority_for('ceo@example.com'), (BASIS_MANAGEMENT_CHAIN, 1))

    def test_inactive_records_and_unrelated_users_grant_nothing(self):
        data = parse_manager_data('alice@example.com', USER)
        for email in ('old.ceo@example.com', 'former.director@example.com', 'bob@example.com', None, 'not-an-email'):
            with self.subTest(email=email):
                self.assertIsNone(data.authority_for(email))

    def test_requester_never_has_authority(self):
        user = copy.deepcopy(USER)
        user['manager_levels'][0]['level_5_email'] = 'alice@example.com'
        user['manager']['email'] = 'ALICE@example.com'
        data = parse_manager_data('alice@example.com', user)
        self.assertIsNone(data.direct_manager_email)
        self.assertIsNone(data.authority_for('alice@example.com'))

    def test_empty_manager_default_and_null(self):
        data = parse_manager_data('carol@example.com', NO_MANAGER)
        self.assertIsNone(data.direct_manager_email)
        self.assertFalse(data.chain_available)
        self.assertEqual(data.chain, {})
        user = {**NO_MANAGER, 'manager': None, 'manager_levels': None}
        self.assertIsNone(parse_manager_data('carol@example.com', user).direct_manager_email)

    def test_ambiguous_chain_is_not_used(self):
        user = copy.deepcopy(USER)
        user['manager_levels'][1]['active'] = True
        data = parse_manager_data('alice@example.com', user)
        self.assertFalse(data.chain_available)
        self.assertIsNone(data.authority_for('director@example.com'))
        self.assertEqual(data.authority_for('dana.manager@example.com'), (BASIS_DIRECT_MANAGER, None))

    def test_invalid_responses(self):
        cases = {
            'not an object': [],
            'different user': {**USER, 'email': 'mallory@example.com'},
            'manager without email': {**USER, 'manager': {'full_name': 'X'}},
            'manager wrong type': {**USER, 'manager': 'dana'},
            'levels wrong type': {**USER, 'manager_levels': {'level_1_email': 'x@example.com'}},
        }
        for name, user in cases.items():
            with self.subTest(name):
                with self.assertRaises(ManagerLookupError) as caught:
                    parse_manager_data('alice@example.com', user)
                self.assertEqual(caught.exception.reason, LOOKUP_INVALID)

    def test_trusted_user_email(self):
        self.assertEqual(trusted_user_email('Alice@Example.com'), 'alice@example.com')
        self.assertIsNone(trusted_user_email('alice'))
        self.assertIsNone(trusted_user_email(None))


class FakeResponse:
    def __init__(self, status, payload=None, raw=None):
        self.status = status
        self.payload = payload
        self.raw = raw

    async def json(self, content_type=None):
        if self.raw is not None:
            raise ValueError('bad json')
        return self.payload

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False


class FakeSession:
    def __init__(self, responses, calls):
        self.responses = responses
        self.calls = calls

    def get(self, url, headers=None, allow_redirects=True):
        self.calls.append((url, headers))
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False


def client(responses, calls):
    return ReportingApiClient(
        'http://reporting/', 'secret-token', retries=2, retry_delay=0,
        session_factory=lambda **kwargs: FakeSession(responses, calls),
    )


class TestReportingApiClient(unittest.IsolatedAsyncioTestCase):
    async def test_lookup_encodes_email_and_uses_existing_auth(self):
        calls = []
        data = await client([FakeResponse(200, USER)], calls).get_manager_data('alice@example.com')
        self.assertEqual(data.direct_manager_email, 'dana.manager@example.com')
        self.assertEqual(calls, [('http://reporting/users/by-email/alice%40example.com', {'Authorization': 'Bearer secret-token'})])

    async def test_failures_are_classified_and_retried(self):
        cases = (
            ([FakeResponse(404)], LOOKUP_NOT_FOUND, 1),
            ([FakeResponse(200, raw='x')], LOOKUP_INVALID, 1),
            ([FakeResponse(500)] * 3, LOOKUP_UNAVAILABLE, 3),
            ([aiohttp.ClientError('down')] * 3, LOOKUP_UNAVAILABLE, 3),
            ([asyncio.TimeoutError()] * 3, LOOKUP_UNAVAILABLE, 3),
            ([FakeResponse(401)] * 3, LOOKUP_UNAVAILABLE, 3),
        )
        for responses, reason, attempts in cases:
            with self.subTest(reason=reason, responses=responses[0]):
                calls = []
                with self.assertRaises(ManagerLookupError) as caught:
                    await client(list(responses), calls).get_manager_data('alice@example.com')
                self.assertEqual(caught.exception.reason, reason)
                self.assertEqual(len(calls), attempts)

    async def test_recovers_after_transient_failure(self):
        calls = []
        data = await client([FakeResponse(503), FakeResponse(200, USER)], calls).get_manager_data('alice@example.com')
        self.assertEqual(data.direct_manager_email, 'dana.manager@example.com')
        self.assertEqual(len(calls), 2)

    async def test_invalid_requester_email_is_not_looked_up(self):
        calls = []
        with self.assertRaises(ManagerLookupError):
            await client([], calls).get_manager_data('alice')
        self.assertEqual(calls, [])


if __name__ == '__main__':
    unittest.main()
