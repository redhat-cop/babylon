#!/usr/bin/env python3

import json
import kopf
import kubernetes
import logging
import os
import re

from copy import deepcopy
from infinite_relative_backoff import InfiniteRelativeBackoff
from pydantic.utils import deep_update

from kubernetes.client import (
    AppsV1Api, CoreV1Api, CustomObjectsApi, RbacAuthorizationV1Api,
    V1Container, V1ContainerPort,
    V1Deployment, V1DeploymentSpec, V1DeploymentStrategy,
    V1EnvVar, V1LabelSelector, V1ObjectMeta,
    V1PodTemplateSpec, V1PodSpec,
    V1RoleBinding, V1RoleRef,
    V1ServiceAccount,
    V1Service, V1ServicePort, V1ServiceSpec,
    V1Subject,
)
from kubernetes.client.rest import ApiException

babylon_domain = os.environ.get('BABYLON_DOMAIN', 'babylon.gpte.redhat.com')
babylon_api_version = os.environ.get('BABYLON_API_VERSION', 'v1')
poolboy_domain = os.environ.get('POOLBOY_DOMAIN', 'poolboy.gpte.redhat.com')
poolboy_api_version = os.environ.get('POOLBOY_API_VERSION', 'v1')
poolboy_namespace = os.environ.get('POOLBOY_NAMESPACE', 'poolboy')

catalog_item_name_label = f"{babylon_domain}/catalogItemName"
catalog_item_namespace_label = f"{babylon_domain}/catalogItemNamespace"
finalizer_value = f"{babylon_domain}/lab-ui-manager"
lab_ui_url_annotation = f"{babylon_domain}/labUserInterfaceUrl"
lab_ui_urls_annotation = f"{babylon_domain}/labUserInterfaceUrls"
lab_ui_label = f"{babylon_domain}/labUserInterface"
owner_annotation = f"{babylon_domain}/owner"
owner_uid_label = f"{babylon_domain}/owner-uid"
requester_annotation = f"{babylon_domain}/requester"
resource_claim_name_label = f"{poolboy_domain}/resource-claim-name"
resource_claim_namespace_label = f"{poolboy_domain}/resource-claim-namespace"

if os.path.exists('/run/secrets/kubernetes.io/serviceaccount'):
    kubernetes.config.load_incluster_config()
else:
    kubernetes.config.load_kube_config()

apps_v1_api = AppsV1Api()
core_v1_api = CoreV1Api()
custom_objects_api = CustomObjectsApi()
rbac_authorization_v1_api = RbacAuthorizationV1Api()

openshift_ingress_domain = custom_objects_api.get_cluster_custom_object(
    'config.openshift.io', 'v1', 'ingresses', 'cluster'
)['spec']['domain']

