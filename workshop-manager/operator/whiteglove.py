import base64
import json
import logging
from datetime import datetime, timedelta, timezone

import aiohttp
import kubernetes_asyncio

from kopfobject import KopfObject
from operatorruntime import OperatorRuntime

logger = logging.getLogger(__name__)


def parse_event_end_date(value):
    """Parse spec.eventEndDate (ISO 8601, as written by the UI) into an aware UTC datetime.

    Returns None when the value is missing or unparseable.
    """
    if not value or not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def is_retention_expired(event_end_date, now, retention_days):
    """True when the event ended at least retention_days before now."""
    end = parse_event_end_date(event_end_date)
    if end is None:
        return False
    return now >= end + timedelta(days=retention_days)


class WhiteGloveRequest(KopfObject):
    api_group = OperatorRuntime.babylon_domain
    api_version = 'v1'
    kind = 'WhiteGloveRequest'
    plural = 'whitegloverequests'

    @classmethod
    def load(cls, name, namespace, annotations, labels, meta, spec, status, uid, **_):
        return cls(
            annotations=annotations,
            labels=labels,
            meta=meta,
            name=name,
            namespace=namespace,
            spec=spec,
            status=status or {},
            uid=uid,
        )

    # Annotations written by the catalog UI when a service is linked
    @property
    def jira_ticket_id(self):
        return self.annotations.get(f"{OperatorRuntime.demo_domain}/jira-ticket-id")

    @property
    def service_type(self):
        return self.annotations.get(f"{OperatorRuntime.demo_domain}/service-type")

    @property
    def service_namespace(self):
        return self.annotations.get(f"{OperatorRuntime.demo_domain}/service-namespace")

    @property
    def service_name(self):
        return self.annotations.get(f"{OperatorRuntime.demo_domain}/service-name")

    @property
    def provision_notified(self):
        return self.annotations.get(f"{OperatorRuntime.demo_domain}/provision-notified") == 'true'

    @property
    def provision_failed_notified(self):
        return self.annotations.get(f"{OperatorRuntime.demo_domain}/provision-failed-notified") == 'true'

    @property
    def is_linked_workshop(self):
        return (
            self.service_type == 'workshops'
            and bool(self.service_namespace)
            and bool(self.service_name)
            and bool(self.jira_ticket_id)
        )

    @property
    def event_end_date(self):
        return self.spec.get('eventEndDate')

    def _linked_service_api(self):
        """(group, version, plural) for the linked service type, or None if unknown."""
        if self.service_type == 'workshops':
            return (OperatorRuntime.babylon_domain, OperatorRuntime.babylon_api_version, 'workshops')
        if self.service_type == 'selfpacedlabs':
            return (OperatorRuntime.babylon_domain, OperatorRuntime.babylon_api_version, 'selfpacedlabs')
        if self.service_type == 'services':
            return (OperatorRuntime.poolboy_domain, OperatorRuntime.poolboy_api_version, 'resourceclaims')
        return None

    async def linked_service_exists(self):
        """Whether the linked service still exists.

        Returns False when no service is linked. Unknown service types are treated
        as existing, so we never delete a WGR we can't verify.
        """
        if not self.service_namespace or not self.service_name:
            return False
        api = self._linked_service_api()
        if api is None:
            return True
        group, version, plural = api
        try:
            await OperatorRuntime.custom_objects_api.get_namespaced_custom_object(
                group=group,
                version=version,
                namespace=self.service_namespace,
                plural=plural,
                name=self.service_name,
            )
        except kubernetes_asyncio.client.rest.ApiException as exc:
            if exc.status == 404:
                return False
            raise
        return True

    async def check_and_cleanup(self, logger, retention_days, now=None):
        """Delete this WGR if the event ended over retention_days ago and the linked service is gone.

        Returns True if the WGR was deleted.
        """
        if self.is_deleting:
            return False
        now = now or datetime.now(timezone.utc)
        if not is_retention_expired(self.event_end_date, now, retention_days):
            return False
        if await self.linked_service_exists():
            return False
        await self.delete()
        logger.info(
            "WGR %s/%s: deleted, event ended %s (> %d days ago) and linked %s %s/%s no longer exists",
            self.namespace, self.name, self.event_end_date, retention_days,
            self.service_type or 'service', self.service_namespace, self.service_name,
        )
        return True

    async def check_and_notify(self, logger):
        if not OperatorRuntime.jira_api_token or not OperatorRuntime.jira_user_email:
            return

        if self.provision_notified and self.provision_failed_notified:
            return

        try:
            workshop = await OperatorRuntime.custom_objects_api.get_namespaced_custom_object(
                group=self.api_group,
                version=self.api_version,
                namespace=self.service_namespace,
                plural='workshops',
                name=self.service_name,
            )
            provision_list = await OperatorRuntime.custom_objects_api.list_namespaced_custom_object(
                group=self.api_group,
                version=self.api_version,
                namespace=self.service_namespace,
                plural='workshopprovisions',
                label_selector=f"{OperatorRuntime.workshop_label}={self.service_name}",
            )
        except Exception as exc:
            logger.debug("WGR %s/%s: skipping provision check: %s", self.namespace, self.name, exc)
            return

        provisions = provision_list.get('items', [])
        if not provisions:
            return

        desired = sum(p.get('spec', {}).get('count', 0) for p in provisions)
        active = sum(p.get('status', {}).get('activeCount', 0) for p in provisions)
        failed = sum(p.get('status', {}).get('failedCount', 0) for p in provisions)

        credentials = base64.b64encode(
            f"{OperatorRuntime.jira_user_email}:{OperatorRuntime.jira_api_token}".encode()
        ).decode()

        if failed > 0 and not self.provision_failed_notified:
            lines = [
                f"Provisioning issue: {failed} of {desired} seats failed.",
                f"Ops view: {OperatorRuntime.workshop_base_url}/workshops/{self.service_namespace}/{self.service_name}",
                f"Namespace: {OperatorRuntime.workshop_base_url}/services/{self.service_namespace}",
                "Please investigate — affected attendees may need manual recovery.",
            ]
            await self._jira_comment(credentials, lines)
            await self._jira_add_label(credentials, "whiteglove-provision-failed")
            await self.merge_patch({
                "metadata": {"annotations": {f"{OperatorRuntime.demo_domain}/provision-failed-notified": "true"}}
            })
            logger.info("WGR %s/%s: posted provision-failed JSM comment", self.namespace, self.name)

        elif desired > 0 and active >= desired and failed == 0 and not self.provision_notified:
            workshop_id = workshop.get('metadata', {}).get('labels', {}).get(
                f"{OperatorRuntime.babylon_domain}/workshop-id"
            )
            lines = ["Workshop provisioned and ready."]
            if workshop_id:
                lines.append(f"Workshop URL: {OperatorRuntime.workshop_base_url}/workshop/{workshop_id}")
            lines.append(f"Namespace: {OperatorRuntime.workshop_base_url}/services/{self.service_namespace}")
            lines.append(f"Seats: {active} ready")
            stop = workshop.get('spec', {}).get('actionSchedule', {}).get('stop')
            destroy = workshop.get('spec', {}).get('lifespan', {}).get('end')
            if stop:
                lines.append(f"Auto-stop: {stop}")
            if destroy:
                lines.append(f"Auto-destroy: {destroy}")
            lines.append("Password: check your workshop welcome email.")
            await self._jira_comment(credentials, lines)
            await self._jira_add_label(credentials, "whiteglove-provisioned")
            await self.merge_patch({
                "metadata": {"annotations": {f"{OperatorRuntime.demo_domain}/provision-notified": "true"}}
            })
            logger.info("WGR %s/%s: posted provision-ready JSM comment", self.namespace, self.name)

    async def _jira_comment(self, credentials, lines):
        """Post a multi-line JSM comment; one ADF paragraph per line so newlines render."""
        url = f"{OperatorRuntime.jira_base_url}/rest/api/3/issue/{self.jira_ticket_id}/comment"
        payload = {
            "body": {
                "version": 1,
                "type": "doc",
                "content": [
                    {"type": "paragraph", "content": [{"type": "text", "text": line}]}
                    for line in lines
                ],
            }
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                headers={"Authorization": f"Basic {credentials}", "Content-Type": "application/json"},
                data=json.dumps(payload),
            ) as resp:
                if not resp.ok:
                    logger.warning("Jira comment POST returned %s for %s", resp.status, self.jira_ticket_id)

    async def _jira_add_label(self, credentials, label):
        url = f"{OperatorRuntime.jira_base_url}/rest/api/3/issue/{self.jira_ticket_id}"
        payload = {"update": {"labels": [{"add": label}]}}
        async with aiohttp.ClientSession() as session:
            async with session.put(
                url,
                headers={"Authorization": f"Basic {credentials}", "Content-Type": "application/json"},
                data=json.dumps(payload),
            ) as resp:
                if not resp.ok:
                    logger.warning("Jira label PUT returned %s for %s", resp.status, self.jira_ticket_id)
