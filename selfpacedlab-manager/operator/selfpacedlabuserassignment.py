import kopf
from kubernetes_asyncio.client.exceptions import ApiException as k8sApiException

from babylon import Babylon
from cachedkopfobject import CachedKopfObject
from labuserinterface import LabUserInterface

import selfpacedlab as selfpacedlab_import


class SelfPacedLabUserAssignment(CachedKopfObject):
    api_group = Babylon.babylon_domain
    api_version = Babylon.babylon_api_version
    kind = 'SelfPacedLabUserAssignment'
    plural = 'selfpacedlabuserassignments'

    cache = {}

    @classmethod
    def cache_key_from_kwargs(cls, namespace, spec, **kwargs):
        return (
            namespace,
            spec['selfPacedLabName'],
            spec.get('resourceClaimName'),
            spec.get('userName'),
        )

    @classmethod
    async def delete_for_resource_claim(cls, namespace, resource_claim_name, logger):
        async for selfpacedlab_user_assignment in cls.list(
            label_selector=f"{Babylon.resource_claim_label}={resource_claim_name}",
            namespace=namespace,
        ):
            await selfpacedlab_user_assignment.delete()

    @classmethod
    async def find(
        cls, namespace, selfpacedlab_name, resource_claim_name=None, user_name=None
    ):
        cache_key = (namespace, selfpacedlab_name, resource_claim_name, user_name)
        obj = cls.cache.get(cache_key)
        if obj:
            return obj

        label_selector = f"{Babylon.selfpacedlab_label}={selfpacedlab_name}"
        if resource_claim_name:
            label_selector += f",{Babylon.resource_claim_label}={resource_claim_name}"
        else:
            label_selector += f",!{Babylon.resource_claim_label}"
        if user_name:
            label_selector += f",{Babylon.user_name_label}={user_name}"
        else:
            label_selector += f",!{Babylon.user_name_label}"
        obj_list = await Babylon.custom_objects_api.list_namespaced_custom_object(
            group=cls.api_group,
            namespace=namespace,
            plural=cls.plural,
            version=cls.api_version,
            label_selector=label_selector,
        )
        items = obj_list.get('items', [])
        if not items:
            return None

        obj = cls.from_definition(items[0])
        cls.cache[cache_key] = obj
        return obj

    @classmethod
    async def create(
        cls,
        namespace,
        resource_claim,
        selfpacedlab_name,
        selfpacedlab_id,
        assignment=None,
        data={},
        lab_user_interface=None,
        messages=None,
        user_name=None,
    ):
        definition = {
            "apiVersion": f"{cls.api_group}/{cls.api_version}",
            "kind": cls.kind,
            "metadata": {
                "generateName": f"{selfpacedlab_name}-",
                "labels": {
                    Babylon.selfpacedlab_id_label: selfpacedlab_id,
                    Babylon.selfpacedlab_label: selfpacedlab_name,
                    Babylon.resource_claim_label: resource_claim.name,
                },
                "ownerReferences": [resource_claim.as_owner_ref()],
            },
            "spec": {
                "data": data,
                "resourceClaimName": resource_claim.name,
                "selfPacedLabName": selfpacedlab_name,
            },
        }
        if assignment:
            definition['spec']['assignment'] = assignment
        if lab_user_interface:
            definition['spec']['labUserInterface'] = lab_user_interface.serialize()
        if messages:
            definition['spec']['messages'] = messages
        if user_name:
            definition['metadata']['labels'][Babylon.user_name_label] = user_name
            definition['spec']['userName'] = user_name

        definition = await Babylon.custom_objects_api.create_namespaced_custom_object(
            group=cls.api_group,
            namespace=namespace,
            plural=cls.plural,
            version=cls.api_version,
            body=definition,
        )
        obj = cls.from_definition(definition)
        cls.cache[obj.cache_key] = obj
        return obj

    @property
    def assignment(self):
        return self.spec.get('assignment')

    @property
    def cache_key(self):
        return (
            self.namespace,
            self.selfpacedlab_name,
            self.resource_claim_name,
            self.user_name,
        )

    @property
    def data(self):
        return self.spec.get('data', {})

    @property
    def ignore(self):
        return Babylon.babylon_ignore_label in self.labels

    @property
    def lab_user_interface(self):
        if 'labUserInterface' in self.spec:
            return LabUserInterface(definition=self.spec['labUserInterface'])

    @property
    def messages(self):
        return self.spec.get('messages')

    @property
    def resource_claim_name(self):
        return self.spec.get('resourceClaimName')

    @property
    def user_name(self):
        return self.spec.get('userName')

    @property
    def selfpacedlab_name(self):
        return self.spec.get('selfPacedLabName')

    async def copy_to_selfpacedlab(self):
        try:
            selfpacedlab = await self.get_selfpacedlab()
        except k8sApiException as exception:
            if exception.status == 404:
                raise kopf.TemporaryError(
                    f"SelfPacedLab {self.selfpacedlab_name} was not found.", delay=60
                )
            raise

        async with selfpacedlab.lock:
            await selfpacedlab.merge_patch_status(
                {
                    "userAssignments": {
                        self.name: {
                            "assignment": self.assignment,
                            "resourceClaimName": self.resource_claim_name,
                            "userName": self.user_name,
                        }
                    }
                }
            )

    async def get_selfpacedlab(self):
        return await selfpacedlab_import.SelfPacedLab.get(
            name=self.selfpacedlab_name, namespace=self.namespace
        )

    async def handle_create(self, logger):
        async with self.lock:
            logger.info(f"Handling create for {self}")
            await self.copy_to_selfpacedlab()

    async def handle_delete(self, logger):
        async with self.lock:
            logger.info(f"Handling delete for {self}")
            await self.remove_from_selfpacedlab()

    async def handle_update(self, logger):
        async with self.lock:
            logger.info(f"Handling update for {self}")
            await self.copy_to_selfpacedlab()

    async def remove_from_selfpacedlab(self):
        try:
            selfpacedlab = await self.get_selfpacedlab()
            async with selfpacedlab.lock:
                await selfpacedlab.merge_patch_status(
                    {"userAssignments": {self.name: None}}
                )
        except k8sApiException as exception:
            if exception.status != 404:
                raise
