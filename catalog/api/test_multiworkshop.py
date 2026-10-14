import json
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

import app as catalog_app


class PublicMultiWorkshopTests(unittest.IsolatedAsyncioTestCase):
    async def test_seat_availability_by_asset_type(self):
        for asset_type, plural, count_key, available_key in (
            ('Workshop', 'workshops', 'userCount', 'available'),
            ('SelfPacedLab', 'selfpacedlabs', 'poolCount', 'ready'),
        ):
            for available in (0, 1, 5, None):
                with self.subTest(asset_type=asset_type, available=available):
                    asset = {'type': asset_type, 'name': 'lab', 'namespace': 'event'}
                    resource = {'status': {count_key: {available_key: available}}} if available is not None else {}
                    api = MagicMock()
                    api.list_cluster_custom_object = AsyncMock(return_value={
                        'items': [{'spec': {'assets': [asset]}}],
                    })
                    api.get_namespaced_custom_object = AsyncMock(return_value=resource)
                    request = MagicMock(match_info={'multi_workshop_id': 'test-event'})

                    with patch.object(catalog_app, 'custom_objects_api', api):
                        response = await catalog_app.public_multiworkshop_get(request)

                    self.assertEqual(response.status, 200)
                    result = json.loads(response.text)['spec']['assets'][0]
                    if available is None:
                        self.assertNotIn('availableSeats', result)
                    else:
                        self.assertEqual(result['availableSeats'], available)
                    api.get_namespaced_custom_object.assert_awaited_once_with(
                        group='babylon.gpte.redhat.com', version='v1',
                        namespace='event', plural=plural, name='lab',
                    )
