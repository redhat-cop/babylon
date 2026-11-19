"""Delivery of CatalogItemOrder approval emails with Redis delivery tracking.

Each notification has a key per order UID, event, approval cycle and
recipient. Delivery takes an atomic claim (SET NX with a lease), re-reads the
order and skips notifications that became obsolete (for example an approval
request for an order that was decided, cancelled or expired), sends through
the existing EmailSender, and only then records the key as sent.

A failed send releases the claim, so failures never suppress the email, and
schedules an in-process retry with exponential backoff because a failure
produces no new Kubernetes event. After the last retry the failure is logged
and posted as a warning event; the next watch event (for example after a
restart) tries again. If the process crashes after the SMTP server accepted a
message but before the key is recorded, the message is sent again once the
claim lease expires: delivery is at least once, not exactly once.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from catalog_item_order import notifications_for, still_relevant, subject_for, template_vars

SENT = 'sent'
SKIPPED = 'skipped'

logger = logging.getLogger('catalog_item_order_notifier')


class OrderNotifier:
    def __init__(
        self, *, redis, get_order, get_catalog_item, render_html, html_to_text, send,
        sender, only_send_to=None, post_warning=None, clock=None, get_catalog_namespace_display_name=None,
        claim_lease=600, record_ttl=timedelta(days=35), max_attempts=8, retry_base=60, retry_cap=3600,
    ):
        self.redis = redis
        self.get_order = get_order
        self.get_catalog_item = get_catalog_item
        self.render_html = render_html
        self.html_to_text = html_to_text
        self.send = send
        self.sender = sender
        self.only_send_to = only_send_to
        self.post_warning = post_warning
        self.get_catalog_namespace_display_name = get_catalog_namespace_display_name
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.claim_lease = claim_lease
        self.record_ttl = record_ttl
        self.max_attempts = max_attempts
        self.retry_base = retry_base
        self.retry_cap = retry_cap
        self.retry_tasks = {}

    def recipients(self, recipient):
        """Same ONLY_SEND_TO behavior as the other notifier emails."""
        if self.only_send_to:
            return [self.only_send_to] if recipient == self.only_send_to else []
        return [recipient]

    async def handle(self, order):
        for notification in notifications_for(order, now=self.clock()):
            await self.deliver(notification, order)

    async def deliver(self, notification, order):
        key = notification.key
        state = await self.redis.get(key)
        if state in (SENT, SKIPPED):
            return
        claimed = await self.redis.set(
            key, f"sending:{self.clock().isoformat()}", nx=True, ex=self.claim_lease,
        )
        if not claimed:
            # Another delivery holds the claim; check again once it lapses.
            ttl = await self.redis.ttl(key)
            if ttl and ttl > 0:
                self.schedule_retry(notification, order, ttl + 1)
            return

        metadata = order['metadata']
        try:
            fresh = await self.get_order(metadata['namespace'], metadata['name'])
            if fresh is None or fresh['metadata'].get('uid') != metadata['uid'] or not still_relevant(notification, fresh):
                await self.redis.set(key, SKIPPED, ex=self.record_ttl)
                logger.info("Skipping obsolete %s notification for %s/%s", notification.event, metadata['namespace'], metadata['name'])
                return
            to = self.recipients(notification.recipient)
            if not to:
                await self.redis.set(key, SKIPPED, ex=self.record_ttl)
                return
            catalog_reference = fresh['spec'].get('catalogItem') or {}
            catalog_item = await self.get_catalog_item(catalog_reference.get('namespace'), catalog_reference.get('name'))
            namespace_display_name = None
            if self.get_catalog_namespace_display_name:
                namespace_display_name = await self.get_catalog_namespace_display_name(catalog_reference.get('namespace'))
            await self.send(self.build_message(notification, fresh, catalog_item, to, namespace_display_name))
        except Exception as exception:
            await self.redis.delete(key)
            await self.record_failure(notification, order, exception)
            return
        await self.redis.set(key, SENT, ex=self.record_ttl)
        await self.redis.delete(f"{key}/attempts")
        logger.info("Sent %s notification for %s/%s", notification.event, metadata['namespace'], metadata['name'])

    def build_message(self, notification, order, catalog_item, to, catalog_namespace_display_name=None):
        variables = template_vars(notification, order, catalog_item, catalog_namespace_display_name)
        html = self.render_html(notification.template, variables)
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject_for(notification, variables)
        msg['From'] = self.sender
        msg['To'] = ', '.join(to)
        msg.attach(MIMEText(self.html_to_text(html), 'plain'))
        msg.attach(MIMEText(html, 'html'))
        return msg

    async def record_failure(self, notification, order, exception):
        attempts_key = f"{notification.key}/attempts"
        attempts = await self.redis.incr(attempts_key)
        await self.redis.expire(attempts_key, self.record_ttl)
        metadata = order['metadata']
        if attempts < self.max_attempts:
            delay = min(self.retry_base * 2 ** (attempts - 1), self.retry_cap)
            logger.warning(
                "Failed sending %s notification for %s/%s (attempt %d), retrying in %ss: %s",
                notification.event, metadata['namespace'], metadata['name'], attempts, delay, exception,
            )
            self.schedule_retry(notification, order, delay)
            return
        await self.redis.delete(attempts_key)
        message = (
            f"Failed sending {notification.event} email after {attempts} attempts; "
            "it will be retried on the next order event"
        )
        logger.error("%s for %s/%s: %s", message, metadata['namespace'], metadata['name'], exception)
        if self.post_warning:
            try:
                self.post_warning(order, 'ApprovalNotificationFailed', message)
            except Exception:
                logger.exception("Failed posting notification warning event")

    def schedule_retry(self, notification, order, delay):
        if notification.key in self.retry_tasks:
            return

        async def retry():
            try:
                await asyncio.sleep(delay)
            finally:
                # Unregister before delivering so a new failure can reschedule.
                self.retry_tasks.pop(notification.key, None)
            await self.deliver(notification, order)

        self.retry_tasks[notification.key] = asyncio.create_task(retry())

    async def close(self):
        for task in list(self.retry_tasks.values()):
            task.cancel()
        for task in list(self.retry_tasks.values()):
            try:
                await task
            except asyncio.CancelledError:
                pass