class BookbagBuild:
    def __init__(
        self,
        definition = None,
        name = None,
        namespace = None,
        spec = None,
        uid = None,
        **_,
    ):
        if definition:
            self.name = definition['metadata']['name']
            self.namespace = definition['metadata']['namespace']
            self.spec = definition['spec']
            self.uid = definition['metadata']['uid']
        else:
            self.name = name
            self.namespace = namespace
            self.spec = spec
            self.uid = uid

    @property
    def build_name(self):
        return self.name

    @property
    def build_namespace(self):
        return self.namespace

    @property
    def image_stream_name(self):
        return self.name

    @property
    def image_stream_namespace(self):
        return self.namespace

    @property
    def source(self):
        return self.spec['source']

    @property
    def strategy(self):
        if 'strategy' in self.spec:
            return self.spec['strategy']
        return {
            "type": "Source",
            "sourceStrategy": {
                "from": {
                    "kind": "DockerImage",
                    "name": "quay.io/openshifthomeroom/workshop-dashboard:5.0.0",
                }
            }
        }

    def delete_build_config(self, logger):
        for build_config in custom_objects_api.list_namespaced_custom_object(
            'build.openshift.io', 'v1', self.build_namespace, 'buildconfigs',
            label_selector=f"{owner_uid_label}={self.uid}"
        ).get('items', []):
            try:
                custom_objects_api.delete_namespaced_custom_object(
                    'build.openshift.io', 'v1', build_config['metadata']['namespace'],
                    'buildconfigs', build_config['metadata']['name']
                )
                logger.info(f"Deleted BuildConfig {build_config['metadata']['name']} in {build_config['metdata']['name']}")
            except ApiException as e:
                if e.status != 404:
                    raise

    def delete_image_stream(self, logger):
        for image_stream in custom_objects_api.list_namespaced_custom_object(
            'image.openshift.io', 'v1', self.build_namespace, 'imagestreams',
            label_selector=f"{owner_uid_label}={self.uid}"
        ).get('items', []):
            try:
                custom_objects_api.delete_namespaced_custom_object(
                    'image.openshift.io', 'v1', image_stream['metadata']['namespace'],
                    'imagestreams', image_stream['metadata']['name']
                )
                logger.info(f"Deleted ImageStream {image_stream['metadata']['name']} in {image_stream['metdata']['name']}")
            except ApiException as e:
                if e.status != 404:
                    raise

    def handle_delete(self, logger):
        self.delete_image_stream(logger=logger)
        self.delete_build_config(logger=logger)

    def make_owner_annotation(self):
        return json.dumps(
            {
                "apiVersion": f"{babylon_domain}/{babylon_api_version}",
                "kind": "BookbagBuild",
                "name": self.name,
                "namespace": self.namespace,
                "uid": self.uid,
            },
            sort_keys=True,
            separators=(',', ':')
        )

    def manage(self, logger):
        self.manage_image_stream(logger=logger)
        self.manage_build_config(logger=logger)

    def manage_build_config(self, logger):
        build_config_spec = {
            "output": {
                "to": {
                    "kind": "ImageStreamTag",
                    "name": f"{self.name}:latest",
                }
            },
            "source": self.source,
            "strategy": self.strategy,
            "triggers": [{
                "type": "ConfigChange",
            }],
        }

        create_build_config = False
        try:
            build_config = custom_objects_api.get_namespaced_custom_object(
                'build.openshift.io', 'v1', self.build_namespace, 'buildconfigs', self.build_name
            )
            updated_build_config = deep_update(build_config, {"spec": build_config_spec})
            if build_config != updated_build_config:
                logger.info(f"Updating BuildConfig {self.build_name} in {self.build_namespace}")
                custom_objects_api.replace_namespaced_custom_object(
                    'build.openshift.io', 'v1', self.build_namespace, 'buildconfigs', self.build_name, updated_build_config
                )
        except ApiException as e:
            if e.status == 404:
                create_build_config = True
            else:
                raise
        if create_build_config:
            logger.info(f"Creating BuildConfig {self.build_name} in {self.build_namespace}")
            build_config = custom_objects_api.create_namespaced_custom_object(
                'build.openshift.io', 'v1', self.build_namespace, 'buildconfigs',
                {
                    "apiVersion": "build.openshift.io/v1",
                    "kind": "BuildConfig",
                    "metadata": {
                        "annotations": {
                            owner_annotation: self.make_owner_annotation(),
                        },
                        "labels": {
                            owner_uid_label: self.uid,
                        },
                        "name": self.build_name,
                    },
                    "spec": build_config_spec,
                }
            )
        return build_config

    def manage_image_stream(self, logger):
        create_image_stream = False
        try:
            image_stream = custom_objects_api.get_namespaced_custom_object(
                'image.openshift.io', 'v1', self.build_namespace, 'imagestreams', self.build_name
            )
        except ApiException as e:
            if e.status == 404:
                create_image_stream = True
            else:
                raise
        if create_image_stream:
            logger.info(f"Creating ImageStream {self.build_name} in {self.build_namespace}")
            image_stream = custom_objects_api.create_namespaced_custom_object(
                'image.openshift.io', 'v1', self.build_namespace, 'imagestreams',
                {
                    "apiVersion": "image.openshift.io/v1",
                    "kind": "ImageStream",
                    "metadata": {
                        "annotations": {
                            owner_annotation: self.make_owner_annotation(),
                        },
                        "labels": {
                            owner_uid_label: self.uid,
                        },
                        "name": self.build_name,
                    },
                }
            )
        return image_stream

class BookbagConfig:
    def __init__(self, definition):
        self.auth = BookbagConfigAuth(definition.get('auth'))
        self.image = definition.get('image')
        if 'imageBuild' in definition and not self.image:
            self.image_build = BookbagConfigImageBuild(definition['imageBuild'])
        else:
            self.image_build = None

    def manage_deployment(self, bookbag_build, image, logger, resource_claim, user=None):
        name = f"{resource_claim.name}-{user.name}" if user else resource_claim.name
        namespace = resource_claim.namespace
        owner_ref = resource_claim.make_owner_ref()

        bookbag_deployment_spec = {
            "auth": {
                "password": self.auth.password,
                "user": self.auth.user,
            },
            "route": {}
        }
        if bookbag_build:
            bookbag_deployment_spec['imageStream'] = {
                "name": bookbag_build.image_stream_name,
                "namespace":  bookbag_build.image_stream_namespace,
            }
        else:
            bookbag_deployment_spec['image'] = image

        if user:
            bookbag_deployment_spec['vars'] = deepcopy(user.data)
            bookbag_deployment_spec['route']['host'] = f"bookbag-{resource_claim.guid}-{user.name}.{openshift_ingress_domain}"
        else:
            bookbag_deployment_spec['vars'] = deepcopy(resource_claim.get_provision_data(logger=logger))
            bookbag_deployment_spec['route']['host'] = f"bookbag-{resource_claim.guid}.{openshift_ingress_domain}"

        create_bookbag_deployment = False
        try:
            definition = custom_objects_api.get_namespaced_custom_object(
                babylon_domain, babylon_api_version, namespace, 'bookbagdeployments', name
            )
            updated_definition = deepcopy(definition)
            updated_definition['spec'] = bookbag_deployment_spec
            if definition != updated_definition:
                logger.info(f"Updating BookbagDeployment {name} in {namespace}")
                definition = custom_objects_api.replace_namespaced_custom_object(
                    babylon_domain, babylon_api_version, namespace,
                    'bookbagdeployments', name, updated_definition
                )
        except ApiException as e:
            if e.status == 404:
                create_bookbag_deployment = True
            else:
                raise

        if create_bookbag_deployment:
            logger.info(f"Creating BookbagDeployment {name} in {namespace}")
            definition = custom_objects_api.create_namespaced_custom_object(
                babylon_domain, babylon_api_version, namespace, 'bookbagdeployments',
                {
                    "apiVersion": f"{babylon_domain}/{babylon_api_version}",
                    "kind": "BookbagDeployment",
                    "metadata": {
                        "labels": {
                            resource_claim_name_label: resource_claim.name,
                            resource_claim_namespace_label: resource_claim.namespace,
                        },
                        "name": name,
                        "namespace": namespace,
                        "ownerReferences": [owner_ref],
                    },
                    "spec": bookbag_deployment_spec,
                }
            )

        return BookbagDeployment(definition=definition)


