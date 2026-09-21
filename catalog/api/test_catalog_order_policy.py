import json
import gzip
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock
from unittest.mock import patch

from aiohttp import web

import app as catalog_app

from catalog_order_policy import (
    CatalogItemReference,
    CatalogOrderPolicyError,
    catalog_item_allows_ordering,
    catalog_item_is_visible,
    classify_order_request,
    enforce_catalog_order_policy,
    extract_catalog_item_references,
)


BABYLON_DOMAIN = 'babylon.gpte.redhat.com'


def catalog_labels(name='test-item', namespace='test-catalog'):
    return {
        f'{BABYLON_DOMAIN}/catalogItemName': name,
        f'{BABYLON_DOMAIN}/catalogItemNamespace': namespace,
    }


class TestOrderClassification(unittest.TestCase):

    def test_classifies_all_protected_collection_posts(self):
        cases = (
            ('poolboy.gpte.redhat.com', 'resourceclaims', 'services_ordering_blocked', 'provider'),
            (BABYLON_DOMAIN, 'workshops', 'workshops_ordering_blocked', 'labels'),
            (BABYLON_DOMAIN, 'workshopprovisions', 'workshops_ordering_blocked', 'spec_catalog_item'),
            (BABYLON_DOMAIN, 'selfpacedlabs', 'workshops_ordering_blocked', 'labels'),
            (BABYLON_DOMAIN, 'selfpacedlabprovisionitems', 'workshops_ordering_blocked', 'spec_catalog_item'),
            (BABYLON_DOMAIN, 'multiworkshops', 'workshops_ordering_blocked', 'assets'),
        )
        for api_group, plural, block_key, reference_kind in cases:
            with self.subTest(plural=plural):
                order = classify_order_request(
                    'POST',
                    f'/apis/{api_group}/v1/namespaces/user-alice/{plural}',
                )
                self.assertIsNotNone(order)
                self.assertEqual(order.api_group, api_group)
                self.assertEqual(order.plural, plural)
                self.assertEqual(order.block_key, block_key)
                self.assertEqual(order.reference_kind, reference_kind)

    def test_ignores_non_post_named_and_unrelated_requests(self):
        paths = (
            ('GET', f'/apis/{BABYLON_DOMAIN}/v1/namespaces/user-alice/workshops'),
            ('PATCH', f'/apis/{BABYLON_DOMAIN}/v1/namespaces/user-alice/workshops/example'),
            ('POST', f'/apis/{BABYLON_DOMAIN}/v1/namespaces/user-alice/workshops/example'),
            ('POST', f'/apis/{BABYLON_DOMAIN}/v1/namespaces/user-alice/serviceaccessconfigs'),
            ('POST', '/api/v1/namespaces/user-alice/configmaps'),
        )
        for method, path in paths:
            with self.subTest(method=method, path=path):
                self.assertIsNone(classify_order_request(method, path))

    def test_classifies_trailing_collection_path_and_ignores_malformed_paths(self):
        self.assertIsNotNone(classify_order_request(
            'POST',
            f'/apis/{BABYLON_DOMAIN}/v1/namespaces/user-alice/workshops/',
        ))
        for path in (None, '', '/apis/babylon.gpte.redhat.com'):
            with self.subTest(path=path):
                self.assertIsNone(classify_order_request('POST', path))


