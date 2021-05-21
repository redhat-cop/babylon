#!/usr/bin/env python3
import argparse
import random
import kubernetes
import sys
import yaml

kubernetes.config.load_kube_config()
core_v1_api = kubernetes.client.CoreV1Api()
custom_objects_api = kubernetes.client.CustomObjectsApi()

DEFAULT_DESCRIPTION = '''Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur massa nibh, accumsan eu consequat sit amet, venenatis quis felis. Sed ut euismod leo, ac sollicitudin metus. Mauris dapibus tortor non feugiat molestie. In hac habitasse platea dictumst. Donec a pharetra ipsum. Aenean rutrum tempus sapien. Morbi sit amet ligula in tortor vulputate feugiat.

Morbi magna leo, hendrerit eu rutrum non, sagittis ullamcorper mi. Fusce sodales magna in orci elementum consectetur. Praesent vel auctor ligula. Suspendisse lacinia eros ac ornare commodo. Nunc lectus turpis, euismod sed tellus a, blandit feugiat neque. Sed et leo sed lacus faucibus consequat non at mauris. Cras pharetra hendrerit consequat. Nullam laoreet, ex a volutpat scelerisque, lectus ligula pulvinar est, a vehicula nunc purus sed leo. Morbi ac sagittis elit. Nunc nibh lorem, euismod vel lectus sit amet, porta pellentesque eros. Proin nec odio lectus.'''

class MakeCatalogItemException(Exception):
    pass

def create_catalog_item(
    name,
    namespace,
    governors,
    category=None,
    description=None,
    display_name=None,
    icon=None,
    keywords=None,
    product=None,
    provider=None,
):
    try:
        return custom_objects_api.get_namespaced_custom_object(
            'babylon.gpte.redhat.com',
            'v1',
            namespace,
            'catalogitems',
            name
        )
    except kubernetes.client.exceptions.ApiException as e:
        if e.status != 404:
            raise

    catalog_item = {
        'apiVersion': 'babylon.gpte.redhat.com/v1',
        'kind': 'CatalogItem',
        'metadata': {
            'name': name,
            'namespace': namespace,
            'annotations': {
                'babylon.gpte.redhat.com/description': description,
                'babylon.gpte.redhat.com/displayName': display_name,
                'babylon.gpte.redhat.com/icon': icon,
                'babylon.gpte.redhat.com/keywords': keywords,
            },
            'labels': {
                'babylon.gpte.redhat.com/category': category,
                'babylon.gpte.redhat.com/product': product,
                'babylon.gpte.redhat.com/provider': provider,
            }
        },
        'spec': {
            'resources': []
        }
    }

    # Remove empty annotations and labels
    for k, v in list(catalog_item['metadata']['annotations'].items()):
        if not v:
            catalog_item['metadata']['annotations'].pop(k)
    for k, v in list(catalog_item['metadata']['labels'].items()):
        if not v:
            catalog_item['metadata']['labels'].pop(k)

    for governor in governors:
        anarchy_governor = get_anarchy_governor(governor)
        resource_provider = define_resource_provider(anarchy_governor)
        catalog_item['spec']['resources'].append({
            'provider': {
                'apiVersion': resource_provider['apiVersion'],
                'kind': resource_provider['kind'],
                'name': resource_provider['metadata']['name'],
                'namespace': resource_provider['metadata']['namespace'],
            }
        })

    return custom_objects_api.create_namespaced_custom_object(
        'babylon.gpte.redhat.com',
        'v1',
        namespace,
        'catalogitems',
        catalog_item,
    )

def define_catalog_item(
    name,
    namespace,
    category=None,
    description=None,
    display_name=None,
    governor=None,
    icon=None,
    keywords=None,
    product=None,
    provider=None,
    provision_history=None,
    rating=None,
):
    if description == None:
        description = DEFAULT_DESCRIPTION
    if display_name == None:
        display_name = name
    if provider == None:
        provider = 'GPTE'
    if provision_history == None:
        provision_history = []
    if rating == None:
        rating = random.uniform(2.5, 5)

    governors = governor.split(',') if governor else [name]

    catalog_item = create_catalog_item(
        name=name,
        namespace=namespace,
        category=category,
        description=description,
        display_name=display_name,
        governors=governors,
        icon=icon,
        keywords=keywords,
        product=product,
        provider=provider,
    )

    custom_objects_api.patch_namespaced_custom_object_status(
        'babylon.gpte.redhat.com',
        'v1',
        namespace,
        'catalogitems',
        name,
        {
            'status': {
                'provisionHistory': provision_history,
                'rating': rating,
            }
        }
    )

