import base64
import json
import logging

import aiohttp

from kopfobject import KopfObject
from operatorruntime import OperatorRuntime

logger = logging.getLogger(__name__)


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
    def fully_notified(self):
        return self.provision_notified and self.provision_failed_notified

    async def check_and_notify(self, logger):
        if not OperatorRuntime.jira_api_token or not OperatorRuntime.jira_user_email:
            return

        # Re-fetch self to pick up any annotation changes from a prior cycle
        await self.refresh()

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
            await self._jira_comment(credentials, "\n".join(lines))
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
            await self._jira_comment(credentials, "\n".join(lines))
            await self._jira_add_label(credentials, "whiteglove-provisioned")
            await self.merge_patch({
                "metadata": {"annotations": {f"{OperatorRuntime.demo_domain}/provision-notified": "true"}}
            })
            logger.info("WGR %s/%s: posted provision-ready JSM comment", self.namespace, self.name)

    async def _jira_comment(self, credentials, text):
        url = f"{OperatorRuntime.jira_base_url}/rest/api/3/issue/{self.jira_ticket_id}/comment"
        payload = {
            "body": {
                "version": 1,
                "type": "doc",
                "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}],
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