class TestReferenceExtraction(unittest.TestCase):

    def order(self, plural, group=BABYLON_DOMAIN):
        order = classify_order_request(
            'POST', f'/apis/{group}/v1/namespaces/user-alice/{plural}'
        )
        self.assertIsNotNone(order)
        return order

    def test_resourceclaim_uses_provider_without_labels(self):
        body = {
            'spec': {'provider': {'name': 'test-item'}},
        }
        refs = extract_catalog_item_references(
            self.order('resourceclaims', 'poolboy.gpte.redhat.com'), body
        )
        self.assertEqual(
            refs, (CatalogItemReference(namespace=None, name='test-item'),)
        )

    def test_resourceclaim_ignores_spoofed_labels(self):
        body = {
            'metadata': {'labels': catalog_labels('spoofed-item', 'spoofed-catalog')},
            'spec': {'provider': {'name': 'test-item'}},
        }
        refs = extract_catalog_item_references(
            self.order('resourceclaims', 'poolboy.gpte.redhat.com'), body
        )
        self.assertEqual(
            refs, (CatalogItemReference(namespace=None, name='test-item'),)
        )

    def test_workshop_and_selfpacedlab_labels_are_optional(self):
        body = {'metadata': {'labels': catalog_labels()}}
        for plural in ('workshops', 'selfpacedlabs'):
            with self.subTest(plural=plural):
                refs = extract_catalog_item_references(self.order(plural), body)
                self.assertEqual(
                    refs,
                    (CatalogItemReference(namespace='test-catalog', name='test-item'),),
                )

                unbound = {'metadata': {}}
                self.assertEqual(
                    extract_catalog_item_references(self.order(plural), unbound),
                    (),
                )
                self.assertEqual(
                    extract_catalog_item_references(
                        self.order(plural),
                        {'metadata': {'labels': {'app': 'workshop'}}},
                    ),
                    (),
                )

                for labels in (
                    {f'{BABYLON_DOMAIN}/catalogItemName': 'test-item'},
                    None,
                ):
                    with self.subTest(labels=labels):
                        with self.assertRaises(CatalogOrderPolicyError) as caught:
                            extract_catalog_item_references(
                                self.order(plural),
                                {'metadata': {'labels': labels}},
                            )
                        self.assertEqual(caught.exception.status, 400)

    def test_provision_children_use_spec_catalog_item_without_labels(self):
        body = {
            'spec': {
                'catalogItem': {'name': 'test-item', 'namespace': 'test-catalog'},
            },
        }
        for plural in ('workshopprovisions', 'selfpacedlabprovisionitems'):
            with self.subTest(plural=plural):
                refs = extract_catalog_item_references(self.order(plural), body)
                self.assertEqual(
                    refs,
                    (CatalogItemReference(namespace='test-catalog', name='test-item'),),
                )

    def test_provision_children_ignore_spoofed_labels(self):
        body = {
            'metadata': {'labels': catalog_labels('spoofed-item', 'spoofed-catalog')},
            'spec': {
                'catalogItem': {'name': 'test-item', 'namespace': 'test-catalog'},
            },
        }
        for plural in ('workshopprovisions', 'selfpacedlabprovisionitems'):
            with self.subTest(plural=plural):
                refs = extract_catalog_item_references(self.order(plural), body)
                self.assertEqual(
                    refs,
                    (CatalogItemReference(namespace='test-catalog', name='test-item'),),
                )

    def test_multiworkshop_validates_all_non_external_assets_and_deduplicates(self):
        body = {
            'spec': {
                'assets': [
                    {
                        'key': 'item-one',
                        'name': 'allowed-name-spoof',
                        'namespace': 'catalog-one',
                        'type': 'Workshop',
                    },
                    {'name': 'external', 'namespace': '', 'type': 'external'},
                    {
                        'key': 'item-two',
                        'name': 'generated-workshop-name',
                        'namespace': 'catalog-two',
                        'type': 'SelfPacedLab',
                    },
                    {'key': 'item-one', 'namespace': 'catalog-one'},
                ]
            }
        }
        refs = extract_catalog_item_references(self.order('multiworkshops'), body)
        self.assertEqual(
            refs,
            (
                CatalogItemReference(namespace='catalog-one', name='item-one'),
                CatalogItemReference(namespace='catalog-two', name='item-two'),
            ),
        )

    def test_multiworkshop_allows_external_only_or_empty_assets(self):
        external = {'spec': {'assets': [{'name': 'external', 'type': 'external'}]}}
        self.assertEqual(
            extract_catalog_item_references(self.order('multiworkshops'), external), ()
        )
        self.assertEqual(
            extract_catalog_item_references(self.order('multiworkshops'), {'spec': {}}), ()
        )

    def test_multiworkshop_ignores_irrelevant_external_asset_fields(self):
        body = {'spec': {'assets': [{
            'type': 'external',
            'key': None,
            'namespace': {'not': 'a namespace'},
        }]}}
        self.assertEqual(
            extract_catalog_item_references(self.order('multiworkshops'), body), ()
        )

    def test_multiworkshop_rejects_non_object_assets(self):
        with self.assertRaises(CatalogOrderPolicyError) as caught:
            extract_catalog_item_references(
                self.order('multiworkshops'), {'spec': {'assets': [None]}}
            )
        self.assertEqual(caught.exception.status, 400)
        self.assertEqual(caught.exception.code, 'invalid_catalog_reference')

    def test_rejects_malformed_or_missing_references(self):
        cases = (
            ('workshops', None),
            ('workshops', {}),
            ('resourceclaims', {'spec': {}}),
            ('workshopprovisions', {'spec': {}}),
            ('multiworkshops', {'spec': {'assets': 'not-a-list'}}),
            ('multiworkshops', {'spec': {'assets': [{'name': 'missing-namespace'}]}}),
            ('multiworkshops', {'spec': {'assets': [{
                'name': 'allowed-name-spoof',
                'namespace': 'test-catalog',
            }]}}),
        )
        for plural, body in cases:
            group = 'poolboy.gpte.redhat.com' if plural == 'resourceclaims' else BABYLON_DOMAIN
            with self.subTest(plural=plural, body=body):
                with self.assertRaises(CatalogOrderPolicyError) as caught:
                    extract_catalog_item_references(self.order(plural, group), body)
                self.assertEqual(caught.exception.status, 400)
                self.assertEqual(caught.exception.code, 'invalid_catalog_reference')


class TestCatalogItemAccess(unittest.TestCase):

    def test_missing_access_control_allows_ordering(self):
        self.assertTrue(catalog_item_allows_ordering({'spec': {}}, ['users']))

    def test_matching_allow_group_allows_ordering(self):
        item = {'spec': {'accessControl': {'allowGroups': ['users']}}}
        self.assertTrue(catalog_item_allows_ordering(item, ['users']))

    def test_deny_takes_precedence_over_allow(self):
        item = {'spec': {'accessControl': {
            'allowGroups': ['users'],
            'denyGroups': ['suspended'],
        }}}
        self.assertFalse(
            catalog_item_allows_ordering(item, ['users', 'suspended'])
        )

    def test_view_only_and_unmatched_groups_cannot_order(self):
        view_only = {'spec': {'accessControl': {'viewOnlyGroups': ['auditors']}}}
        self.assertFalse(catalog_item_allows_ordering(view_only, ['auditors']))
        self.assertFalse(catalog_item_allows_ordering(view_only, ['users']))

    def test_present_but_empty_access_control_denies(self):
        self.assertFalse(
            catalog_item_allows_ordering({'spec': {'accessControl': {}}}, ['users'])
        )

    def test_malformed_group_lists_fail_closed(self):
        item = {'spec': {'accessControl': {
            'allowGroups': ['users'],
            'denyGroups': 'suspended',
        }}}
        self.assertFalse(catalog_item_allows_ordering(item, ['users']))

    def test_empty_group_lists_and_non_string_session_groups_do_not_match(self):
        empty_groups = {'spec': {'accessControl': {'allowGroups': []}}}
        allowed_users = {'spec': {'accessControl': {'allowGroups': ['users']}}}
        self.assertFalse(catalog_item_allows_ordering(empty_groups, ['users']))
        self.assertFalse(catalog_item_is_visible(empty_groups, ['users']))
        self.assertFalse(catalog_item_allows_ordering(allowed_users, [None, 1]))
        self.assertFalse(catalog_item_is_visible(allowed_users, [None, 1]))

    def test_view_only_group_is_visible_but_cannot_order(self):
        item = {'spec': {'accessControl': {'viewOnlyGroups': ['auditors']}}}
        self.assertTrue(catalog_item_is_visible(item, ['auditors']))
        self.assertFalse(catalog_item_allows_ordering(item, ['auditors']))

    def test_denied_item_is_not_visible(self):
        item = {'spec': {'accessControl': {
            'allowGroups': ['users'], 'denyGroups': ['suspended']
        }}}
        self.assertFalse(catalog_item_is_visible(item, ['users', 'suspended']))


