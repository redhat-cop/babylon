from kubernetes_asyncio.client import ApiException as KubernetesApiException

class BabylonApiException(Exception):
    def __init__(self,
        status:int|None=None,
        reason:str|None=None,
        kubernetes_api_exception:KubernetesApiException|None=None,
    ):
        if kubernetes_api_exception is not None:
            if reason is None:
                reason = kubernetes_api_exception.reason
            if status is None:
                status = kubernetes_api_exception.status
        self.kubernetes_api_exception = kubernetes_api_exception
        self.reason = reason
        self.status = status

    def __str__(self):
        error_message = f"({self.status})\nReason: {self.reason}\n"

        if self.kubernetes_api_exception is not None:
            if self.kubernetes_api_exception.headers:
                error_message += "HTTP response headers: {0}\n".format(
                    self.headers)

            if self.kubernetes_api_exception.body:
                error_message += "HTTP response body: {0}\n".format(self.kubernetes_api_exception.body)

        return error_message
