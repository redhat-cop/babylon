"""AgnosticV `__meta__.catalog.approval_policy` publication into CatalogItem.

Run from client/python/babylon_async with the library dependencies installed:

    PYTHONPATH=src python -m unittest discover -s tests
"""

import unittest
from types import SimpleNamespace

from babylon_async import AgnosticVComponent
from babylon_async.approval_policy import load_published_policy

PARAMETERS = [
    {'name': 'num_users', 'openAPIV3Schema': {'type': 'integer', 'default': 5}},
]


def component(catalog_meta, name='tests.test-item.prod', external_url=None):
    catalog = {'namespace': 'babylon-catalog-prod', 'parameters': PARAMETERS, **catalog_meta}
    if external_url:
        catalog['externalUrl'] = external_url
    definition = {
        'apiVersion': 'gpte.redhat.com/v1',
        'kind': 'AgnosticVComponent',
        'metadata': {'name': name, 'namespace': 'babylon-config'},
        'spec': {
            'agnosticvRepo': 'agnosticv',
            'path': 'tests/test-item/prod.yaml',
            'definition': {
                '__meta__': {
                    'asset_uuid': 'asset-123',
                    'catalog': catalog,
                    'deployer': {'type': 'agnosticd'},
                    'last_update': {'git': {'hash': 'abc123'}},
                },
            },
        },
    }
    return AgnosticVComponent(None, definition)


def catalog_item_spec(agnosticv_component):
    repo = SimpleNamespace(name='agnosticv', git_ref='main', git_url='https://example.com/agnosticv.git')
    definition = agnosticv_component.get_catalog_item_definition(
        agnosticv_repo=repo, linked_agnosticv_components=[], tenant_cluster_components={},
    )
    return definition['spec']


class TestApprovalPolicyPublication(unittest.TestCase):
    def test_absent_policy_is_not_published(self):
        self.assertNotIn('approvalPolicy', catalog_item_spec(component({})))

    def test_valid_policy_is_published_with_provenance(self):
        spec = catalog_item_spec(component({'approval_policy': {
            'version': 'v1',
            'rules': {'large': {
                'when': {'field': 'parameters.num_users', 'op': 'gte', 'value': 20},
                'require': 'manager',
                'reason': 'Large environments require manager approval.',
            }},
        }}))
        policy = spec['approvalPolicy']
        self.assertEqual(policy['state'], 'Valid')
        self.assertEqual(policy['source'], {
            'agnosticvRepo': 'agnosticv', 'path': 'tests/test-item/prod.yaml', 'gitCommit': 'abc123',
        })
        load_published_policy(policy, spec['parameters'])

    def test_invalid_policy_is_published_as_invalid_not_dropped(self):
        for raw in (
            None,
            {'version': 'v1', 'rules': [{'id': 'x'}]},
            {'version': 'v1', 'rules': {'r': {
                'when': {'field': 'parameters.undefined', 'op': 'eq', 'value': 1},
                'require': 'manager', 'reason': 'x'}}},
        ):
            with self.subTest(raw=raw):
                policy = catalog_item_spec(component({'approval_policy': raw}))['approvalPolicy']
                self.assertEqual(policy['state'], 'Invalid')
                self.assertTrue(policy['errors'])

    def test_external_url_items_keep_policy_visible(self):
        spec = catalog_item_spec(component(
            {'approval_policy': {'version': 'v1', 'default': 'manager_required'}},
            external_url='https://example.com',
        ))
        self.assertEqual(spec['approvalPolicy']['state'], 'Valid')
        self.assertEqual(spec['externalUrl'], 'https://example.com')


if __name__ == '__main__':
    unittest.main()
