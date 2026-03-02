from kubernetes_asyncio.client import ApiException as k8sApiException

from k8sobject import K8sObject

class UserNamespace(K8sObject):
    api_group = 'usernamespace.gpte.redhat.com'
    api_version = 'v1'
    kind = 'UserNamespace'
    plural = 'usernamespaces'

    @classmethod
    async def get_for_user(cls, user):
        """Return user namespace for user."""
        async for user_namespace in cls.list(
            label_selector=f"usernamespace.gpte.redhat.com/user-uid={user.uid}"
        ):
            return user_namespace
        return None
