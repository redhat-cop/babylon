#!/usr/bin/env python3

import kubernetes_asyncio
import re
import urllib3

import six
from six.moves.urllib.parse import quote
from urllib3.connection import HTTPHeaderDict
from kubernetes_asyncio.client.exceptions import ApiException

def urllib3_hotfix_request_encode_body(
    self,
    method,
    url,
    fields=None,
    headers=None,
    encode_multipart=True,
    multipart_boundary=None,
    **urlopen_kw
):
    """
    Hotfix to preseve multi-value headers.
    """
    if headers is None:
        headers = self.headers

    extra_kw = {"headers": headers}

    if fields:
        if "body" in urlopen_kw:
            raise TypeError(
                "request got values for both 'fields' and 'body', can only specify one."
            )

        if encode_multipart:
            body, content_type = encode_multipart_formdata(
                fields, boundary=multipart_boundary
            )
        else:
            body, content_type = (
                urlencode(fields),
                "application/x-www-form-urlencoded",
            )

        extra_kw["body"] = body
        if "Content-Type" not in headers:
            headers = {"Content-Type": content_type}

    extra_kw.update(urlopen_kw)
    return self.urlopen(method, url, **extra_kw)

class HotfixKubeApiClient(kubernetes_asyncio.client.ApiClient):
    """
    Kubernetes API client with fixed support for multiple Impersonate-Group header values.
    """
    def __init__(self, **kwargs):
        """
        After init, apply hotfix to urllib3 request_encode_mody method
        """
        super().__init__(**kwargs)

        # Apply urllib3 request_encode_body hotfix
        pool_manager = self.rest_client.pool_manager
        pool_manager.request_encode_body = urllib3_hotfix_request_encode_body.__get__(
            pool_manager, pool_manager.__class__
        )

        # Change default headers to HTTPHeaderDict
        self.default_headers = HTTPHeaderDict(self.default_headers)

    @classmethod
    def sanitize_for_serialization(cls, obj):
        """
        Override of sanitize_for_serialization with support for HTTPHeaderDict handling.
        """
        if isinstance(obj, HTTPHeaderDict):
            return HTTPHeaderDict([
                (key, cls.sanitize_for_serialization(val)) for key, val in obj.items()
            ])
        else:
            return super().sanitize_for_serialization(cls, obj)

    # Force override of private method in ApiClient class
    async def _ApiClient__call_api(
        self,
        resource_path,
        method,
        path_params=None,
        query_params=None,
        header_params=None,
        body=None,
        post_params=None,
        files=None,
        response_types_map=None,
        auth_settings=None,
        _return_http_data_only=None,
        collection_formats=None,
        _preload_content=True,
        _request_timeout=None,
        _host=None,
        _request_auth=None,
    ):
        """
        Override of __call_api from ApiClient class with hotfixes to preserve multi-value headers.
        """
        config = self.configuration

        # header parameters
        headers = self.sanitize_for_serialization(self.default_headers)
        if self.cookie:
            headers['Cookie'] = self.cookie
        if header_params:
            headers.update(
                HTTPHeaderDict(self.parameters_to_tuples(
                    self.sanitize_for_serialization(header_params), collection_formats
                ))
            )

        # path parameters
        if path_params:
            path_params = self.sanitize_for_serialization(path_params)
            path_params = self.parameters_to_tuples(path_params,
                                                    collection_formats)
            for k, v in path_params:
                # specified safe chars, encode everything
                resource_path = resource_path.replace(
                    '{%s}' % k,
                    quote(str(v), safe=config.safe_chars_for_path_param)
                )

        # query parameters
        if query_params:
            query_params = self.sanitize_for_serialization(query_params)
            query_params = self.parameters_to_tuples(query_params,
                                                     collection_formats)

        # post parameters
        if post_params or files:
            post_params = post_params if post_params else []
            post_params = self.sanitize_for_serialization(post_params)
            post_params = self.parameters_to_tuples(post_params,
                                                    collection_formats)
            post_params.extend(self.files_parameters(files))

        # auth setting
        self.update_params_for_auth(
            headers, query_params, auth_settings,
            request_auth=_request_auth)

        # body
        if body:
            body = self.sanitize_for_serialization(body)

        # request url
        if _host is None:
            url = self.configuration.host + resource_path
        else:
            # use server/host defined in path or operation instead
            url = _host + resource_path

        try:
            # perform request and return response
            response_data = await self.request(
                method, url, query_params=query_params, headers=headers,
                post_params=post_params, body=body,
                _preload_content=_preload_content,
                _request_timeout=_request_timeout)
        except ApiException as e:
            if e.body:
                e.body = e.body.decode('utf-8') if six.PY3 else e.body
            raise e

        self.last_response = response_data

        return_data = response_data

        if not _preload_content:
            return return_data

        response_type = response_types_map.get(response_data.status, None)

        if six.PY3 and response_type not in ["file", "bytes"]:
            match = None
            content_type = response_data.getheader('content-type')
            if content_type is not None:
                match = re.search(r"charset=([a-zA-Z\-\d]+)[\s\;]?", content_type)
            encoding = match.group(1) if match else "utf-8"
            response_data.data = response_data.data.decode(encoding)

        # deserialize response data

        if response_type:
            return_data = self.deserialize(response_data, response_type)
        else:
            return_data = None

        if _return_http_data_only:
            return (return_data)
        else:
            return (return_data, response_data.status,
                    response_data.getheaders())
