"""Kubernetes access for CatalogItemOrder, used by the catalog API and the
CatalogItemOrder controller. Tests replace this with an in-memory fake."""

import kubernetes_asyncio

from catalog_item_order import API_GROUP, API_VERSION, PLURAL
from catalog_item_order_adapters import resource_kind


class KubeError(Exception):
    def __init__(self, status, message=''):
        super().__init__(message or f"Kubernetes API error {status}")
        self.status = status


class KubeConflictError(KubeError):
    """resourceVersion precondition failed or object already exists."""


def _wrap(exception):
    if exception.status == 409:
        return KubeConflictError(409, exception.reason or 'Conflict')
    return KubeError(exception.status or 0, exception.reason or '')


class KubeOrderClient:
    def __init__(self, api_client, babylon_namespace=None, system_status_configmap='babylon-system-status'):
        self.api_client = api_client
        self.custom_objects_api = kubernetes_asyncio.client.CustomObjectsApi(api_client)
        self.core_v1_api = kubernetes_asyncio.client.CoreV1Api(api_client)
        self.authorization_api = kubernetes_asyncio.client.AuthorizationV1Api(api_client)
        self.babylon_namespace = babylon_namespace
        self.system_status_configmap = system_status_configmap

    async def _get(self, group, version, plural, namespace, name):
        try:
            return await self.custom_objects_api.get_namespaced_custom_object(
                group=group, version=version, plural=plural, namespace=namespace, name=name,
            )
        except kubernetes_asyncio.client.exceptions.ApiException as exception:
            if exception.status == 404:
                return None
            raise _wrap(exception) from exception

    async def create_order(self, body):
        try:
            return await self.custom_objects_api.create_namespaced_custom_object(
                group=API_GROUP, version=API_VERSION, plural=PLURAL,
                namespace=body['metadata']['namespace'], body=body,
            )
        except kubernetes_asyncio.client.exceptions.ApiException as exception:
            raise _wrap(exception) from exception

    async def get_order(self, namespace, name):
        return await self._get(API_GROUP, API_VERSION, PLURAL, namespace, name)

    async def list_orders(self, namespace=None, label_selector=None):
        kwargs = {'group': API_GROUP, 'version': API_VERSION, 'plural': PLURAL}
        if label_selector:
            kwargs['label_selector'] = label_selector
        items = []
        try:
            while True:
                if namespace:
                    response = await self.custom_objects_api.list_namespaced_custom_object(
                        namespace=namespace, **kwargs,
                    )
                else:
                    response = await self.custom_objects_api.list_cluster_custom_object(**kwargs)
                items.extend(response.get('items', []))
                continue_token = (response.get('metadata') or {}).get('continue')
                if not continue_token:
                    return items
                kwargs['_continue'] = continue_token
        except kubernetes_asyncio.client.exceptions.ApiException as exception:
            raise _wrap(exception) from exception

    async def replace_order_status(self, order, status):
        """Replace status with a resourceVersion precondition (compare-and-swap)."""
        body = {
            'apiVersion': order['apiVersion'],
            'kind': order['kind'],
            'metadata': {
                'name': order['metadata']['name'],
                'namespace': order['metadata']['namespace'],
                'resourceVersion': order['metadata']['resourceVersion'],
            },
            'spec': order['spec'],
            'status': status,
        }
        try:
            return await self.custom_objects_api.replace_namespaced_custom_object_status(
                group=API_GROUP, version=API_VERSION, plural=PLURAL,
                namespace=order['metadata']['namespace'], name=order['metadata']['name'],
                body=body,
            )
        except kubernetes_asyncio.client.exceptions.ApiException as exception:
            raise _wrap(exception) from exception

    async def get_catalog_item(self, namespace, name):
        return await self._get(API_GROUP, 'v1', 'catalogitems', namespace, name)

    async def get_resource(self, ref):
        kind = resource_kind(ref)
        return await self._get(kind.api_group, kind.version, kind.plural, ref['namespace'], ref['name'])

    async def create_resource(self, ref, body):
        kind = resource_kind(ref)
        try:
            return await self.custom_objects_api.create_namespaced_custom_object(
                group=kind.api_group, version=kind.version, plural=kind.plural,
                namespace=ref['namespace'], body=body,
            )
        except kubernetes_asyncio.client.exceptions.ApiException as exception:
            raise _wrap(exception) from exception

    async def delete_resource(self, ref):
        """Delete a resource; with a recorded uid, only that exact object.

        Returns False if the object is gone or was replaced by another object."""
        kind = resource_kind(ref)
        kwargs = {}
        if ref.get('uid'):
            kwargs['body'] = {'preconditions': {'uid': ref['uid']}}
        try:
            await self.custom_objects_api.delete_namespaced_custom_object(
                group=kind.api_group, version=kind.version, plural=kind.plural,
                namespace=ref['namespace'], name=ref['name'], **kwargs,
            )
        except kubernetes_asyncio.client.exceptions.ApiException as exception:
            if exception.status in (404, 409):
                return False
            raise _wrap(exception) from exception
        return True

    async def get_system_status(self):
        """Ordering block flags from the system status ConfigMap.

        Unlike the UI status endpoint, read errors are raised so that dispatch
        never proceeds on an unknown ordering state. A missing ConfigMap means
        ordering is not blocked, as in the catalog API."""
        try:
            configmap = await self.core_v1_api.read_namespaced_config_map(
                name=self.system_status_configmap, namespace=self.babylon_namespace,
            )
        except kubernetes_asyncio.client.exceptions.ApiException as exception:
            if exception.status == 404:
                return {}
            raise _wrap(exception) from exception
        data = configmap.data or {}
        return {
            'services_ordering_blocked': data.get('services_ordering_blocked', 'false').lower() == 'true',
            'services_ordering_blocked_message': data.get('services_ordering_blocked_message', ''),
            'workshops_ordering_blocked': data.get('workshops_ordering_blocked', 'false').lower() == 'true',
            'workshops_ordering_blocked_message': data.get('workshops_ordering_blocked_message', ''),
        }

    async def get_user_groups(self, user):
        try:
            group_list = await self.custom_objects_api.list_cluster_custom_object(
                group='user.openshift.io', version='v1', plural='groups',
            )
        except kubernetes_asyncio.client.exceptions.ApiException as exception:
            raise _wrap(exception) from exception
        return [
            group['metadata']['name'] for group in group_list.get('items', [])
            if user in (group.get('users') or [])
        ]

    async def check_access(self, user, groups, group, resource, verb, namespace=None):
        """SubjectAccessReview for the requester, evaluated at dispatch."""
        attributes = {'group': group, 'resource': resource, 'verb': verb}
        if namespace:
            attributes['namespace'] = namespace
        try:
            review = await self.authorization_api.create_subject_access_review(
                body={
                    'apiVersion': 'authorization.k8s.io/v1',
                    'kind': 'SubjectAccessReview',
                    'spec': {'user': user, 'groups': groups, 'resourceAttributes': attributes},
                }
            )
        except kubernetes_asyncio.client.exceptions.ApiException as exception:
            raise _wrap(exception) from exception
        return bool(review.status and review.status.allowed)