class BookbagConfigAuth:
    def __init__(self, definition):
        if definition:
            self.password = definition.get('pasword', '')
            self.user = definition.get('user', '*')
        else:
            self.password = ''
            self.user = '*'


class BookbagConfigImageBuild:
    def __init__(self, definition):
        self.definition = definition

    @property
    def source(self):
        return self.definition['source']

    @property
    def strategy(self):
        if 'strategy' in self.definition:
            return self.definition['strategy']

    def manage_build(self, logger, resource_claim):
        name = resource_claim.name
        namespace = resource_claim.namespace
        owner_ref = resource_claim.make_owner_ref()

        bookbag_build_spec = {
            "source": self.source,
        }
        if self.strategy:
            bookbag_build_spec['strategy'] = self.strategy

        create_bookbag_build = False
        try:
            bookbag_build_definition = custom_objects_api.get_namespaced_custom_object(
                babylon_domain, babylon_api_version, namespace, 'bookbagbuilds', name
            )
            if bookbag_build_definition['spec'] != bookbag_build_spec:
                logger.info(f"Updating BookbagBuild {name} in {namespace}")
                bookbag_build_definition = custom_objects_api.patch_namespaced_custom_object(
                    babylon_domain, babylon_api_version, namespace, 'bookbagbuilds', name,
                    { "spec": bookbag_build_spec }
                )
        except ApiException as e:
            if e.status == 404:
                create_bookbag_build = True
            else:
                raise

        if create_bookbag_build:
            logger.info(f"Creating BookbagBuild {name} in {namespace}")
            bookbag_build_definition = custom_objects_api.create_namespaced_custom_object(
                babylon_domain, babylon_api_version, namespace, 'bookbagbuilds',
                {
                    "apiVersion": f"{babylon_domain}/{babylon_api_version}",
                    "kind": "BookbagBuild",
                    "metadata": {
                        "labels": {
                            resource_claim_name_label: resource_claim.name,
                            resource_claim_namespace_label: resource_claim.namespace,
                        },
                        "name": name,
                        "namespace": namespace,
                        "ownerReferences": [owner_ref],
                    },
                    "spec": bookbag_build_spec,
                }
            )

        return BookbagBuild(definition=bookbag_build_definition)


