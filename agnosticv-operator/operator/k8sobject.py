from datetime import datetime

import kubernetes_asyncio
from babylon import Babylon

class K8sObject():
    @classmethod
    async def list(cls, batch_limit=20, namespace=None, label_selector=None):
        _continue = None
        while True:
            if namespace:
                obj_list = await Babylon.custom_objects_api.list_namespaced_custom_object(
                    group = cls.api_group,
                    label_selector = label_selector,
                    namespace = namespace,
                    plural = cls.plural,
                    version = cls.api_version,
                    limit = batch_limit,
                    _continue = _continue
                )
            else:
                obj_list = await Babylon.custom_objects_api.list_cluster_custom_object(
                    group = cls.api_group,
                    label_selector = label_selector,
                    plural = cls.plural,
                    version = cls.api_version,
                    limit = batch_limit,
                    _continue = _continue
                )
            for definition in obj_list.get('items', []):
                yield cls(definition=definition)
            _continue = obj_list['metadata'].get('continue')
            if not _continue:
                return

    def __init__(self, definition):
        self.definition = definition

    def __str__(self):
        if self.namespace:
            return f"{self.kind} {self.name} in {self.namespace}"
        else:
            return f"{self.kind} {self.name}"

    @property
    def annotations(self):
        return self.metadata.get('annotations', {})

    @property
    def api_group_version(self):
        return f"{self.api_group}/{self.api_version}"

    @property
    def creation_datetime(self):
        return datetime.strptime(
            self.creation_timestamp, '%Y-%m-%dT%H:%M:%SZ'
        ).replace(tzinfo=timezone.utc)

    @property
    def creation_timestamp(self):
        return self.metadata['creationTimestamp']

    @property
    def deletion_timestamp(self):
        return self.metadata.get('deletionTimestamp')

    @property
    def labels(self):
        return self.metadata.get('labels', {})

    @property
    def metadata(self):
        return self.definition['metadata']

    @property
    def name(self):
        return self.metadata['name']

    @property
    def namespace(self):
        return self.metadata.get('namespace')

    @property
    def spec(self):
        return self.definition.get('spec', {})

    @property
    def status(self):
        return self.definition.get('status', {})

    @property
    def uid(self):
        return self.metadata['uid']

    async def delete(self):
        try:
            if self.namespace:
                definition = await Babylon.custom_objects_api.delete_namespaced_custom_object(
                    group = self.api_group,
                    name = self.name,
                    namespace = self.namespace,
                    plural = self.plural,
                    version = self.api_version,
                )
            else:
                definition = await Babylon.custom_objects_api.delete_cluster_custom_object(
                    group = self.api_group,
                    name = self.name,
                    plural = self.plural,
                    version = self.api_version,
                )
            self.definition = definition
        except kubernetes_asyncio.client.rest.ApiException as exception:
            if exception.status != 404:
                raise

    async def json_patch(self, patch):
        if self.namespace:
            definition = await Babylon.custom_objects_api.patch_namespaced_custom_object(
                group = self.api_group,
                name = self.name,
                namespace = self.namespace,
                plural = self.plural,
                version = self.api_version,
                body = patch,
                _content_type = 'application/json-patch+json',
            )
        else:
            definition = await Babylon.custom_objects_api.patch_cluster_custom_object(
                group = self.api_group,
                name = self.name,
                plural = self.plural,
                version = self.api_version,
                body = patch,
                _content_type = 'application/json-patch+json',
            )
        self.definition = definition

    async def merge_patch(self, patch):
        if self.namespace:
            definition = await Babylon.custom_objects_api.patch_namespaced_custom_object(
                group = self.api_group,
                name = self.name,
                namespace = self.namespace,
                plural = self.plural,
                version = self.api_version,
                body = patch,
                _content_type = 'application/merge-patch+json',
            )
        else:
            definition = await Babylon.custom_objects_api.patch_cluster_custom_object(
                group = self.api_group,
                name = self.name,
                plural = self.plural,
                version = self.api_version,
                body = patch,
                _content_type = 'application/merge-patch+json',
            )
        self.definition = definition

    async def merge_patch_status(self, patch):
        if self.namespace:
            definition = await Babylon.custom_objects_api.patch_namespaced_custom_object_status(
                group = self.api_group,
                name = self.name,
                namespace = self.namespace,
                plural = self.plural,
                version = self.api_version,
                body = {"status": patch},
                _content_type = 'application/merge-patch+json',
            )
        else:
            definition = await Babylon.custom_objects_api.patch_cluster_custom_object_status(
                group = self.api_group,
                name = self.name,
                plural = self.plural,
                version = self.api_version,
                body = {"status": patch},
                _content_type = 'application/merge-patch+json',
            )
        self.definition = definition