def define_resource_provider(anarchy_governor):
    name = anarchy_governor['metadata']['name']
    try:
        return custom_objects_api.get_namespaced_custom_object(
            'poolboy.gpte.redhat.com',
            'v1',
            'poolboy',
            'resourceproviders',
            name
        )
    except kubernetes.client.exceptions.ApiException as e:
        if e.status != 404:
            raise
    return custom_objects_api.create_namespaced_custom_object(
        'poolboy.gpte.redhat.com',
        'v1',
        'poolboy',
        'resourceproviders',
        {
            'apiVersion': 'poolboy.gpte.redhat.com/v1',
            'kind': 'ResourceProvider',
            'metadata': {
                'name': name,
                'namespace': 'poolboy',
            },
            'spec': {
                'override': {
                    'apiVersion': 'anarchy.gpte.redhat.com/v1',
                    'kind': 'AnarchySubject',
                    'metadata': {
                        'namespace': anarchy_governor['metadata']['namespace'],
                        'generateName': anarchy_governor['metadata']['name'] + '-',
                    },
                    'spec': {
                        'governor': anarchy_governor['metadata']['name'],
                        'vars': {
                            'babylon_user_email': '{{: requester_identity.extra.email | default(None) if requester_identity else None :}}',
                              
                            'babylon_user_fullname': '{{: requester_identity.extra.name | default(None) if requester_identity else None :}}',
                              
                            'babylon_username': '{{: requester_user.metadata.name | default(None) if requester_user else None :}}',
                              
                            'healthy': True,
                            'job_vars': {
                                'guid': "{{: resource_handle.metadata.name[5:] if resource_handle.metadata.name.startswith('guid-') else resource_handle.metadata.name :}}"
                            }
                        }
                    }
                },
                'updateFilters': [
                    {
                        'pathMatch': '/spec/vars/desired_state',
                    }
                ],
                'validation': {
                    'openAPIV3Schema': {
                        'additionalProperties': False,
                        'required': ['spec'],
                        'properties': {
                            'spec': {
                                'type': 'object',
                                'required': ['vars'],
                                'additionalProperties': False,
                                'properties': {
                                    'vars': {
                                        'type': 'object',
                                        'additionalProperties': False,
                                        'properties': {
                                            'desired_state': {
                                                'description': 'Set to "stopped" to immediately stop the environment after provision.',
                                                'x-formLabel': 'Desired State',
                                                'x-formOrder': 9999,
                                                'type': 'string',
                                                'default': 'started',
                                                'enum': ['started', 'stopped'],
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    )


def get_anarchy_governor(name):
    try:
        return custom_objects_api.get_namespaced_custom_object(
            'anarchy.gpte.redhat.com',
            'v1',
            'anarchy-operator',
            'anarchygovernors',
            name
        )
    except kubernetes.client.exceptions.ApiException as e:
        if e.status == 404:
            raise MakeCatalogItemException('AnarchyGovernor {} not found'.format(name))
        else:
            raise

def main():
    argument_parser = argparse.ArgumentParser(
        description='Create Babylon CatalogItem',
    )
    argument_parser.add_argument(
        '--category',
        help='Category label',
        required=True,
        type=str,
    )
    argument_parser.add_argument(
        '--description',
        help='Description',
        type=str,
    )
    argument_parser.add_argument(
        '--display-name',
        help='Display name',
        type=str,
    )
    argument_parser.add_argument(
        '--governor',
        help='AnarchyGovernor name',
        type=str,
    )
    argument_parser.add_argument(
        '--icon',
        help='Icon',
        type=str,
    )
    argument_parser.add_argument(
        '--keywords',
        help='Keywords',
        type=str,
    )
    argument_parser.add_argument(
        '--namespace',
        help='CatalogItem namespace',
        type=str,
    )
    argument_parser.add_argument(
        '--product',
        help='Product label',
        type=str,
    )
    argument_parser.add_argument(
        '--provider',
        help='Provider label, default GPTE',
        type=str,
    )
    argument_parser.add_argument(
        '--provision-history',
        help='JSON data for provision history.',
        type=str,
    )
    argument_parser.add_argument(
        '--rating',
        help='Rating, floating point 0-5. Default randomly assign rating.',
        type=float,
    )
    argument_parser.add_argument(
        'name',
        help='CatalogItem name',
        type=str,
    )
    arguments = argument_parser.parse_args()

    if arguments.provision_history:
        arguments.provision_history = yaml.safe_load(arguments.provision_history)

    try:
        define_catalog_item(**vars(arguments))
    except MakeCatalogItemException as e:
        print('Error: {}'.format(e), file=sys.stderr)

if __name__ == '__main__':
    main()