class TestCatalogOrderPolicy(unittest.IsolatedAsyncioTestCase):

    path = f'/apis/{BABYLON_DOMAIN}/v1/namespaces/user-alice/workshops'

    def setUp(self):
        self.session = {
            'user': 'alice',
            'groups': ['users'],
            'catalogNamespaces': [{'name': 'test-catalog'}],
        }
        self.body = {'metadata': {'labels': catalog_labels()}}
        self.get_system_status = AsyncMock(return_value={
            'services_ordering_blocked': False,
            'services_ordering_blocked_message': '',
            'workshops_ordering_blocked': False,
            'workshops_ordering_blocked_message': '',
        })
        self.get_catalog_item = AsyncMock(return_value={
            'metadata': {'name': 'test-item', 'namespace': 'test-catalog'},
            'spec': {'accessControl': {'allowGroups': ['users']}},
        })

    async def enforce(self, **overrides):
        arguments = {
            'method': 'POST',
            'path': self.path,
            'body': self.body,
            'session': self.session,
            'get_system_status': self.get_system_status,
            'get_catalog_item': self.get_catalog_item,
        }
        arguments.update(overrides)
        return await enforce_catalog_order_policy(**arguments)

    async def test_non_target_and_admin_requests_bypass_loaders(self):
        await self.enforce(method='GET')
        admin_session = dict(self.session, admin=True)
        await self.enforce(session=admin_session, body=None)
        self.get_system_status.assert_not_awaited()
        self.get_catalog_item.assert_not_awaited()

    async def test_service_and_workshop_blocks_return_forbidden(self):
        self.get_system_status.return_value['workshops_ordering_blocked'] = True
        self.get_system_status.return_value['workshops_ordering_blocked_message'] = 'Capacity pause'
        with self.assertRaises(CatalogOrderPolicyError) as caught:
            await self.enforce()
        self.assertEqual(caught.exception.status, 403)
        self.assertEqual(caught.exception.code, 'ordering_blocked')
        self.assertEqual(caught.exception.reason, 'Capacity pause')
        self.get_catalog_item.assert_not_awaited()

    async def test_unbound_workshop_still_honors_ordering_block(self):
        self.get_system_status.return_value['workshops_ordering_blocked'] = True
        with self.assertRaises(CatalogOrderPolicyError) as caught:
            await self.enforce(body={'metadata': {}})
        self.assertEqual(caught.exception.status, 403)
        self.assertEqual(caught.exception.code, 'ordering_blocked')

    async def test_reference_namespace_must_be_in_session(self):
        self.session['catalogNamespaces'] = [{'name': 'other-catalog'}]
        with self.assertRaises(CatalogOrderPolicyError) as caught:
            await self.enforce()
        self.assertEqual(caught.exception.status, 403)
        self.assertEqual(caught.exception.code, 'catalog_item_unavailable')
        self.get_catalog_item.assert_not_awaited()

    async def test_missing_or_denied_item_returns_forbidden(self):
        self.get_catalog_item.return_value = None
        with self.assertRaises(CatalogOrderPolicyError) as caught:
            await self.enforce()
        self.assertEqual(caught.exception.status, 403)
        self.assertEqual(caught.exception.code, 'catalog_item_unavailable')

        self.get_catalog_item.return_value = {
            'spec': {'accessControl': {'viewOnlyGroups': ['users']}}
        }
        with self.assertRaises(CatalogOrderPolicyError) as caught:
            await self.enforce()
        self.assertEqual(caught.exception.status, 403)
        self.assertEqual(caught.exception.code, 'catalog_item_access_denied')

    async def test_allowed_item_is_loaded_once(self):
        await self.enforce()
        self.get_system_status.assert_awaited_once_with()
        self.get_catalog_item.assert_awaited_once_with('test-catalog', 'test-item')

    async def test_resourceclaim_provider_is_resolved_in_authorized_namespaces(self):
        self.path = '/apis/poolboy.gpte.redhat.com/v1/namespaces/user-alice/resourceclaims'
        self.body = {'spec': {'provider': {'name': 'test-item'}}}
        self.session['catalogNamespaces'].append({'name': 'other-catalog'})

        async def load(namespace, name):
            if namespace == 'other-catalog' and name == 'test-item':
                return {'spec': {'accessControl': {'allowGroups': ['users']}}}
            return None

        self.get_catalog_item.side_effect = load

        await self.enforce()

        self.assertEqual(
            [call.args for call in self.get_catalog_item.await_args_list],
            [('test-catalog', 'test-item'), ('other-catalog', 'test-item')],
        )

    async def test_resourceclaim_provider_without_match_is_unavailable(self):
        self.path = '/apis/poolboy.gpte.redhat.com/v1/namespaces/user-alice/resourceclaims'
        self.body = {'spec': {'provider': {'name': 'missing-item'}}}
        self.get_catalog_item.return_value = None

        with self.assertRaises(CatalogOrderPolicyError) as caught:
            await self.enforce()

        self.assertEqual(caught.exception.status, 403)
        self.assertEqual(caught.exception.code, 'catalog_item_unavailable')

    async def test_resourceclaim_provider_with_multiple_matches_is_ambiguous(self):
        self.path = '/apis/poolboy.gpte.redhat.com/v1/namespaces/user-alice/resourceclaims'
        self.body = {'spec': {'provider': {'name': 'test-item'}}}
        self.session['catalogNamespaces'].append({'name': 'other-catalog'})

        with self.assertRaises(CatalogOrderPolicyError) as caught:
            await self.enforce()

        self.assertEqual(caught.exception.status, 403)
        self.assertEqual(caught.exception.code, 'catalog_item_ambiguous')

    async def test_malformed_and_duplicate_catalog_namespaces_are_ignored(self):
        self.path = '/apis/poolboy.gpte.redhat.com/v1/namespaces/user-alice/resourceclaims'
        self.body = {'spec': {'provider': {'name': 'test-item'}}}
        self.session['catalogNamespaces'] = [
            None,
            'test-catalog',
            {},
            {'name': 1},
            {'name': 'test-catalog'},
            {'name': 'test-catalog'},
        ]

        await self.enforce()

        self.get_catalog_item.assert_awaited_once_with('test-catalog', 'test-item')

    async def test_missing_catalog_namespaces_make_provider_unavailable(self):
        self.path = '/apis/poolboy.gpte.redhat.com/v1/namespaces/user-alice/resourceclaims'
        self.body = {'spec': {'provider': {'name': 'test-item'}}}
        self.session['catalogNamespaces'] = [None, 'test-catalog', {}, {'name': 1}]
        with self.assertRaises(CatalogOrderPolicyError) as caught:
            await self.enforce()
        self.assertEqual(caught.exception.status, 403)
        self.assertEqual(caught.exception.code, 'catalog_item_unavailable')
        self.get_catalog_item.assert_not_awaited()

    async def test_every_multiworkshop_item_must_allow_ordering(self):
        self.path = f'/apis/{BABYLON_DOMAIN}/v1/namespaces/user-alice/multiworkshops'
        self.session['catalogNamespaces'].append({'name': 'other-catalog'})
        self.body = {'spec': {'assets': [
            {'key': 'allowed', 'name': 'workshop-one', 'namespace': 'test-catalog'},
            {'key': 'denied', 'name': 'workshop-two', 'namespace': 'other-catalog'},
            {'name': 'external', 'type': 'external'},
        ]}}

        async def load(namespace, name):
            access = {'allowGroups': ['users']} if name == 'allowed' else {'denyGroups': ['users']}
            return {'spec': {'accessControl': access}}

        self.get_catalog_item.side_effect = load
        with self.assertRaises(CatalogOrderPolicyError) as caught:
            await self.enforce()
        self.assertEqual(caught.exception.code, 'catalog_item_access_denied')
        self.assertEqual(
            self.get_catalog_item.await_args_list[0].args,
            ('test-catalog', 'allowed'),
        )
        self.assertEqual(
            self.get_catalog_item.await_args_list[1].args,
            ('other-catalog', 'denied'),
        )

    async def test_catalog_loader_errors_fail_closed(self):
        self.get_catalog_item.side_effect = RuntimeError('Kubernetes unavailable')
        with self.assertRaisesRegex(RuntimeError, 'Kubernetes unavailable'):
            await self.enforce()

    async def test_non_dict_status_does_not_block_an_order(self):
        self.get_system_status.return_value = 'unavailable'

        await self.enforce()

        self.get_catalog_item.assert_awaited_once_with('test-catalog', 'test-item')

    async def test_truthy_status_block_uses_fallback_for_blank_message(self):
        self.get_system_status.return_value = {
            'workshops_ordering_blocked': 'yes',
            'workshops_ordering_blocked_message': '',
        }
        with self.assertRaises(CatalogOrderPolicyError) as caught:
            await self.enforce()
        self.assertEqual(caught.exception.status, 403)
        self.assertEqual(caught.exception.code, 'ordering_blocked')
        self.assertEqual(caught.exception.reason, 'Ordering is temporarily unavailable')
        self.get_catalog_item.assert_not_awaited()

    async def test_existing_resourceclaim_workshop_conversion_is_not_a_new_order(self):
        self.get_system_status.return_value['workshops_ordering_blocked'] = True
        body = {
            'metadata': {
                'ownerReferences': [{
                    'apiVersion': 'poolboy.gpte.redhat.com/v1',
                    'kind': 'ResourceClaim',
                    'name': 'existing-claim',
                    'uid': 'claim-uid',
                }],
            },
            'spec': {'provisionDisabled': True},
        }
        get_resource_claim = AsyncMock(return_value={
            'metadata': {
                'name': 'existing-claim',
                'namespace': 'user-alice',
                'uid': 'claim-uid',
            }
        })

        await self.enforce(body=body, get_resource_claim=get_resource_claim)

        get_resource_claim.assert_awaited_once_with('user-alice', 'existing-claim')
        self.get_system_status.assert_not_awaited()
        self.get_catalog_item.assert_not_awaited()

    def resource_claim_workshop_body(self, owner_references):
        return {
            'metadata': {'ownerReferences': owner_references},
            'spec': {'provisionDisabled': True},
        }

    async def test_resourceclaim_workshop_conversion_requires_exactly_one_owner(self):
        owner = {
            'apiVersion': 'poolboy.gpte.redhat.com/v1',
            'kind': 'ResourceClaim',
            'name': 'existing-claim',
            'uid': 'claim-uid',
        }
        cases = (
            None,
            [],
            [{'kind': 'Workshop'}],
            [{**owner, 'apiVersion': 'poolboy.gpte.redhat.com/v2'}],
            [owner, owner],
        )
        for owner_references in cases:
            with self.subTest(owner_references=owner_references):
                with self.assertRaises(CatalogOrderPolicyError) as caught:
                    await self.enforce(
                        body=self.resource_claim_workshop_body(owner_references)
                    )
                self.assertEqual(caught.exception.status, 400)
                self.assertEqual(caught.exception.code, 'invalid_catalog_reference')
        self.get_system_status.assert_not_awaited()
        self.get_catalog_item.assert_not_awaited()

    async def test_resourceclaim_workshop_conversion_requires_owner_name_and_uid(self):
        owner = {
            'apiVersion': 'poolboy.gpte.redhat.com/v1',
            'kind': 'ResourceClaim',
            'name': 'existing-claim',
            'uid': 'claim-uid',
        }
        for field in ('name', 'uid'):
            with self.subTest(field=field):
                malformed_owner = dict(owner)
                del malformed_owner[field]
                with self.assertRaises(CatalogOrderPolicyError) as caught:
                    await self.enforce(body=self.resource_claim_workshop_body([
                        malformed_owner,
                    ]))
                self.assertEqual(caught.exception.status, 400)
                self.assertEqual(caught.exception.code, 'invalid_catalog_reference')

    async def test_resourceclaim_workshop_conversion_requires_lookup_callback(self):
        owner = {
            'apiVersion': 'poolboy.gpte.redhat.com/v1',
            'kind': 'ResourceClaim',
            'name': 'existing-claim',
            'uid': 'claim-uid',
        }
        with self.assertRaises(CatalogOrderPolicyError) as caught:
            await self.enforce(body=self.resource_claim_workshop_body([owner]))
        self.assertEqual(caught.exception.status, 503)
        self.assertEqual(caught.exception.code, 'resource_claim_lookup_failed')
        self.get_system_status.assert_not_awaited()
        self.get_catalog_item.assert_not_awaited()

    async def test_resourceclaim_workshop_conversion_rejects_missing_claim(self):
        owner = {
            'apiVersion': 'poolboy.gpte.redhat.com/v1',
            'kind': 'ResourceClaim',
            'name': 'existing-claim',
            'uid': 'claim-uid',
        }
        get_resource_claim = AsyncMock(return_value=None)
        with self.assertRaises(CatalogOrderPolicyError) as caught:
            await self.enforce(
                body=self.resource_claim_workshop_body([owner]),
                get_resource_claim=get_resource_claim,
            )
        self.assertEqual(caught.exception.status, 403)
        self.assertEqual(caught.exception.code, 'resource_claim_unavailable')
        self.get_system_status.assert_not_awaited()
        self.get_catalog_item.assert_not_awaited()

    async def test_resourceclaim_workshop_conversion_propagates_lookup_errors(self):
        owner = {
            'apiVersion': 'poolboy.gpte.redhat.com/v1',
            'kind': 'ResourceClaim',
            'name': 'existing-claim',
            'uid': 'claim-uid',
        }
        get_resource_claim = AsyncMock(side_effect=RuntimeError('Kubernetes unavailable'))
        with self.assertRaisesRegex(RuntimeError, 'Kubernetes unavailable'):
            await self.enforce(
                body=self.resource_claim_workshop_body([owner]),
                get_resource_claim=get_resource_claim,
            )
        self.get_system_status.assert_not_awaited()
        self.get_catalog_item.assert_not_awaited()

    async def test_malformed_session_groups_do_not_authorize_orders(self):
        self.session['groups'] = 'users'
        with self.assertRaises(CatalogOrderPolicyError) as caught:
            await self.enforce()
        self.assertEqual(caught.exception.status, 403)
        self.assertEqual(caught.exception.code, 'catalog_item_access_denied')

    async def test_resourceclaim_workshop_conversion_rejects_spoofed_owner(self):
        body = {
            'metadata': {
                'ownerReferences': [{
                    'apiVersion': 'poolboy.gpte.redhat.com/v1',
                    'kind': 'ResourceClaim',
                    'name': 'existing-claim',
                    'uid': 'spoofed-uid',
                }],
            },
            'spec': {'provisionDisabled': True},
        }
        get_resource_claim = AsyncMock(return_value={
            'metadata': {
                'name': 'existing-claim',
                'namespace': 'user-alice',
                'uid': 'actual-uid',
            }
        })

        with self.assertRaises(CatalogOrderPolicyError) as caught:
            await self.enforce(body=body, get_resource_claim=get_resource_claim)

        self.assertEqual(caught.exception.status, 400)
        self.assertEqual(caught.exception.code, 'invalid_catalog_reference')
        self.get_system_status.assert_not_awaited()


