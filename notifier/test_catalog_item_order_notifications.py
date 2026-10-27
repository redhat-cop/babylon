import asyncio
import copy
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import Mock

import jinja2
from html2text import html2text

sys.path.insert(0, str(Path(__file__).parent / 'operator'))
from catalog_item_order import (  # noqa: E402
    EVENT_APPROVAL_REQUEST,
    EVENT_APPROVED,
    EVENT_DENIED,
    EVENT_EXPIRED,
    notifications_for,
    subject_for,
    template_vars,
)
from catalog_item_order_notifier import OrderNotifier  # noqa: E402

NOW = datetime.now(timezone.utc).replace(microsecond=0)
TEMPLATES = Path(__file__).parent / 'operator' / 'templates'

# Same configuration as the notifier operator.
j2env = jinja2.Environment(
    loader=jinja2.FileSystemLoader([str(TEMPLATES)]),
    trim_blocks=True,
    autoescape=jinja2.select_autoescape(['html', 'htm', 'xml'], default_for_string=True),
)


def ts(delta=timedelta()):
    return (NOW + delta).strftime('%Y-%m-%dT%H:%M:%SZ')


def pending_order(**approval_overrides):
    approval = {
        'state': 'Pending',
        'requestedAt': ts(-timedelta(minutes=5)),
        'expiresAt': ts(timedelta(hours=72)),
        'reviewUrl': 'https://catalog.example.com/approvals/order-uid-1',
        'manager': {
            'source': 'reporting-api', 'state': 'Resolved', 'resolvedAt': ts(-timedelta(minutes=4)),
            'directManager': {'email': 'dana.manager@example.com', 'name': 'Dana Manager'},
        },
    }
    approval.update(approval_overrides)
    return {
        'apiVersion': 'babylon.gpte.redhat.com/v1',
        'kind': 'CatalogItemOrder',
        'metadata': {'name': 'order-1', 'namespace': 'user-alice', 'uid': 'order-uid-1'},
        'spec': {
            'orderType': 'workshop',
            'requester': {'user': 'alice', 'uid': 'uid-alice', 'email': 'alice@example.com'},
            'catalogItem': {'name': 'tests.item.prod', 'namespace': 'babylon-catalog-prod'},
            'request': {
                'purpose': 'Training - Internal', 'activity': 'Internal',
                'explanation': 'Partner <script>alert(1)</script> enablement',
                'parameters': {'num_users': 25, 'admin_password': 'hunter2'},
                'schedule': {'endAfter': '3d'},
                'workshop': {'count': 12, 'accessPassword': 'secret12'},
            },
        },
        'status': {
            'phase': 'PendingApproval',
            'approval': approval,
            'policy': {'matchedRules': [{'id': 'large', 'reason': 'Large workshops need approval.'}]},
            'orderUrl': 'https://catalog.example.com/orders/user-alice/order-1',
        },
    }


def decided(order, state, phase, **extra):
    order = copy.deepcopy(order)
    order['status']['phase'] = phase
    approval = order['status']['approval']
    approval['state'] = state
    approval.update(extra)
    return order


def approved_order():
    order = pending_order()
    decision = {'outcome': 'Approved', 'decidedBy': 'dana.manager@example.com', 'decidedAt': ts(), 'comment': 'OK'}
    return decided(order, 'Approved', 'Provisioning', decision=decision, satisfiedAt=ts())


class FakeRedis:
    def __init__(self):
        self.values = {}
        self.ttls = {}

    async def get(self, key):
        return self.values.get(key)

    async def set(self, key, value, nx=False, ex=None):
        if nx and key in self.values:
            return None
        self.values[key] = value
        if ex is not None:
            self.ttls[key] = ex.total_seconds() if isinstance(ex, timedelta) else ex
        return True

    async def delete(self, key):
        self.values.pop(key, None)
        self.ttls.pop(key, None)

    async def ttl(self, key):
        return int(self.ttls.get(key, -1))

    async def incr(self, key):
        self.values[key] = int(self.values.get(key, 0)) + 1
        return self.values[key]

    async def expire(self, key, ttl):
        self.ttls[key] = ttl.total_seconds() if isinstance(ttl, timedelta) else ttl