class BookbagDeployment:
    def __init__(
        self,
        definition = None,
        name = None,
        namespace = None,
        spec = None,
        uid = None,
        **_,
    ):
        if definition:
            self.name = definition['metadata']['name']
            self.namespace = definition['metadata']['namespace']
            self.spec = definition['spec']
            self.uid = definition['metadata']['uid']
        else:
            self.name = name
            self.namespace = namespace
            self.spec = spec
            self.uid = uid

    @property
    def auth_password(self):
        return self.spec.get('auth', {}).get('password', '')

    @property
    def auth_username(self):
        return self.spec.get('auth', {}).get('user', '*')

    @property
    def deployment_name(self):
        return re.sub(r'[^a-z0-9\-]', '-', self.name) + '-bookbag'

    @property
    def deployment_namespace(self):
        return self.namespace

    @property
    def image_stream_name(self):
        return self.spec.get('imageStream', {}).get('name')

    @property
    def image_stream_namespace(self):
        return self.spec.get('imageStream', {}).get('namespace', self.deployment_namespace)

    @property
    def route_host(self):
        return self.spec.get('route', {}).get(
            'host', f"{self.deployment_name}-{self.deployment_namespace}.{openshift_ingress_domain}"
        )

    @property
    def url(self):
        return f"https://{self.route_host}/"

    @property
    def vars(self):
        return self.spec.get('vars', {})

    def delete_deployment(self, logger):
        for deployment in apps_v1_api.list_namespaced_deployment(
            self.deployment_namespace,
            label_selector=f"{owner_uid_label}={self.uid}"
        ).items:
            try:
                apps_v1_api.delete_namespaced_deployment(
                    deployment.metadata.name, deployment.metadata.namespace
                )
                logger.info(f"Deleted Deployment {deployment.metadata.name} in {deployment.metadata.namespace}")
            except ApiException as e:
                if e.status != 404:
                    raise

    def delete_role_binding(self, logger):
        for role_binding in rbac_authorization_v1_api.list_namespaced_role_binding(
            self.deployment_namespace,
            label_selector=f"{owner_uid_label}={self.uid}"
        ).items:
            try:
                rbac_authorization_v1_api.delete_namespaced_role_binding(
                    role_binding.metadata.name, role_binding.metadata.namespace,
                )
                logger.info(f"Deleted RoleBinding {role_binding.metadata.name} in {role_binding.metadata.namespace}")
            except ApiException as e:
                if e.status != 404:
                    raise

    def delete_route(self, logger):
        for route in custom_objects_api.list_namespaced_custom_object(
            'route.openshift.io', 'v1', self.deployment_namespace, 'routes',
            label_selector=f"{owner_uid_label}={self.uid}"
        ).get('items', []):
            try:
                custom_objects_api.delete_namespaced_custom_object(
                    'route.openshift.io', 'v1', route['metadata']['namespace'], 'routes', route['metadata']['name']
                )
                logger.info(f"Deleted Route {route['metadata']['name']} in {route['metadata']['namespace']}")
            except ApiException as e:
                if e.status != 404:
                    raise

    def delete_service(self, logger):
        for service in core_v1_api.list_namespaced_service(
            self.deployment_namespace,
            label_selector=f"{owner_uid_label}={self.uid}"
        ).items:
            try:
                core_v1_api.delete_namespaced_service(
                    service.metadata.name, service.metadata.namespace
                )
                logger.info(f"Deleted Service {service.metadata.name} in {service.metadata.namespace}")
            except ApiException as e:
                if e.status != 404:
                    raise

    def delete_service_account(self, logger):
        for service in core_v1_api.list_namespaced_service_account(
            self.deployment_namespace,
            label_selector=f"{owner_uid_label}={self.uid}"
        ).items:
            try:
                core_v1_api.delete_namespaced_service_account(
                    service.metadata.name, service.metadata.namespace
                )
                logger.info(f"Deleted ServiceAccount {service.metadata.name} in {service.metadata.namespace}")
            except ApiException as e:
                if e.status != 404:
                    raise

    def get_image(self):
        if self.image_stream_name:
            image_stream = custom_objects_api.get_namespaced_custom_object(
                'image.openshift.io', 'v1', self.image_stream_namespace, 'imagestreams', self.image_stream_name
            )
            if 'tags' in image_stream['status']:
                return image_stream['status']['tags'][0]['items'][0]['dockerImageReference']
            else:
                return f"{image_stream['status']['dockerImageRepository']}:latest"
        else:
            return self.image

    def handle_delete(self, logger):
        self.delete_service_account(logger=logger)
        self.delete_role_binding(logger=logger)
        self.delete_deployment(logger=logger)
        self.delete_service(logger=logger)
        self.delete_route(logger=logger)

    def make_owner_annotation(self):
        return json.dumps(
            {
                "apiVersion": f"{babylon_domain}/{babylon_api_version}",
                "kind": "BookbagDeployment",
                "name": self.name,
                "namespace": self.namespace,
                "uid": self.uid,
            },
            sort_keys=True,
            separators=(',', ':')
        )

    def manage(self, logger):
        self.manage_service_account(logger=logger)
        self.manage_role_binding(logger=logger)
        self.manage_deployment(logger=logger)
        self.manage_service(logger=logger)
        self.manage_route(logger=logger)

    def manage_deployment(self, logger):
        serialized_vars = json.dumps(self.vars, sort_keys=True, separators=(',', ':'))
        create_deployment = False
        try:
            deployment = apps_v1_api.read_namespaced_deployment(
                self.deployment_name, self.deployment_namespace
            )
            update_required = False
            for envvar in deployment.spec.template.spec.containers[0].env:
                if envvar.name == 'AUTH_USERNAME':
                    if envvar.value != self.auth_username:
                        envvar.value = self.auth_username
                        updated_required = True
                elif envvar.name == 'AUTH_PASSWORD':
                    if envvar.value != self.auth_password:
                        envvar.value = self.auth_password
                        updated_required = True
                elif envvar.name == 'WORKSHOP_VARS':
                    if envvar.value != serialized_vars:
                        envvar.value = serialized_vars
                        updated_required = True
            if update_required:
                apps_v1_api.replace_namespaced_deployment(self.deployment_name, self.deployment_namespace, deployment)
        except ApiException as e:
            if e.status == 404:
                create_deployment = True
            else:
                raise

        if create_deployment:
            logger.info(f"Creating Deployment {self.deployment_name} in {self.deployment_namespace}")
            deployment = V1Deployment(
                metadata = V1ObjectMeta(
                    annotations = {
                        owner_annotation: self.make_owner_annotation(),
                    },
                    labels = {
                        owner_uid_label: self.uid
                    },
                    name = self.deployment_name,
                ),
                spec = V1DeploymentSpec(
                    replicas = 1,
                    selector = V1LabelSelector(match_labels={"name": self.deployment_name}),
                    strategy = V1DeploymentStrategy(type="Recreate"),
                    template = V1PodTemplateSpec(
                        metadata = V1ObjectMeta(labels={"name": self.deployment_name}),
                        spec = V1PodSpec(
                            containers = [
                                V1Container(
                                    name = "bookbag",
                                    env = [
                                        V1EnvVar(
                                            name = "APPLICATION_NAME",
                                            value = self.deployment_name,
                                        ),
                                        V1EnvVar(
                                            name = "AUTH_USERNAME",
                                            value = self.auth_username,
                                        ),
                                        V1EnvVar(
                                            name = "AUTH_PASSWORD",
                                            value = self.auth_password,
                                        ),
                                        V1EnvVar(
                                            name = "CLUSTER_SUBDOMAIN",
                                        ),
                                        V1EnvVar(
                                            name = "OAUTH_SERVICE_ACCOUNT",
                                            value = self.deployment_name,
                                        ),
                                        V1EnvVar(
                                            name = "WORKSHOP_VARS",
                                            value = serialized_vars,
                                        ),
                                        V1EnvVar(
                                            name = "DOWNLOAD_URL",
                                        ),
                                        V1EnvVar(
                                            name = "WORKSHOP_FILE",
                                        ),
                                        V1EnvVar(
                                            name = "OC_VERSION",
                                        ),
                                        V1EnvVar(
                                            name = "ODO_VERSION",
                                        ),
                                        V1EnvVar(
                                            name = "KUBECTL_VERSION",
                                        ),
                                    ],
                                    image = self.get_image(),
                                    image_pull_policy = "Always",
                                    ports = [V1ContainerPort(container_port=10080)],
                                )
                            ],
                            service_account_name = self.deployment_name,
                        )
                    ),
                ),
            )

            if self.image_stream_name:
                deployment.metadata.annotations['image.openshift.io/triggers'] = json.dumps([{
                    "fieldPath": 'spec.template.spec.containers[?(@.name=="bookbag")].image',
                    "from": {
                        "kind": "ImageStreamTag",
                        "name": f"{self.image_stream_name}:latest",
                        "namespace": self.image_stream_namespace,
                    },
                }])

            deployment = apps_v1_api.create_namespaced_deployment(self.deployment_namespace, deployment)

        return deployment

    def manage_role_binding(self, logger):
        create_role_binding = False
        try:
            role_binding = rbac_authorization_v1_api.read_namespaced_role_binding(
                self.deployment_name, self.deployment_namespace
            )
        except ApiException as e:
            if e.status == 404:
                create_role_binding = True
            else:
                raise
        if create_role_binding:
            logger.info(f"Creating RoleBinding {self.deployment_name} in {self.deployment_namespace}")
            role_binding = rbac_authorization_v1_api.create_namespaced_role_binding(
                self.deployment_namespace,
                V1RoleBinding(
                    metadata = V1ObjectMeta(
                        annotations = {
                            owner_annotation: self.make_owner_annotation(),
                        },
                        labels = {
                            owner_uid_label: self.uid
                        },
                        name = self.deployment_name,
                    ),
                    role_ref = V1RoleRef(
                        api_group = "rbac.authorization.k8s.io",
                        kind = "ClusterRole",
                        name = "basic-user",
                    ),
                    subjects = [
                        V1Subject(
                            kind = "ServiceAccount",
                            name = self.deployment_name,
                            namespace = self.deployment_namespace,
                        )
                    ]
                )
            )
        return role_binding

    def manage_route(self, logger):
        create_route = False
        try:
            route = custom_objects_api.get_namespaced_custom_object(
                'route.openshift.io', 'v1', self.deployment_namespace, 'routes', self.deployment_name
            )
        except ApiException as e:
            if e.status == 404:
                create_route = True
            else:
                raise
        if create_route:
            logger.info(f"Creating Route {self.deployment_name} in {self.deployment_namespace}")
            route = custom_objects_api.create_namespaced_custom_object(
                'route.openshift.io', 'v1', self.deployment_namespace, 'routes',
                {
                    "apiVersion": "route.openshift.io/v1",
                    "kind": "Route",
                    "metadata": {
                        "annotations": {
                            owner_annotation: self.make_owner_annotation(),
                        },
                        "labels": {
                            owner_uid_label: self.uid
                        },
                        "name": self.deployment_name,
                    },
                    "spec": {
                        "host": self.route_host,
                        "port": {
                            "targetPort": "10080-tcp",
                        },
                        "tls": {
                            "insecureEdgeTerminationPolicy": "Redirect",
                            "termination": "edge",
                        },
                        "to": {
                            "kind": "Service",
                            "name": self.deployment_name,
                        },
                    }
                }
            )
        return route

    def manage_service(self, logger):
        create_service = False
        try:
            service = core_v1_api.read_namespaced_service(
                self.deployment_name, self.deployment_namespace
            )
        except ApiException as e:
            if e.status == 404:
                create_service = True
            else:
                raise
        if create_service:
            logger.info(f"Creating Service {self.deployment_name} in {self.deployment_namespace}")
            service = core_v1_api.create_namespaced_service(
                self.deployment_namespace,
                V1Service(
                    metadata = V1ObjectMeta(
                        annotations = {
                            owner_annotation: self.make_owner_annotation(),
                        },
                        labels = {
                            owner_uid_label: self.uid
                        },
                        name = self.deployment_name,
                    ),
                    spec = V1ServiceSpec(
                        ports = [
                            V1ServicePort(
                                name = "10080-tcp",
                                port = 10080,
                                protocol = "TCP",
                                target_port = 10080,
                            )
                        ],
                        selector = {"name": self.deployment_name},
                        type = "ClusterIP",
                    ),
                ),
            )
        return service

    def manage_service_account(self, logger):
        create_service_account = False
        try:
            service_account = core_v1_api.read_namespaced_service_account(
                self.deployment_name, self.deployment_namespace
            )
        except ApiException as e:
            if e.status == 404:
                create_service_account = True
            else:
                raise
        if create_service_account:
            logger.info(f"Creating ServiceAccount {self.deployment_name} in {self.deployment_namespace}")
            service_account = core_v1_api.create_namespaced_service_account(
                self.deployment_namespace,
                V1ServiceAccount(
                    metadata = V1ObjectMeta(
                        annotations = {
                            owner_annotation: self.make_owner_annotation(),
                        },
                        labels = {
                            owner_uid_label: self.uid
                        },
                        name = self.deployment_name,
                    )
                )
            )
        return service_account


