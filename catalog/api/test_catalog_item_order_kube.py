"""KubeOrderClient behaviour that the FakeKube used elsewhere cannot cover."""

import unittest
from types import SimpleNamespace

from catalog_item_order_kube import KubeOrderClient


class FakeAuthorizationApi:
    def __init__(self):
        self.bodies = []

    async def create_subject_access_review(self, body):
        self.bodies.append(body)
        return SimpleNamespace(status=SimpleNamespace(allowed=True))


class TestCheckAccess(unittest.IsolatedAsyncioTestCase):
    async def test_review_includes_the_groups_every_signed_in_user_has(self):
        client = KubeOrderClient.__new__(KubeOrderClient)
        client.authorization_api = FakeAuthorizationApi()
        allowed = await client.check_access(
            'alice', ['rhpds-users', 'system:authenticated'], 'poolboy.gpte.redhat.com', 'resourceclaims',
            'order', 'user-alice',
        )
        self.assertTrue(allowed)
        spec = client.authorization_api.bodies[0]['spec']
        self.assertEqual(spec['user'], 'alice')
        self.assertEqual(spec['groups'], ['rhpds-users', 'system:authenticated', 'system:authenticated:oauth'])
        self.assertEqual(spec['resourceAttributes'], {
            'group': 'poolboy.gpte.redhat.com', 'resource': 'resourceclaims', 'verb': 'order', 'namespace': 'user-alice',
        })


if __name__ == '__main__':
    unittest.main()