class TestNotificationsFor(unittest.TestCase):
    def test_approval_request_goes_to_resolved_direct_manager(self):
        notifications = notifications_for(pending_order(), now=NOW)
        self.assertEqual([(n.event, n.recipient) for n in notifications],
                         [(EVENT_APPROVAL_REQUEST, 'dana.manager@example.com')])
        self.assertIn('order-uid-1', notifications[0].key)

    def test_no_request_until_manager_resolved_or_when_obsolete(self):
        unresolved = pending_order(manager={'state': 'Unresolved', 'reason': 'ManagerLookupUnavailable'})
        expired_window = pending_order(expiresAt=ts(-timedelta(minutes=1)))
        cancelled = decided(pending_order(), 'Pending', 'Cancelled')
        self_managed = pending_order()
        self_managed['status']['approval']['manager']['directManager']['email'] = 'alice@example.com'
        for order in (unresolved, expired_window, cancelled, self_managed):
            self.assertEqual(notifications_for(order, now=NOW), [])

    def test_requester_outcome_notifications(self):
        denied = decided(pending_order(), 'Denied', 'Denied', decision={'outcome': 'Denied', 'decidedAt': ts(), 'decidedBy': 'x'})
        revoked = decided(pending_order(), 'Revoked', 'Denied', revocation={'revokedAt': ts(), 'reason': 'No budget'})
        expired = decided(pending_order(expiresAt=ts(-timedelta(minutes=1))), 'Expired', 'Expired')
        for order, event in ((approved_order(), EVENT_APPROVED), (denied, EVENT_DENIED),
                             (revoked, EVENT_DENIED), (expired, EVENT_EXPIRED)):
            with self.subTest(event=event):
                self.assertEqual([(n.event, n.recipient) for n in notifications_for(order, now=NOW)],
                                 [(event, 'alice@example.com')])

    def test_not_required_and_old_events_send_nothing(self):
        not_required = decided(pending_order(), 'NotRequired', 'Provisioning')
        self.assertEqual(notifications_for(not_required, now=NOW), [])
        self.assertEqual(notifications_for(approved_order(), now=NOW + timedelta(days=8)), [])

    def test_provisioning_retry_does_not_create_new_events(self):
        order = approved_order()
        first = notifications_for(order, now=NOW)
        retried = copy.deepcopy(order)
        retried['status']['phase'] = 'Provisioning'
        retried['status']['attempts'] = [{'number': 1, 'state': 'CleanedUp'}, {'number': 2, 'state': 'Provisioning'}]
        self.assertEqual(notifications_for(retried, now=NOW + timedelta(hours=1)), first)