class CatalogItem:
    @staticmethod
    def get(name, namespace):
        definition = custom_objects_api.get_namespaced_custom_object(
            babylon_domain, babylon_api_version, namespace, 'catalogitems', name
        )
        return CatalogItem(definition=definition)

    def __init__(self, definition):
        self.definition = definition

    @property
    def name(self):
        return self.definition['metadata']['name']

    @property
    def namespace(self):
        return self.definition['metadata']['namespace']

    def get_bookbag_config(self):
        if not 'bookbag' in self.definition['spec']:
            return None
        return BookbagConfig(definition=self.definition['spec']['bookbag'])


class LabUiDeployment:
    def __init__(self, deployment, route):
        self.deployment = deployment
        self.route = route

    @property
    def url(self):
        return "https://{self.route['spec']['host']}/"


class LabUiImageBuild:
    def __init__(self, build_config, image_stream):
        self.build_config = build_config
        self.image_stream = image_stream

    @property
    def image(self):
        image_stream_status = self.image_stream['status']
        return f"{image_stream_status['dockerImageRepository']}:latest"


class LabUser:
    def __init__(self, name, data):
        self.name = name
        self.data = deepcopy(data)
        self.data['user'] = name

    def add_data(self, data):
        self.data.update({
            k: v for k, v in data.items() if k != 'msg'
        })
        if 'msg' in data:
            if 'msg' in self.data:
                self.data['msg'] += f"\n{data['msg']}"
            else:
                self.data['msg'] = data['msg']

