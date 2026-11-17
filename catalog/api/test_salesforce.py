import json
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from aiohttp import web

import app as catalog_app

USER = {'metadata': {'name': 'jdoe@redhat.com'}}


def ctx(status, payload):
    response = MagicMock(status=status)
    response.json = AsyncMock(return_value=payload)
    context = MagicMock()
    context.__aenter__ = AsyncMock(return_value=response)
    context.__aexit__ = AsyncMock(return_value=False)
    return context


class SalesforceAccountSearchTests(unittest.IsolatedAsyncioTestCase):
    async def search(self, query, upstream=None, status=200):
        http = MagicMock()
        http.get.side_effect = [ctx(status, upstream if upstream is not None else {'items': []})]
        client = MagicMock()
        client.__aenter__ = AsyncMock(return_value=http)
        client.__aexit__ = AsyncMock(return_value=False)
        request = MagicMock()
        request.query = query
        self.http = http
        with patch.object(catalog_app, 'get_proxy_user', AsyncMock(return_value=USER)), \
             patch.object(catalog_app, 'audit_log', MagicMock()), \
             patch.object(catalog_app.aiohttp, 'ClientSession', return_value=client):
            response = await catalog_app.list_sfdc_accounts(request)
        return json.loads(response.text)

    async def test_specific_search_is_forwarded(self):
        result = await self.search({'sales_type': 'opportunity', 'value': ' Acme '},
                                   {'items': [{'id': '001', 'name': 'Acme', 'is_valid': True}]})
        self.assertEqual(result['items'], [{'id': '001', 'name': 'Acme', 'is_valid': True}])
        url = self.http.get.call_args.args[0]
        self.assertTrue(url.endswith('/search/accounts?sales_type=opportunity&value=Acme'), url)

    async def test_results_are_capped(self):
        items = [{'id': str(i), 'name': f'Acme {i}', 'is_valid': True} for i in range(1000)]
        result = await self.search({'sales_type': 'campaign', 'value': 'Acme'}, {'items': items})
        self.assertEqual(len(result['items']), catalog_app.SFDC_SEARCH_MAX_RESULTS)

    async def test_wildcards_are_not_forwarded(self):
        for value in ('%', '%%%', 'a%b', 'Acm_', '***', "Acme'"):
            with self.subTest(value=value):
                self.assertEqual(await self.search({'sales_type': 'opportunity', 'value': value}), {'items': []})
                self.http.get.assert_not_called()

    async def test_short_or_empty_search_is_not_forwarded(self):
        for query in ({'sales_type': 'opportunity'}, {'sales_type': 'opportunity', 'value': 'ab'},
                      {'sales_type': 'opportunity', 'value': '   '}):
            with self.subTest(query=query):
                self.assertEqual(await self.search(query), {'items': []})
                self.http.get.assert_not_called()

    async def test_invalid_or_missing_sales_type_is_rejected(self):
        for query in ({'value': 'Acme'}, {'sales_type': 'account', 'value': 'Acme'}):
            with self.subTest(query=query), self.assertRaises(web.HTTPBadRequest):
                await self.search(query)

    async def test_overlong_search_is_rejected(self):
        with self.assertRaises(web.HTTPBadRequest):
            await self.search({'sales_type': 'opportunity', 'value': 'a' * 101})

    async def test_upstream_error_is_bad_gateway(self):
        with self.assertRaises(web.HTTPBadGateway):
            await self.search({'sales_type': 'opportunity', 'value': 'Acme'}, {'error': 'x'}, status=500)


class SalesforceAccountItemsTests(unittest.IsolatedAsyncioTestCase):
    async def call(self, account_id, query=None):
        request = MagicMock()
        request.match_info = {'account_id': account_id}
        request.query = query or {}
        proxy = AsyncMock(return_value=web.json_response({'items': []}))
        with patch.object(catalog_app, 'get_proxy_user', AsyncMock(return_value=USER)), \
             patch.object(catalog_app, 'api_proxy', proxy):
            await catalog_app.list_sfdc_account_items(request)
        return proxy

    async def test_valid_account_id_is_forwarded(self):
        proxy = await self.call('0013000000AbCdEAAX', {'sales_type': 'opportunity'})
        self.assertIn('account_id=0013000000AbCdEAAX', proxy.call_args.kwargs['url'])

    async def test_wildcard_account_id_is_rejected(self):
        for account_id in ('%', '001%', "001' OR 1=1"):
            with self.subTest(account_id=account_id), self.assertRaises(web.HTTPBadRequest):
                await self.call(account_id)

    async def test_invalid_sales_type_is_rejected(self):
        with self.assertRaises(web.HTTPBadRequest):
            await self.call('0013000000AbCdEAAX', {'sales_type': 'everything'})
