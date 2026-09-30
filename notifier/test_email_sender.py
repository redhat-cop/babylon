import asyncio
import sys
import unittest
from email.message import EmailMessage
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

import aiosmtplib

sys.path.insert(0, str(Path(__file__).parent / 'operator'))
from email_sender import EmailSender


class EmailSenderTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.sender = EmailSender({'hostname': 'smtp.example.test'}, timeout=0.1, retry_delay=0)
        self.msg = EmailMessage()
        self.msg['To'] = 'recipient@example.test'
        self.logger = Mock()

    def client(self):
        return Mock(
            connect=AsyncMock(),
            send_message=AsyncMock(),
            quit=AsyncMock(),
            close=Mock(),
        )

    async def test_failed_send_closes_connection_before_retry_with_fresh_client(self):
        failed, healthy = self.client(), self.client()
        failed.send_message.side_effect = aiosmtplib.errors.SMTPException('Recipient refused')

        def create_client(**kwargs):
            if not failed.connect.called:
                return failed
            failed.close.assert_called_once()
            return healthy

        with patch('email_sender.aiosmtplib.SMTP', side_effect=create_client):
            await self.sender.send(self.msg, self.logger, retries=1)

        failed.quit.assert_not_awaited()
        healthy.send_message.assert_awaited_once_with(self.msg)
        healthy.close.assert_called_once()

    async def test_timeout_releases_delivery_lock_for_next_email(self):
        stalled, healthy = self.client(), self.client()
        stalled.connect.side_effect = asyncio.Event().wait
        with patch('email_sender.aiosmtplib.SMTP', side_effect=[stalled, healthy]):
            first = asyncio.create_task(self.sender.send(self.msg, self.logger, retries=0))
            second = asyncio.create_task(self.sender.send(self.msg, self.logger, retries=0))
            with self.assertRaises(asyncio.TimeoutError):
                await asyncio.wait_for(first, timeout=1)
            await asyncio.wait_for(second, timeout=1)

        stalled.close.assert_called_once()
        healthy.send_message.assert_awaited_once()

    async def test_cancelled_send_closes_connection_and_allows_next_email(self):
        cancelled, healthy = self.client(), self.client()
        started = asyncio.Event()

        async def stall(msg):
            started.set()
            await asyncio.Event().wait()

        cancelled.send_message.side_effect = stall
        with patch('email_sender.aiosmtplib.SMTP', side_effect=[cancelled, healthy]):
            task = asyncio.create_task(self.sender.send(self.msg, self.logger))
            await asyncio.wait_for(started.wait(), timeout=1)
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
            await asyncio.wait_for(self.sender.send(self.msg, self.logger), timeout=1)

        cancelled.close.assert_called_once()
        healthy.send_message.assert_awaited_once()

    async def test_quit_failure_does_not_resend_accepted_email(self):
        client = self.client()
        client.quit.side_effect = aiosmtplib.errors.SMTPException('QUIT refused')
        with patch('email_sender.aiosmtplib.SMTP', return_value=client) as factory:
            await self.sender.send(self.msg, self.logger)

        factory.assert_called_once()
        client.send_message.assert_awaited_once()
        client.close.assert_called_once()

    async def test_quit_timeout_does_not_resend_accepted_email(self):
        client = self.client()
        client.quit.side_effect = asyncio.Event().wait
        with patch('email_sender.aiosmtplib.SMTP', return_value=client) as factory:
            await asyncio.wait_for(self.sender.send(self.msg, self.logger), timeout=1)

        factory.assert_called_once()
        client.send_message.assert_awaited_once()
        client.close.assert_called_once()

    async def test_exhausted_retries_raise_and_close_every_connection(self):
        clients = [self.client(), self.client()]
        for client in clients:
            client.connect.side_effect = OSError('Connection failed')
        with patch('email_sender.aiosmtplib.SMTP', side_effect=clients) as factory:
            with self.assertRaises(OSError):
                await self.sender.send(self.msg, self.logger, retries=1)

        self.assertEqual(factory.call_count, 2)
        for client in clients:
            client.close.assert_called_once()


if __name__ == '__main__':
    unittest.main()