class TestTemplates(unittest.TestCase):
    def render(self, order, event_index=0):
        notification = notifications_for(order, now=NOW)[event_index]
        catalog_item = {'spec': {'displayName': 'OpenShift <b>Workshop</b>'}}
        variables = template_vars(notification, order, catalog_item, 'Babylon Catalog')
        html = j2env.get_template(notification.template + '.mjml.j2').render(**variables)
        return notification, variables, html

    def test_approval_request_template(self):
        notification, variables, html = self.render(pending_order())
        self.assertIn('logo-rhpds.png', html, 'existing branding')
        self.assertIn('Review request', html)
        self.assertIn('href="https://catalog.example.com/approvals/order-uid-1"', html)
        self.assertIn('Large workshops need approval.', html)
        self.assertIn('Training - Internal', html)
        self.assertIn('&times; 12', html)
        self.assertIn('from Babylon Catalog', html)
        self.assertIn('expires on', html)
        self.assertNotIn('<script>', html)
        self.assertIn('&lt;script&gt;', html)
        self.assertNotIn('<b>Workshop</b>', html)
        for secret in ('hunter2', 'secret12', 'admin_password'):
            self.assertNotIn(secret, html)
        self.assertIn('opening the link does not record a decision', html)
        self.assertEqual(subject_for(notification, variables),
                         'Approval requested: OpenShift <b>Workshop</b> for alice')

    def test_outcome_templates(self):
        denied = decided(pending_order(), 'Denied', 'Denied',
                         decision={'outcome': 'Denied', 'decidedAt': ts(), 'decidedBy': 'dana', 'comment': 'Too big'})
        revoked = decided(pending_order(), 'Revoked', 'Denied', revocation={'revokedAt': ts(), 'reason': 'No budget'})
        expired = decided(pending_order(expiresAt=ts(-timedelta(minutes=1))), 'Expired', 'Expired')
        for order, expected in (
            (approved_order(), ['was approved', 'by dana.manager@example.com', 'continue to provisioning', 'View order']),
            (denied, ['was denied', 'Too big', 'will not be provisioned']),
            (revoked, ['was revoked', 'No budget']),
            (expired, ['not approved before the request expired']),
        ):
            with self.subTest(expected=expected[0]):
                _, _, html = self.render(order)
                for text in expected:
                    self.assertIn(text, html)
                self.assertIn('https://catalog.example.com/orders/user-alice/order-1', html)
                self.assertNotIn('provisioning has started', html.lower())

    def test_subject_is_single_line(self):
        order = pending_order()
        order['spec']['requester']['user'] = 'alice\r\nBcc: victim@example.com'
        notification = notifications_for(order, now=NOW)[0]
        subject = subject_for(notification, template_vars(notification, order))
        self.assertNotIn('\n', subject)
        self.assertNotIn('\r', subject)

    def test_existing_templates_still_render(self):
        base_vars = {
            'service_status': 'Ready', 'service_display_name': 'svc', 'catalog_namespace': {'display_name': 'Cat'},
            'service_url': 'https://catalog.example.com/services/ns/svc', 'workshop_name': 'w', 'workshop_id': 'id',
            'retirement_timestamp': None, 'catalog_item': Mock(display_name='x'),
            'stop_timestamp': None, 'survey_link': None, 'have_attachments': False,
        }
        for template in ('workshop-ready', 'workshop-provision-started', 'provision-failed'):
            with self.subTest(template=template):
                html = j2env.get_template(f"{template}.mjml.j2").render(**base_vars)
                self.assertIn('Open in portal', html)
                self.assertIn('https://catalog.example.com/services/ns/svc', html)