class ResourceClaim:
    def __init__(self, definition):
        self.definition = definition

    @property
    def annotations(self):
        return self.definition['metadata'].get('annotations', {})

    @property
    def catalog_item_name(self):
        return self.labels.get(catalog_item_name_label)

    @property
    def catalog_item_namespace(self):
        return self.labels.get(catalog_item_namespace_label)

    @property
    def guid(self):
        if 'resourceHandle' in self.status:
            return re.sub(r'^guid-', '', self.status['resourceHandle']['name'])

    @property
    def is_multiuser(self):
        """
        ResourceClaim is multiuser if any AnarchySubject has users in provision data.
        """
        if 'resources' not in self.status:
            raise kopf.TemporaryError("Cannot determine whether environment is multiuser without .status.resources")

        for resource in self.definition['status']['resources']:
            state = resource['state']
            if state['kind'] == 'AnarchySubject':
                provision_data = state['spec']['vars'].get('provision_data', {})
                if 'users' in provision_data:
                    return True
        return False

    @property
    def lab_ui_type(self):
        return self.labels.get(lab_ui_label)

    @property
    def labels(self):
        return self.definition['metadata'].get('labels', {})

    @property
    def name(self):
        return self.definition['metadata']['name']

    @property
    def namespace(self):
        return self.definition['metadata']['namespace']

    @property
    def provision_complete(self):
        """
        ResourceClaim has completed provisioning if all AnarchySubjects have a provision completion timestamp.
        """
        if 'resources' not in self.status:
            return False
        for resource in self.status['resources']:
            state = resource.get('state')
            if not state:
                return False
            if state['kind'] == 'AnarchySubject':
                if not state.get('status', {}).get('towerJobs', {}).get('provision', {}).get('completeTimestamp'):
                    return False
        return True

    @property
    def requester(self):
        return self.annotations.get(requester_annotation)

    @property
    def spec(self):
        return self.definition['spec']

    @property
    def status(self):
        return self.definition.get('status', {})

    @property
    def uid(self):
        return self.definition['metadata']['uid']

    def delete_lab_ui(self, logger):
        label_selector=f"{resource_claim_name_label}={self.name},{resource_claim_namespace_label}={self.namespace}"

        for bookbag_build in custom_objects_api.list_cluster_custom_object(
            babylon_domain, babylon_api_version, 'bookbagbuilds', label_selector=label_selector
        ).get('items', []):
            name = bookbag_build['metadata']['name']
            namespace = bookbag_build['metadata']['namespace']
            logger.info("Deleting BookbagBuild {name} in {namespace}")
            custom_objects_api.delete_namespaced_custom_object(
                babylon_domain, babylon_api_version, namespace, 'bookbagbuilds', name
            )

        for bookbag_deployment in custom_objects_api.list_cluster_custom_object(
            babylon_domain, babylon_api_version, 'bookbagdeployments', label_selector=label_selector
        ).get('items', []):
            name = bookbag_deployment['metadata']['name']
            namespace = bookbag_deployment['metadata']['namespace']
            logger.info("Deleting BookbagDeployment {name} in {namespace}")
            custom_objects_api.delete_namespaced_custom_object(
                babylon_domain, babylon_api_version, namespace, 'bookbagdeployments', name
            )

    def get_catalog_item(self):
        if not self.catalog_item_name:
            raise kopf.PermanentError(f"Unable to determine catalog item name!")
        if not self.catalog_item_namespace:
            raise kopf.PermanentError(f"Unable to determine catalog item namespace!")
        try:
            return CatalogItem.get(self.catalog_item_name, self.catalog_item_namespace)
        except ApiException as e:
            if e.status == 404:
                raise kopf.TemporaryError(
                    f"Unable to find CatalogItem {self.catalog_item_name} in namespace {self.catalog_item_namespace}",
                    delay = 60,
                )
            else:
                raise

    def get_lab_ui_url(self, logger):
        if not self.annotations or not lab_ui_url_annotation in self.annotations:
            return None
        else:
            return self.annotations[lab_ui_url_annotation]

    def get_lab_ui_urls(self, logger):
        if not self.annotations or not lab_ui_urls_annotation in self.annotations:
            return None
        else:
            try:
                return json.loads(self.annotations[lab_ui_urls_annotation])
            except json.decoder.JSONDecodeError as e:
                logger.warning(
                    f"Failed to parse json for {lab_ui_urls_annotation} "
                    f"in ResourceClaim {self.name} in namespace {self.namespace}: "
                    f"{e.msg}"
                )
                return None

    def get_provision_data(self, logger):
        data = {
            'guid': self.guid,
            'user': self.requester,
        }
        messages = []

        for idx, resource in enumerate(self.status['resources']):
            resource_name = self.spec['resources'][idx].get('name')
            resource_name_var_prefix = re.sub(r'[^a-z0-9_]', '_', resource_name) if resource_name else None
            resource_state = resource.get('state')
            if not resource_state:
                continue
            if resource_state['kind'] != 'AnarchySubject':
                continue
            spec_vars = resource_state['spec']['vars']
            for k, v in spec_vars.get('provision_data', {}).items():
                data[k] = v
                if resource_name_var_prefix:
                    data[f"{resource_name_var_prefix}_{k}"] = v
            messages.extend(spec_vars.get('provision_messages', []))

        if messages:
            data['user_info_messages'] = "\n".join(messages)

        return data

    def get_users(self):
        users = []
        for idx, resource in enumerate(self.status['resources']):
            resource_name = self.definition['spec']['resources'][idx].get('name')
            resource_name_var_prefix = re.sub(r'[^a-z0-9_]', '_', resource_name) if resource_name else None
            resource_state = resource.get('state')
            if not resource_state:
                continue
            if resource_state['kind'] != 'AnarchySubject':
                continue
            for name, user_data in resource_state['spec']['vars']['provision_data']['users'].items():
                data = deepcopy(user_data)
                data['user'] = name
                if resource_name_var_prefix:
                    for k, v in data.items():
                        user_data[f"{resource_name_var_prefix}_{k}"] = v
                for user in users:
                    if user.name == name:
                        user.add_data(user_data)
                        break
                else:
                    users.append(LabUser(name=name, data=user_data))
        for user in users:
            user.data['guid'] = self.guid
        return users

    def make_owner_ref(self):
        return {
            "apiVersion": "{poolboy_domain}/{poolboy_api_version}",
            "blockOwnerDeletion": False,
            "controller": True,
            "kind": "ResourceClaim",
            "name": self.name,
            "uid": self.uid,
        }

    def manage_bookbag(self, logger):
        catalog_item = self.get_catalog_item()
        bookbag_config = catalog_item.get_bookbag_config()
        if not bookbag_config:
            logger.warning(
                f"ResourceClaim {self.name} in namespace {self.namespace} "
                f"has bookbag label but catalog item lacks bookbag configuration"
            )
            return

        if bookbag_config.image_build:
            bookbag_build = bookbag_config.image_build.manage_build(
                logger = logger,
                resource_claim = self,
            )
            image = None
        else:
            bookbag_build = None
            image = bookbag_config.image

        if self.is_multiuser:
            lab_ui_urls = {}
            for user in self.get_users():
                bookbag_deployment = bookbag_config.manage_deployment(
                    bookbag_build = bookbag_build,
                    image = image,
                    logger = logger,
                    resource_claim = self,
                    user = user,
                )
                lab_ui_urls[user.name] = bookbag_deployment.url
            if lab_ui_urls != self.get_lab_ui_urls(logger=logger):
                custom_objects_api.patch_namespaced_custom_object(
                    poolboy_domain, poolboy_api_version, self.namespace, "resourceclaims", self.name,
                    {
                        "metadata": {
                            "annotations": {
                                lab_ui_urls_annotation: json.dumps(lab_ui_urls, sort_keys=True, separators=(',', ':'))
                            }
                        }
                    }
                )
        else:
            bookbag_deployment = bookbag_config.manage_deployment(
                bookbag_build = bookbag_build,
                image = image,
                logger = logger,
                resource_claim = self,
            )
            if bookbag_deployment.url != self.get_lab_ui_url(logger=logger):
                custom_objects_api.patch_namespaced_custom_object(
                    poolboy_domain, poolboy_api_version, self.namespace, "resourceclaims", self.name,
                    {
                        "metadata": {
                            "annotations": {
                                lab_ui_url_annotation: bookbag_deployment.url
                            }
                        }
                    }
                )

    def manage_lab_ui(self, logger):
        if self.lab_ui_type == 'bookbag':
            self.manage_bookbag(logger=logger)
        else:
            raise kopf.PermanentError(f"Unable to manage lab ui type: {self.lab_ui_type}")


