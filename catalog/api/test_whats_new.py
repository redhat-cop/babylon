import json
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from aiohttp import web

import app as catalog_app


def page(page_id, created_at='2026-10-13T00:00:00Z'):
    return {
        'history': {'createdDate': created_at},
        'id': page_id, 'title': f'Page {page_id}',
        'body': {'view': {'value': f'<p>{page_id}</p>'}},
        'version': {'number': 2, 'when': '2026-10-13T00:00:00Z'},
    }


class WhatsNewTests(unittest.IsolatedAsyncioTestCase):
    async def call_endpoint(self, responses, admin=True):
        http = MagicMock()
        contexts = []
        for status, payload in responses:
            response = MagicMock(status=status, json=AsyncMock(return_value=payload))
            context = MagicMock()
            context.__aenter__ = AsyncMock(return_value=response)
            contexts.append(context)
        http.get.side_effect = contexts
        client = MagicMock()
        client.__aenter__ = AsyncMock(return_value=http)
        with patch.object(catalog_app, 'get_proxy_user', AsyncMock(return_value={})), \
             patch.object(catalog_app, 'get_user_session', AsyncMock(return_value={'admin': admin})), \
             patch.object(catalog_app, 'jira_client_id', 'client-id'), \
             patch.object(catalog_app, 'jira_client_secret', 'client-secret'), \
             patch.object(catalog_app, 'jira_cloud_id', 'cloud-id'), \
             patch.object(catalog_app, '_jira_access_token', AsyncMock(return_value='oauth-token')), \
             patch.object(catalog_app.aiohttp, 'ClientSession', return_value=client):
            response = await catalog_app.get_whats_new(MagicMock())
        return json.loads(response.text), http.get.call_args_list

    async def test_children_pagination_and_content(self):
        result, calls = await self.call_endpoint([
            (200, {'results': [page('parent')]}),
            (200, {'results': [page('child1')],
                   '_links': {'next': '/rest/api/content/search?cql=parent&cursor=next%2Bpage'}}),
            (200, {'results': [page('child2', '2026-10-14T00:00:00Z')]}),
        ])
        self.assertEqual(result['body'], '<p>parent</p>')
        self.assertEqual([child['id'] for child in result['children']], ['child2', 'child1'])
        self.assertEqual(result['children'][0]['version'], 2)
        self.assertEqual(result['children'][0]['createdAt'], '2026-10-14T00:00:00Z')
        for call in calls:
            self.assertEqual(call.args[0], 'https://api.atlassian.com/ex/confluence/cloud-id/wiki/rest/api/content/search')
            self.assertIn('history', call.kwargs['params']['expand'])
        self.assertEqual(calls[0].kwargs['params']['cql'], f'id={catalog_app.confluence_page_id}')
        self.assertEqual(calls[1].kwargs['params']['cql'], f'parent={catalog_app.confluence_page_id} and type=page')
        self.assertNotIn('cursor', calls[1].kwargs['params'])
        self.assertEqual(calls[2].kwargs['params']['cursor'], 'next+page')
        self.assertEqual(calls[2].kwargs['params']['cql'], calls[1].kwargs['params']['cql'])

    async def test_no_children(self):
        result, _ = await self.call_endpoint([(200, {'results': [page('parent')]}), (200, {'results': []})])
        self.assertEqual(result['children'], [])

    async def test_page_not_found(self):
        with self.assertRaises(web.HTTPNotFound):
            await self.call_endpoint([(200, {'results': []})])

    async def test_non_admin_allowed(self):
        result, _ = await self.call_endpoint(
            [(200, {'results': [page('parent')]}), (200, {'results': []})], admin=False,
        )
        self.assertEqual(result['id'], 'parent')

    async def test_child_failure_is_not_silently_omitted(self):
        with self.assertRaises(web.HTTPBadGateway):
            await self.call_endpoint([(200, {'results': [page('parent')]}), (503, {})])

    async def test_invalid_pagination(self):
        with self.assertRaises(web.HTTPBadGateway):
            await self.call_endpoint([
                (200, {'results': [page('parent')]}),
                (200, {'results': [], '_links': {'next': '/missing-cursor'}}),
            ])