class FakeRequest:
    method = 'POST'
    path = f'/apis/{BABYLON_DOMAIN}/v1/namespaces/user-alice/workshops'
    headers = {}
    content_type = 'application/json'
    can_read_body = True
    query = {}

    def __init__(self, body):
        self.body = body

    async def json(self):
        return self.body


class InvalidJsonRequest(FakeRequest):
    async def json(self):
        raise json.JSONDecodeError('invalid', '{', 0)


class FakeKubernetesResponse:
    def __init__(self, body=None, status=201, headers=None):
        self.body = body or {'metadata': {}}
        self.status = status
        self.headers = headers or {}

    async def read(self):
        return json.dumps(self.body).encode()


class FakeApiClient:
    def __init__(self):
        self.default_headers = {}
        self.call_api = AsyncMock(return_value=FakeKubernetesResponse())


class TestProxyIntegration(unittest.IsolatedAsyncioTestCase):

    def session(self):
        return {
            'user': 'alice',
            'groups': ['users'],
            'catalogNamespaces': [{'name': 'test-catalog'}],
        }

    def authenticated_patches(self, session):
        return (
            patch.object(catalog_app, 'get_proxy_user', AsyncMock(return_value={
                'metadata': {'name': 'alice'}
            })),
            patch.object(catalog_app, 'get_user_session', AsyncMock(return_value=session)),
            patch.object(catalog_app, 'set_impersonation_for_request', AsyncMock()),
        )

    def catalog_item_request(self, path, body=None, method='GET'):
        request = FakeRequest(body)
        request.method = method
        request.path = path
        return request

    def response_body(self, response):
        return json.loads(gzip.decompress(response.body))

    def resource_claim_workshop_body(self):
        return {
            'metadata': {'ownerReferences': [{
                'apiVersion': 'poolboy.gpte.redhat.com/v1',
                'kind': 'ResourceClaim',
                'name': 'existing-claim',
                'uid': 'claim-uid',
            }]},
            'spec': {'provisionDisabled': True},
        }

    async def test_non_admin_catalog_item_list_filters_invisible_items(self):
        request = self.catalog_item_request(
            f'/apis/{BABYLON_DOMAIN}/v1/namespaces/test-catalog/catalogitems'
        )
        api_client = FakeApiClient()
        api_client.call_api.return_value = FakeKubernetesResponse({
            'metadata': {},
            'items': [
                {'metadata': {'name': 'allowed'}, 'spec': {
                    'accessControl': {'allowGroups': ['users']},
                }},
                {'metadata': {'name': 'view-only'}, 'spec': {
                    'accessControl': {'viewOnlyGroups': ['users']},
                }},
                {'metadata': {'name': 'denied'}, 'spec': {
                    'accessControl': {
                        'allowGroups': ['users'], 'denyGroups': ['users'],
                    },
                }},
                {'metadata': {'name': 'malformed'}, 'spec': {
                    'accessControl': {'allowGroups': 'users'},
                }},
            ],
        })
        auth_patches = self.authenticated_patches(self.session())

        with (auth_patches[0], auth_patches[1], auth_patches[2]):
            response = await catalog_app.openshift_api_proxy(request, api_client=api_client)

        self.assertEqual(response.status, 201)
        self.assertEqual(
            [item['metadata']['name'] for item in self.response_body(response)['items']],
            ['allowed', 'view-only'],
        )
        api_client.call_api.assert_awaited_once()

    async def test_non_admin_denied_catalog_item_returns_not_found(self):
        request = self.catalog_item_request(
            f'/apis/{BABYLON_DOMAIN}/v1/namespaces/test-catalog/catalogitems/denied'
        )
        api_client = FakeApiClient()
        api_client.call_api.return_value = FakeKubernetesResponse({
            'metadata': {'name': 'denied'},
            'spec': {'accessControl': {'denyGroups': ['users']}},
        })
        auth_patches = self.authenticated_patches(self.session())

        with (auth_patches[0], auth_patches[1], auth_patches[2]):
            with self.assertRaises(web.HTTPNotFound):
                await catalog_app.openshift_api_proxy(request, api_client=api_client)

        api_client.call_api.assert_awaited_once()

    async def test_admin_catalog_item_list_is_not_filtered(self):
        request = self.catalog_item_request(
            f'/apis/{BABYLON_DOMAIN}/v1/namespaces/test-catalog/catalogitems'
        )
        api_client = FakeApiClient()
        api_client.call_api.return_value = FakeKubernetesResponse({
            'metadata': {},
            'items': [
                {'metadata': {'name': 'allowed'}, 'spec': {
                    'accessControl': {'allowGroups': ['users']},
                }},
                {'metadata': {'name': 'denied'}, 'spec': {
                    'accessControl': {'denyGroups': ['users']},
                }},
                {'metadata': {'name': 'malformed'}, 'spec': {
                    'accessControl': {'allowGroups': 'users'},
                }},
            ],
        })
        session = self.session()
        session['admin'] = True
        auth_patches = self.authenticated_patches(session)

        with (auth_patches[0], auth_patches[1], auth_patches[2]):
            response = await catalog_app.openshift_api_proxy(request, api_client=api_client)

        self.assertEqual(
            [item['metadata']['name'] for item in self.response_body(response)['items']],
            ['allowed', 'denied', 'malformed'],
        )

    async def test_policy_denial_is_audited_before_forwarding(self):
        body = {'metadata': {'labels': catalog_labels()}}
        request = FakeRequest(body)
        api_client = FakeApiClient()
        session = self.session()
        policy_error = CatalogOrderPolicyError(
            403, 'catalog_item_access_denied', 'Catalog item is not available for ordering'
        )

        with (
            patch.object(catalog_app, 'get_proxy_user', AsyncMock(return_value={
                'metadata': {'name': 'alice'}
            })),
            patch.object(catalog_app, 'get_user_session', AsyncMock(return_value=session)),
            patch.object(catalog_app, 'set_impersonation_for_request', AsyncMock()),
            patch.object(
                catalog_app,
                'enforce_catalog_order_policy',
                AsyncMock(side_effect=policy_error),
                create=True,
            ) as enforce,
            patch.object(catalog_app, 'audit_log') as audit,
        ):
            with self.assertRaises(web.HTTPForbidden):
                await catalog_app.openshift_api_proxy(request, api_client=api_client)

        enforce.assert_awaited_once()
        api_client.call_api.assert_not_awaited()
        audit.assert_called_once()
        self.assertEqual(audit.call_args.args, ('catalog_order_denied',))
        self.assertEqual(audit.call_args.kwargs['user'], 'alice')
        self.assertEqual(audit.call_args.kwargs['status'], 403)
        self.assertEqual(audit.call_args.kwargs['details'], {
            'path': request.path,
            'policy_code': 'catalog_item_access_denied',
        })
        self.assertNotIn('body', audit.call_args.kwargs)

    async def test_missing_catalog_item_is_forbidden_before_forwarding(self):
        request = FakeRequest({'metadata': {'labels': catalog_labels()}})
        api_client = FakeApiClient()
        session = self.session()
        kubernetes_api = SimpleNamespace(
            get_namespaced_custom_object=AsyncMock(
                side_effect=catalog_app.kubernetes_asyncio.client.exceptions.ApiException(
                    status=404
                )
            )
        )
        auth_patches = self.authenticated_patches(session)

        with (
            auth_patches[0],
            auth_patches[1],
            auth_patches[2],
            patch.object(catalog_app, 'custom_objects_api', kubernetes_api),
            patch.object(
                catalog_app,
                'get_system_status_from_configmap',
                AsyncMock(return_value={}),
            ),
            patch.object(catalog_app, 'audit_log') as audit,
        ):
            with self.assertRaises(web.HTTPForbidden):
                await catalog_app.openshift_api_proxy(request, api_client=api_client)

        api_client.call_api.assert_not_awaited()
        self.assertEqual(audit.call_args.kwargs['status'], 403)
        self.assertEqual(
            audit.call_args.kwargs['details']['policy_code'],
            'catalog_item_unavailable',
        )

    async def test_catalog_lookup_failure_is_service_unavailable(self):
        request = FakeRequest({'metadata': {'labels': catalog_labels()}})
        api_client = FakeApiClient()
        session = self.session()
        kubernetes_api = SimpleNamespace(
            get_namespaced_custom_object=AsyncMock(
                side_effect=catalog_app.kubernetes_asyncio.client.exceptions.ApiException(
                    status=500
                )
            )
        )
        auth_patches = self.authenticated_patches(session)

        with (
            auth_patches[0],
            auth_patches[1],
            auth_patches[2],
            patch.object(catalog_app, 'custom_objects_api', kubernetes_api),
            patch.object(
                catalog_app,
                'get_system_status_from_configmap',
                AsyncMock(return_value={}),
            ),
            patch.object(catalog_app, 'audit_log') as audit,
            patch.object(catalog_app, 'audit_log_api_action') as audit_action,
        ):
            with self.assertRaises(web.HTTPServiceUnavailable):
                await catalog_app.openshift_api_proxy(request, api_client=api_client)

        api_client.call_api.assert_not_awaited()
        audit.assert_called_once_with(
            'catalog_order_denied',
            user='alice',
            status=503,
            details={
                'path': request.path,
                'policy_code': 'catalog_item_lookup_failed',
            },
        )
        audit_action.assert_not_called()

    async def test_catalog_transport_failure_is_service_unavailable(self):
        request = FakeRequest({'metadata': {'labels': catalog_labels()}})
        api_client = FakeApiClient()
        session = self.session()
        kubernetes_api = SimpleNamespace(
            get_namespaced_custom_object=AsyncMock(
                side_effect=catalog_app.aiohttp.ClientConnectionError(
                    'Kubernetes unavailable'
                )
            )
        )
        auth_patches = self.authenticated_patches(session)

        with (
            auth_patches[0],
            auth_patches[1],
            auth_patches[2],
            patch.object(catalog_app, 'custom_objects_api', kubernetes_api),
            patch.object(
                catalog_app,
                'get_system_status_from_configmap',
                AsyncMock(return_value={}),
            ),
            patch.object(catalog_app, 'audit_log') as audit,
            patch.object(catalog_app, 'audit_log_api_action') as audit_action,
        ):
            with self.assertRaises(web.HTTPServiceUnavailable):
                await catalog_app.openshift_api_proxy(request, api_client=api_client)

        api_client.call_api.assert_not_awaited()
        audit.assert_called_once_with(
            'catalog_order_denied',
            user='alice',
            status=503,
            details={
                'path': request.path,
                'policy_code': 'catalog_item_lookup_failed',
            },
        )
        audit_action.assert_not_called()

    async def test_policy_service_unavailable_is_audited_once_before_forwarding(self):
        request = FakeRequest({'metadata': {'labels': catalog_labels()}})
        api_client = FakeApiClient()
        policy_error = CatalogOrderPolicyError(
            503, 'resource_claim_lookup_failed', 'Unable to validate ResourceClaim'
        )
        auth_patches = self.authenticated_patches(self.session())

        with (
            auth_patches[0],
            auth_patches[1],
            auth_patches[2],
            patch.object(
                catalog_app,
                'enforce_catalog_order_policy',
                AsyncMock(side_effect=policy_error),
            ),
            patch.object(catalog_app, 'audit_log') as audit,
            patch.object(catalog_app, 'audit_log_api_action') as audit_action,
        ):
            with self.assertRaises(web.HTTPServiceUnavailable):
                await catalog_app.openshift_api_proxy(request, api_client=api_client)

        api_client.call_api.assert_not_awaited()
        audit.assert_called_once_with(
            'catalog_order_denied',
            user='alice',
            status=503,
            details={
                'path': request.path,
                'policy_code': 'resource_claim_lookup_failed',
            },
        )
        audit_action.assert_not_called()

    async def test_missing_resource_claim_conversion_is_denied_before_forwarding(self):
        request = FakeRequest(self.resource_claim_workshop_body())
        api_client = FakeApiClient()
        kubernetes_api = SimpleNamespace(
            get_namespaced_custom_object=AsyncMock(
                side_effect=catalog_app.kubernetes_asyncio.client.exceptions.ApiException(
                    status=404
                )
            )
        )
        auth_patches = self.authenticated_patches(self.session())

        with (
            auth_patches[0],
            auth_patches[1],
            auth_patches[2],
            patch.object(catalog_app, 'custom_objects_api', kubernetes_api),
            patch.object(catalog_app, 'audit_log') as audit,
            patch.object(catalog_app, 'audit_log_api_action') as audit_action,
        ):
            with self.assertRaises(web.HTTPForbidden):
                await catalog_app.openshift_api_proxy(request, api_client=api_client)

        kubernetes_api.get_namespaced_custom_object.assert_awaited_once_with(
            group='poolboy.gpte.redhat.com',
            version='v1',
            namespace='user-alice',
            plural='resourceclaims',
            name='existing-claim',
        )
        api_client.call_api.assert_not_awaited()
        audit.assert_called_once_with(
            'catalog_order_denied',
            user='alice',
            status=403,
            details={
                'path': request.path,
                'policy_code': 'resource_claim_unavailable',
            },
        )
        audit_action.assert_not_called()

    async def test_resource_claim_conversion_lookup_failures_are_denied_before_forwarding(self):
        exceptions = (
            catalog_app.kubernetes_asyncio.client.exceptions.ApiException(status=500),
            catalog_app.aiohttp.ClientConnectionError('Kubernetes unavailable'),
            catalog_app.asyncio.TimeoutError(),
        )
        for exception in exceptions:
            with self.subTest(exception=type(exception).__name__):
                request = FakeRequest(self.resource_claim_workshop_body())
                api_client = FakeApiClient()
                kubernetes_api = SimpleNamespace(
                    get_namespaced_custom_object=AsyncMock(side_effect=exception)
                )
                auth_patches = self.authenticated_patches(self.session())

                with (
                    auth_patches[0],
                    auth_patches[1],
                    auth_patches[2],
                    patch.object(catalog_app, 'custom_objects_api', kubernetes_api),
                    patch.object(catalog_app, 'audit_log') as audit,
                    patch.object(catalog_app, 'audit_log_api_action') as audit_action,
                ):
                    with self.assertRaises(web.HTTPServiceUnavailable):
                        await catalog_app.openshift_api_proxy(request, api_client=api_client)

                kubernetes_api.get_namespaced_custom_object.assert_awaited_once_with(
                    group='poolboy.gpte.redhat.com',
                    version='v1',
                    namespace='user-alice',
                    plural='resourceclaims',
                    name='existing-claim',
                )
                api_client.call_api.assert_not_awaited()
                audit.assert_called_once_with(
                    'catalog_order_denied',
                    user='alice',
                    status=503,
                    details={
                        'path': request.path,
                        'policy_code': 'resource_claim_lookup_failed',
                    },
                )
                audit_action.assert_not_called()

    async def test_valid_resource_claim_conversion_forwards_while_ordering_is_blocked(self):
        body = self.resource_claim_workshop_body()
        request = FakeRequest(body)
        api_client = FakeApiClient()
        api_client.default_headers['Impersonate-User'] = 'alice-effective'
        kubernetes_api = SimpleNamespace(
            get_namespaced_custom_object=AsyncMock(return_value={
                'metadata': {
                    'name': 'existing-claim',
                    'namespace': 'user-alice',
                    'uid': 'claim-uid',
                },
            })
        )
        system_status = AsyncMock(return_value={
            'workshops_ordering_blocked': True,
            'workshops_ordering_blocked_message': 'Capacity pause',
        })
        auth_patches = self.authenticated_patches(self.session())

        with (
            auth_patches[0],
            auth_patches[1],
            auth_patches[2],
            patch.object(catalog_app, 'custom_objects_api', kubernetes_api),
            patch.object(catalog_app, 'get_system_status_from_configmap', system_status),
            patch.object(catalog_app, 'audit_log') as audit,
            patch.object(catalog_app, 'audit_log_api_action') as audit_action,
        ):
            response = await catalog_app.openshift_api_proxy(request, api_client=api_client)

        self.assertEqual(response.status, 201)
        kubernetes_api.get_namespaced_custom_object.assert_awaited_once_with(
            group='poolboy.gpte.redhat.com',
            version='v1',
            namespace='user-alice',
            plural='resourceclaims',
            name='existing-claim',
        )
        system_status.assert_not_awaited()
        api_client.call_api.assert_awaited_once()
        self.assertEqual(api_client.call_api.await_args.kwargs['body'], body)
        audit.assert_not_called()
        audit_action.assert_called_once_with(
            user='alice',
            effective_user='alice-effective',
            method='POST',
            path=request.path,
            status=201,
            body=body,
        )

    async def test_system_status_lookup_failure_is_service_unavailable(self):
        request = FakeRequest({'metadata': {'labels': catalog_labels()}})
        exceptions = (
            catalog_app.kubernetes_asyncio.client.exceptions.ApiException(status=500),
            catalog_app.aiohttp.ClientConnectionError('Kubernetes unavailable'),
            catalog_app.asyncio.TimeoutError(),
        )
        for exception in exceptions:
            with self.subTest(exception=type(exception).__name__):
                api_client = FakeApiClient()
                core_api = SimpleNamespace(
                    read_namespaced_config_map=AsyncMock(side_effect=exception)
                )
                kubernetes_api = SimpleNamespace(
                    get_namespaced_custom_object=AsyncMock()
                )
                auth_patches = self.authenticated_patches(self.session())

                with (
                    auth_patches[0],
                    auth_patches[1],
                    auth_patches[2],
                    patch.object(catalog_app, 'core_v1_api', core_api),
                    patch.object(catalog_app, 'custom_objects_api', kubernetes_api),
                    patch.object(catalog_app, 'audit_log') as audit,
                    patch.object(catalog_app, 'audit_log_api_action') as audit_action,
                ):
                    with self.assertRaises(web.HTTPServiceUnavailable):
                        await catalog_app.openshift_api_proxy(request, api_client=api_client)

                api_client.call_api.assert_not_awaited()
                kubernetes_api.get_namespaced_custom_object.assert_not_awaited()
                audit.assert_called_once_with(
                    'catalog_order_denied',
                    user='alice',
                    status=503,
                    details={
                        'path': request.path,
                        'policy_code': 'catalog_item_lookup_failed',
                    },
                )
                audit_action.assert_not_called()

    async def test_missing_system_status_configmap_is_unblocked(self):
        core_api = SimpleNamespace(
            read_namespaced_config_map=AsyncMock(
                side_effect=catalog_app.kubernetes_asyncio.client.exceptions.ApiException(
                    status=404
                )
            )
        )
        with patch.object(catalog_app, 'core_v1_api', core_api):
            status = await catalog_app.get_system_status_from_configmap(strict=True)

        self.assertFalse(status['services_ordering_blocked'])
        self.assertFalse(status['workshops_ordering_blocked'])

    async def test_malformed_json_returns_bad_request_before_forwarding(self):
        request = InvalidJsonRequest(None)
        api_client = FakeApiClient()
        session = self.session()
        auth_patches = self.authenticated_patches(session)

        with (
            auth_patches[0],
            auth_patches[1],
            auth_patches[2],
            patch.object(catalog_app, 'audit_log') as audit,
        ):
            with self.assertRaises(web.HTTPBadRequest):
                await catalog_app.openshift_api_proxy(request, api_client=api_client)

        api_client.call_api.assert_not_awaited()
        self.assertEqual(audit.call_args.kwargs['status'], 400)
        self.assertEqual(
            audit.call_args.kwargs['details']['policy_code'],
            'invalid_json',
        )

    async def test_allowed_order_is_forwarded_with_original_body(self):
        body = {'metadata': {'labels': catalog_labels()}}
        request = FakeRequest(body)
        api_client = FakeApiClient()
        api_client.default_headers['Impersonate-User'] = 'alice-effective'
        session = self.session()
        kubernetes_api = SimpleNamespace(
            get_namespaced_custom_object=AsyncMock(return_value={
                'metadata': {'name': 'test-item', 'namespace': 'test-catalog'},
                'spec': {'accessControl': {'allowGroups': ['users']}},
            })
        )
        auth_patches = self.authenticated_patches(session)

        with (
            auth_patches[0],
            auth_patches[1],
            auth_patches[2],
            patch.object(catalog_app, 'custom_objects_api', kubernetes_api),
            patch.object(
                catalog_app,
                'get_system_status_from_configmap',
                AsyncMock(return_value={}),
            ),
            patch.object(catalog_app, 'audit_log_api_action') as audit_action,
        ):
            response = await catalog_app.openshift_api_proxy(
                request, api_client=api_client
            )

        self.assertEqual(response.status, 201)
        api_client.call_api.assert_awaited_once()
        self.assertEqual(api_client.call_api.await_args.kwargs['body'], body)
        audit_action.assert_called_once_with(
            user='alice',
            effective_user='alice-effective',
            method='POST',
            path=request.path,
            status=201,
            body=body,
        )


if __name__ == '__main__':
    unittest.main()