@kopf.on.startup()
def configure(settings: kopf.OperatorSettings, **_):
    # Never give up from network errors
    settings.networking.error_backoffs = InfiniteRelativeBackoff()

    # Store last handled configuration in status
    settings.persistence.diffbase_storage = kopf.StatusDiffBaseStorage(field='status.diffBase')

    # Use operator domain as finalizer
    settings.persistence.finalizer = f"{babylon_domain}/lab-ui-manager"

    # Store progress in status. Some objects may be too large to store status in metadata annotations
    settings.persistence.progress_storage = kopf.StatusProgressStorage(field='status.kopf.progress')

    # Only create events for warnings and errors
    settings.posting.level = logging.WARNING

    # Disable scanning for CustomResourceDefinitions
    settings.scanning.disabled = True


@kopf.on.event(poolboy_domain, poolboy_api_version, 'resourceclaims', labels={lab_ui_label: kopf.PRESENT})
def bookbag_resourceclaim_event(event, logger, **_):
    resource_claim_definition = event.get('object')
    if not resource_claim_definition:
        logger.info("No object in event")
        return
    resource_claim = ResourceClaim(definition=resource_claim_definition)
    if event['type'] == 'DELETED':
        resource_claim.delete_lab_ui(logger=logger)
    elif resource_claim.provision_complete:
        resource_claim.manage_lab_ui(logger=logger)
    else:
        logger.info("Waiting for provision to complete")

