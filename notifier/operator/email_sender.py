import asyncio

import aiosmtplib


class EmailSender:
    def __init__(self, smtp_options, timeout=60, retry_delay=5):
        self.smtp_options = smtp_options
        self.timeout = timeout
        self.retry_delay = retry_delay
        # Preserve serialized delivery without sharing SMTP connection state.
        self.lock = asyncio.Lock()

    async def send(self, msg, logger, retries=5):
        for attempt in range(retries + 1):
            try:
                async with self.lock:
                    await self._send_attempt(msg, logger)
                return
            except (aiosmtplib.errors.SMTPException, OSError, asyncio.TimeoutError):
                if attempt == retries:
                    logger.exception(f"Failed sending email to {msg['To']}.")
                    raise
                logger.exception(f"Failed sending email to {msg['To']}, will retry.")
            await asyncio.sleep(self.retry_delay)

    async def _send_attempt(self, msg, logger):
        smtp = aiosmtplib.SMTP(**self.smtp_options)

        async def deliver():
            await smtp.connect()
            await smtp.send_message(msg)

        try:
            # Bound the entire delivery, including any library lock waits.
            await asyncio.wait_for(deliver(), timeout=self.timeout)
            logger.info(f"SMTP server accepted email to {msg['To']}.")
            try:
                await asyncio.wait_for(smtp.quit(), timeout=self.timeout)
            except (aiosmtplib.errors.SMTPException, OSError, asyncio.TimeoutError):
                # Delivery succeeded; retrying because QUIT failed duplicates mail.
                logger.warning("SMTP QUIT failed after delivery; closing connection.")
        finally:
            # Also runs on timeout and cancellation of a scheduled notification.
            smtp.close()