class TestDelivery(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.redis = FakeRedis()
        self.orders = {('user-alice', 'order-1'): pending_order()}
        self.sent = []
        self.send_failures = 0
        self.warnings = []

    def notifier(self, **kwargs):
        async def get_order(namespace, name):
            order = self.orders.get((namespace, name))
            return copy.deepcopy(order) if order else None

        async def get_catalog_item(namespace, name):
            return {'spec': {'displayName': 'OpenShift Workshop'}}

        async def send(msg):
            if self.send_failures:
                self.send_failures -= 1
                raise OSError('SMTP unavailable')
            self.sent.append(msg)

        def render(template, variables):
            return j2env.get_template(template + '.mjml.j2').render(**variables)

        options = dict(
            redis=self.redis, get_order=get_order, get_catalog_item=get_catalog_item,
            render_html=render, html_to_text=html2text, send=send, sender='RHDP <noreply@example.com>',
            post_warning=lambda order, reason, message: self.warnings.append((reason, message)),
            clock=lambda: NOW, retry_base=0, retry_cap=0,
        )
        options.update(kwargs)
        return OrderNotifier(**options)

    async def settle(self, notifier):
        for _ in range(50):
            if not notifier.retry_tasks:
                return
            await asyncio.sleep(0)
            await asyncio.gather(*list(notifier.retry_tasks.values()), return_exceptions=True)

    async def test_sends_once_despite_duplicate_events_and_restarts(self):
        notifier = self.notifier()
        order = self.orders[('user-alice', 'order-1')]
        await asyncio.gather(notifier.handle(order), notifier.handle(order), notifier.handle(order))
        await self.notifier().handle(order)
        self.assertEqual(len(self.sent), 1)
        msg = self.sent[0]
        self.assertEqual(msg['To'], 'dana.manager@example.com')
        self.assertEqual(msg['From'], 'RHDP <noreply@example.com>')
        self.assertTrue(msg['Subject'].startswith('Approval requested: OpenShift Workshop'))
        plain, html = [part.get_payload(decode=True).decode() for part in msg.get_payload()]
        self.assertIn('Review request', html)
        self.assertIn('Large workshops need approval.', plain)

    async def test_failed_send_is_retried_and_not_suppressed(self):
        self.send_failures = 2
        notifier = self.notifier()
        await notifier.handle(self.orders[('user-alice', 'order-1')])
        await self.settle(notifier)
        self.assertEqual(len(self.sent), 1)
        key = notifications_for(self.orders[('user-alice', 'order-1')], now=NOW)[0].key
        self.assertEqual(self.redis.values[key], 'sent')
        self.assertNotIn(f"{key}/attempts", self.redis.values)

    async def test_exhausted_retries_warn_and_next_event_retries(self):
        self.send_failures = 3
        notifier = self.notifier(max_attempts=3)
        order = self.orders[('user-alice', 'order-1')]
        await notifier.handle(order)
        await self.settle(notifier)
        self.assertEqual(self.sent, [])
        self.assertEqual(self.warnings[0][0], 'ApprovalNotificationFailed')
        key = notifications_for(order, now=NOW)[0].key
        self.assertNotIn(key, self.redis.values, 'a failed email is never recorded as sent')
        await notifier.handle(order)
        self.assertEqual(len(self.sent), 1)

    async def test_obsolete_request_is_skipped(self):
        notifier = self.notifier()
        stale_event = pending_order()
        self.orders[('user-alice', 'order-1')] = approved_order()
        await notifier.handle(stale_event)
        self.assertEqual(self.sent, [])
        self.orders.pop(('user-alice', 'order-1'))
        await notifier.handle(approved_order())
        self.assertEqual(self.sent, [])

    async def test_claim_held_elsewhere_defers(self):
        notifier = self.notifier()
        order = self.orders[('user-alice', 'order-1')]
        key = notifications_for(order, now=NOW)[0].key
        await self.redis.set(key, 'sending:other', ex=600)
        await notifier.handle(order)
        self.assertEqual(self.sent, [])
        self.assertIn(key, notifier.retry_tasks)
        await notifier.close()

    async def test_only_send_to(self):
        await self.notifier(only_send_to='qa@example.com').handle(self.orders[('user-alice', 'order-1')])
        self.assertEqual(self.sent, [])
        self.redis = FakeRedis()
        await self.notifier(only_send_to='dana.manager@example.com').handle(self.orders[('user-alice', 'order-1')])
        self.assertEqual([msg['To'] for msg in self.sent], ['dana.manager@example.com'])

    async def test_outcome_after_request_and_no_new_request_on_retry(self):
        notifier = self.notifier()
        await notifier.handle(self.orders[('user-alice', 'order-1')])
        approved = approved_order()
        self.orders[('user-alice', 'order-1')] = approved
        await notifier.handle(approved)
        retried = copy.deepcopy(approved)
        retried['status']['attempts'] = [{'number': 1, 'state': 'CleanedUp'}, {'number': 2, 'state': 'Provisioning'}]
        self.orders[('user-alice', 'order-1')] = retried
        await notifier.handle(retried)
        self.assertEqual([msg['To'] for msg in self.sent], ['dana.manager@example.com', 'alice@example.com'])


if __name__ == '__main__':
    unittest.main()