@kopf.on.create(babylon_domain, babylon_api_version, 'bookbagbuilds', id='bookbag_build_create')
@kopf.on.resume(babylon_domain, babylon_api_version, 'bookbagbuilds', id='bookbag_build_resume')
@kopf.on.update(babylon_domain, babylon_api_version, 'bookbagbuilds', id='bookbag_build_update')
def bookbag_build_event(logger, **kwargs):
    bookbag_build = BookbagBuild(**kwargs)
    bookbag_build.manage(logger=logger)

@kopf.on.delete(babylon_domain, babylon_api_version, 'bookbagbuilds')
def bookbag_build_delete(logger, **kwargs):
    bookbag_build = BookbagBuild(**kwargs)
    bookbag_build.handle_delete(logger=logger)

@kopf.on.create(babylon_domain, babylon_api_version, 'bookbagdeployments', id='bookbag_deployment_create')
@kopf.on.resume(babylon_domain, babylon_api_version, 'bookbagdeployments', id='bookbag_deployment_resume')
@kopf.on.update(babylon_domain, babylon_api_version, 'bookbagdeployments', id='bookbag_deployment_update')
def bookbag_deployment_event(logger, **kwargs):
    bookbag_deployment = BookbagDeployment(**kwargs)
    bookbag_deployment.manage(logger=logger)

@kopf.on.delete(babylon_domain, babylon_api_version, 'bookbagdeployments')
def bookbag_deployment_delete(logger, **kwargs):
    bookbag_deployment = BookbagDeployment(**kwargs)
    bookbag_deployment.handle_delete(logger=logger)
