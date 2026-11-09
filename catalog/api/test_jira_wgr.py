import json
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from aiohttp import web

import app as catalog_app

REQUESTER = 'jdoe@redhat.com'


def ctx(status, payload):
    response = MagicMock(status=status)
    response.json = AsyncMock(return_value=payload)
    response.text = AsyncMock(return_value=json.dumps(payload))
    context = MagicMock()
    context.__aenter__ = AsyncMock(return_value=response)
    context.__aexit__ = AsyncMock(return_value=False)
    return context


def jira_user(account_id, email=None, name='Jane Doe', account_type='atlassian', active=True):
    user = {'accountId': account_id, 'displayName': name, 'accountType': account_type, 'active': active}
    if email is not None:
        user['emailAddress'] = email
    return user


class JiraWgrTests(unittest.IsolatedAsyncioTestCase):
    async def create_ticket(self, search_results, post_responses, body=None):
        http = MagicMock()
        http.get.side_effect = [ctx(200, r) for r in search_results]
        http.post.side_effect = [ctx(status, payload) for status, payload in post_responses]
        client = MagicMock()
        client.__aenter__ = AsyncMock(return_value=http)
        client.__aexit__ = AsyncMock(return_value=False)
        request = MagicMock()
        request.headers = {'X-Forwarded-Email': REQUESTER}
        request.json = AsyncMock(return_value=body or {'displayName': 'Summit'})
        with patch.object(catalog_app, 'get_proxy_user', AsyncMock(return_value={'metadata': {'name': REQUESTER}})), \
             patch.object(catalog_app, 'jira_api_token', 'test-token'), \
             patch.object(catalog_app, 'jira_user_email', 'bot@example.com'), \
             patch.object(catalog_app, 'audit_log', MagicMock()), \
             patch.object(catalog_app.aiohttp, 'ClientSession', return_value=client):
            response = await catalog_app.create_jira_wgr_ticket(request)
        posted = [json.loads(c.kwargs['data'])['fields'] for c in http.post.call_args_list]
        return json.loads(response.text), posted

    async def test_reporter_uses_exact_email_match_not_first_fuzzy_result(self):
        _, posted = await self.create_ticket(
            [[jira_user('other', 'jdoe@redhat.community', 'Someone Else'), jira_user('jane', REQUESTER)]],
            [(201, {'key': 'RHDPSPPT-1'})],
        )
        self.assertEqual(posted[0]['reporter'], {'accountId': 'jane'})
        self.assertEqual(posted[0]['customfield_10317'], [{'accountId': 'jane'}])
        mention = posted[0]['description']['content'][0]['content'][1]
        self.assertEqual(mention['type'], 'mention')
        self.assertEqual(mention['attrs'], {'id': 'jane', 'text': '@Jane Doe'})

    async def test_hidden_email_single_candidate_is_used(self):
        _, posted = await self.create_ticket([[jira_user('jane')]], [(201, {'key': 'RHDPSPPT-1'})])
        self.assertEqual(posted[0]['reporter'], {'accountId': 'jane'})

    async def test_app_and_inactive_accounts_are_ignored(self):
        _, posted = await self.create_ticket(
            [[jira_user('app', REQUESTER, account_type='app'), jira_user('old', REQUESTER, active=False)]],
            [(201, {'key': 'RHDPSPPT-1'})],
        )
        self.assertNotIn('reporter', posted[0])
        requester = posted[0]['description']['content'][0]['content']
        self.assertEqual(requester[1], {'type': 'text', 'text': REQUESTER})

    async def test_rejected_reporter_is_dropped_and_retried(self):
        result, posted = await self.create_ticket(
            [[jira_user('jane', REQUESTER)]],
            [
                (400, {'errors': {'reporter': 'Field cannot be set.'}}),
                (201, {'key': 'RHDPSPPT-2'}),
            ],
        )
        self.assertEqual(result['key'], 'RHDPSPPT-2')
        self.assertIn('reporter', posted[0])
        self.assertNotIn('reporter', posted[1])
        # Requester is still identifiable from the description mention.
        self.assertEqual(posted[1]['description']['content'][0]['content'][1]['attrs']['id'], 'jane')

    async def test_rejected_required_field_fails(self):
        with self.assertRaises(web.HTTPBadGateway):
            await self.create_ticket(
                [[jira_user('jane', REQUESTER)]],
                [(400, {'errors': {'summary': 'required'}})],
            )

    async def test_share_with_dedupes_requester(self):
        _, posted = await self.create_ticket(
            [[jira_user('jane', REQUESTER)], [jira_user('jane', REQUESTER)], [jira_user('bob', 'bob@redhat.com', 'Bob')]],
            [(201, {'key': 'RHDPSPPT-3'})],
            body={'displayName': 'Summit', 'shareWith': [REQUESTER, 'bob@redhat.com']},
        )
        self.assertEqual(posted[0]['customfield_10317'], [{'accountId': 'jane'}, {'accountId': 'bob'}])
