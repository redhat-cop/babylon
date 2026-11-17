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
             patch.object(catalog_app, 'jira_client_id', 'client-id'), \
             patch.object(catalog_app, 'jira_client_secret', 'client-secret'), \
             patch.object(catalog_app, 'jira_cloud_id', 'cloud-id'), \
             patch.object(catalog_app, '_jira_access_token', AsyncMock(return_value='oauth-token')), \
             patch.object(catalog_app, 'audit_log', MagicMock()), \
             patch.object(catalog_app.aiohttp, 'ClientSession', return_value=client):
            response = await catalog_app.create_jira_wgr_ticket(request)
        posted = [json.loads(c.kwargs['data'])['fields'] for c in http.post.call_args_list]
        self.http = http
        return json.loads(response.text), posted

    async def test_uses_oauth_bearer_via_api_gateway(self):
        await self.create_ticket([[jira_user('jane', REQUESTER)]], [(201, {'key': 'RHDPSPPT-1'})])
        search, create = self.http.get.call_args, self.http.post.call_args
        self.assertEqual(search.args[0], 'https://api.atlassian.com/ex/jira/cloud-id/rest/api/3/user/search')
        self.assertEqual(create.args[0], 'https://api.atlassian.com/ex/jira/cloud-id/rest/api/3/issue')
        self.assertEqual(create.kwargs['headers']['Authorization'], 'Bearer oauth-token')

    async def test_access_token_is_cached_until_expiry(self):
        session = MagicMock()
        session.post.side_effect = [ctx(200, {'access_token': 'tok-1', 'expires_in': 3600})]
        with patch.object(catalog_app, 'jira_oauth_token', {'access_token': None, 'expires_at': 0}), \
             patch.object(catalog_app, 'jira_client_id', 'client-id'), \
             patch.object(catalog_app, 'jira_client_secret', 'client-secret'):
            self.assertEqual(await catalog_app._jira_access_token(session), 'tok-1')
            self.assertEqual(await catalog_app._jira_access_token(session), 'tok-1')
        self.assertEqual(session.post.call_count, 1)
        self.assertEqual(session.post.call_args.kwargs['json']['grant_type'], 'client_credentials')

    async def test_token_failure_returns_bad_gateway(self):
        session = MagicMock()
        session.post.side_effect = [ctx(401, {'error': 'access_denied'})]
        with patch.object(catalog_app, 'jira_oauth_token', {'access_token': None, 'expires_at': 0}):
            with self.assertRaises(web.HTTPBadGateway):
                await catalog_app._jira_access_token(session)

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


ISSUE = {'fields': {
    'assignee': {'displayName': 'Agent Smith', 'emailAddress': 'agent@redhat.com'},
    'status': {'name': 'Open'},
}}
COMMENTS = {'comments': [{'author': {'displayName': 'Agent Smith'},
                          'body': {'content': [{'content': [{'type': 'text', 'text': 'hi'}]}]}}]}


def wgr(ticket):
    return {'metadata': {'annotations': {'demo.redhat.com/jira-ticket-id': ticket}}}


class JiraIssueReadAuthorizationTests(unittest.IsolatedAsyncioTestCase):
    async def get_issue(self, issue_key, query=None, admin=False, wgr_result=None):
        http = MagicMock()
        http.get.side_effect = [ctx(200, ISSUE), ctx(200, COMMENTS)]
        client = MagicMock()
        client.__aenter__ = AsyncMock(return_value=http)
        client.__aexit__ = AsyncMock(return_value=False)
        request = MagicMock()
        request.match_info = {'issue_key': issue_key}
        request.query = query or {}
        k8s = MagicMock()
        if isinstance(wgr_result, Exception):
            k8s.get_namespaced_custom_object = AsyncMock(side_effect=wgr_result)
        else:
            k8s.get_namespaced_custom_object = AsyncMock(return_value=wgr_result)
        api_client = MagicMock(close=AsyncMock())
        session = {'user': REQUESTER, 'groups': [], 'admin': admin}
        self.http, self.k8s = http, k8s
        with patch.object(catalog_app, 'get_proxy_user', AsyncMock(return_value={'metadata': {'name': REQUESTER}})), \
             patch.object(catalog_app, 'get_user_session', AsyncMock(return_value=session)), \
             patch.object(catalog_app, 'jira_client_id', 'client-id'), \
             patch.object(catalog_app, 'jira_client_secret', 'client-secret'), \
             patch.object(catalog_app, 'jira_cloud_id', 'cloud-id'), \
             patch.object(catalog_app, 'jira_project_key', 'RHDPSPPT'), \
             patch.object(catalog_app, '_jira_access_token', AsyncMock(return_value='oauth-token')), \
             patch.object(catalog_app, 'proxy_api_client', MagicMock(return_value=api_client)), \
             patch.object(catalog_app.kubernetes_asyncio.client, 'CustomObjectsApi', MagicMock(return_value=k8s)), \
             patch.object(catalog_app.aiohttp, 'ClientSession', return_value=client):
            response = await catalog_app.get_jira_issue_details(request)
        return json.loads(response.text)

    async def test_owner_can_read_ticket_referenced_by_their_wgr(self):
        result = await self.get_issue('RHDPSPPT-5', {'namespace': 'user-jdoe', 'name': 'wgr-1'},
                                      wgr_result=wgr('RHDPSPPT-5'))
        self.assertEqual(result['status'], 'Open')
        self.assertEqual(result['assignee'], {'displayName': 'Agent Smith'})
        self.assertEqual(self.k8s.get_namespaced_custom_object.call_args.kwargs['namespace'], 'user-jdoe')

    async def test_non_admin_without_wgr_reference_is_forbidden(self):
        with self.assertRaises(web.HTTPForbidden):
            await self.get_issue('RHDPSPPT-5')
        self.http.get.assert_not_called()

    async def test_wgr_for_different_ticket_is_forbidden(self):
        with self.assertRaises(web.HTTPForbidden):
            await self.get_issue('RHDPSPPT-6', {'namespace': 'user-jdoe', 'name': 'wgr-1'},
                                 wgr_result=wgr('RHDPSPPT-5'))
        self.http.get.assert_not_called()

    async def test_wgr_user_cannot_access_is_forbidden(self):
        denied = catalog_app.kubernetes_asyncio.client.exceptions.ApiException(status=403)
        with self.assertRaises(web.HTTPForbidden):
            await self.get_issue('RHDPSPPT-5', {'namespace': 'user-other', 'name': 'wgr-9'}, wgr_result=denied)
        self.http.get.assert_not_called()

    async def test_admin_can_read_any_project_ticket(self):
        result = await self.get_issue('RHDPSPPT-7', admin=True)
        self.assertEqual(result['key'], 'RHDPSPPT-7')
        self.k8s.get_namespaced_custom_object.assert_not_called()

    async def test_ticket_outside_project_is_forbidden_even_for_admin(self):
        with self.assertRaises(web.HTTPForbidden):
            await self.get_issue('OTHER-1', admin=True)
        self.http.get.assert_not_called()
