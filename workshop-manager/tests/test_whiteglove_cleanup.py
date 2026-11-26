import asyncio
import sys
import types
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'operator'))


class _ApiException(Exception):
    def __init__(self, status):
        super().__init__(status)
        self.status = status


def _install_stubs():
    """Stub the runtime dependencies so whiteglove.py imports without a cluster or installed deps."""
    k8s = types.ModuleType('kubernetes_asyncio')
    k8s.client = types.SimpleNamespace(rest=types.SimpleNamespace(ApiException=_ApiException))
    sys.modules.setdefault('kubernetes_asyncio', k8s)
    sys.modules.setdefault('aiohttp', types.ModuleType('aiohttp'))

    runtime = types.ModuleType('operatorruntime')

    class OperatorRuntime:
        babylon_domain = 'babylon.gpte.redhat.com'
        babylon_api_version = 'v1'
        poolboy_domain = 'poolboy.gpte.redhat.com'
        poolboy_api_version = 'v1'
        demo_domain = 'demo.redhat.com'
        custom_objects_api = None

    runtime.OperatorRuntime = OperatorRuntime
    sys.modules['operatorruntime'] = runtime

    kopfobject = types.ModuleType('kopfobject')

    class KopfObject:
        def __init__(self, annotations, labels, meta, name, namespace, spec, status, uid, **_):
            self.annotations = annotations
            self.labels = labels
            self.metadata = meta
            self.name = name
            self.namespace = namespace
            self.spec = spec
            self.status = status
            self.uid = uid

        @property
        def is_deleting(self):
            return 'deletionTimestamp' in self.metadata

    kopfobject.KopfObject = KopfObject
    sys.modules['kopfobject'] = kopfobject


_install_stubs()
import whiteglove  # noqa: E402
from whiteglove import WhiteGloveRequest, is_retention_expired, parse_event_end_date  # noqa: E402

def api_exc(status):
    # Use whichever ApiException whiteglove actually sees (stub here, real lib in CI).
    return whiteglove.kubernetes_asyncio.client.rest.ApiException(status=status)


NOW = datetime(2026, 11, 26, 12, 0, tzinfo=timezone.utc)


def make_wgr(event_end_date='2026-10-01T10:00:00.000Z', service_type='workshops', meta=None):
    annotations = {}
    if service_type:
        annotations = {
            'demo.redhat.com/service-type': service_type,
            'demo.redhat.com/service-namespace': 'user-ns',
            'demo.redhat.com/service-name': 'my-workshop',
        }
    wgr = WhiteGloveRequest(
        annotations=annotations, labels={}, meta=meta or {}, name='wgr-1', namespace='user-ns',
        spec={'eventEndDate': event_end_date} if event_end_date else {}, status={}, uid='uid-1',
    )
    wgr.delete = AsyncMock()
    return wgr


def set_get_result(side_effect=None):
    api = MagicMock()
    api.get_namespaced_custom_object = AsyncMock(side_effect=side_effect, return_value={})
    whiteglove.OperatorRuntime.custom_objects_api = api
    return api


def run(coro):
    return asyncio.run(coro)


class RetentionTest(unittest.TestCase):
    def test_parse(self):
        self.assertEqual(parse_event_end_date('2026-10-01T10:00:00.000Z'),
                         datetime(2026, 10, 1, 10, 0, tzinfo=timezone.utc))
        self.assertEqual(parse_event_end_date('2026-10-01T12:00:00+02:00'),
                         datetime(2026, 10, 1, 10, 0, tzinfo=timezone.utc))
        for bad in [None, '', 'not-a-date', 123]:
            self.assertIsNone(parse_event_end_date(bad))

    def test_boundary(self):
        self.assertTrue(is_retention_expired('2026-10-27T12:00:00Z', NOW, 30))
        self.assertFalse(is_retention_expired('2026-10-27T12:00:01Z', NOW, 30))
        self.assertFalse(is_retention_expired(None, NOW, 30))


class CleanupTest(unittest.TestCase):
    def check(self, wgr):
        return run(wgr.check_and_cleanup(logger=MagicMock(), retention_days=30, now=NOW))

    def test_deletes_when_expired_and_workshop_gone(self):
        api = set_get_result(api_exc(404))
        wgr = make_wgr()
        self.assertTrue(self.check(wgr))
        wgr.delete.assert_awaited_once()
        self.assertEqual(api.get_namespaced_custom_object.call_args.kwargs['plural'], 'workshops')

    def test_keeps_when_workshop_still_exists(self):
        set_get_result()
        wgr = make_wgr()
        self.assertFalse(self.check(wgr))
        wgr.delete.assert_not_awaited()

    def test_keeps_within_retention(self):
        api = set_get_result(api_exc(404))
        wgr = make_wgr(event_end_date='2026-11-20T10:00:00Z')
        self.assertFalse(self.check(wgr))
        wgr.delete.assert_not_awaited()
        api.get_namespaced_custom_object.assert_not_awaited()

    def test_keeps_without_event_end_date(self):
        set_get_result(api_exc(404))
        wgr = make_wgr(event_end_date=None)
        self.assertFalse(self.check(wgr))
        wgr.delete.assert_not_awaited()

    def test_keeps_on_api_error(self):
        set_get_result(api_exc(500))
        wgr = make_wgr()
        with self.assertRaises(whiteglove.kubernetes_asyncio.client.rest.ApiException):
            self.check(wgr)
        wgr.delete.assert_not_awaited()

    def test_deletes_unlinked_when_expired(self):
        api = set_get_result()
        wgr = make_wgr(service_type=None)
        self.assertTrue(self.check(wgr))
        api.get_namespaced_custom_object.assert_not_awaited()

    def test_other_service_types(self):
        for service_type, plural in [('selfpacedlabs', 'selfpacedlabs'), ('services', 'resourceclaims')]:
            with self.subTest(service_type=service_type):
                api = set_get_result(api_exc(404))
                self.assertTrue(self.check(make_wgr(service_type=service_type)))
                self.assertEqual(api.get_namespaced_custom_object.call_args.kwargs['plural'], plural)

    def test_unknown_service_type_is_kept(self):
        set_get_result(api_exc(404))
        wgr = make_wgr(service_type='multi-workshop')
        self.assertFalse(self.check(wgr))
        wgr.delete.assert_not_awaited()

    def test_skips_when_already_deleting(self):
        set_get_result(api_exc(404))
        wgr = make_wgr(meta={'deletionTimestamp': '2026-11-26T00:00:00Z'})
        self.assertFalse(self.check(wgr))
        wgr.delete.assert_not_awaited()


if __name__ == '__main__':
    unittest.main()
