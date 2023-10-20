import json
import kopf
import yaml
from copy import deepcopy

from babylon import Babylon
from distutils.util import strtobool
from kopfobject import KopfObject

import jinja2
import kubernetes_asyncio

def merge_dynamic_fields(definition, current_state):
    merged_definition = deepcopy(definition)

    if 'status' in current_state:
        merged_definition['status'] = current_state['status']

    for field in (
        'creationTimestamp',
        'finalizers',
        'generateName',
        'generation',
        'managedFields',
        'resourceVersion',
        'uid',
    ):
        if field in current_state['metadata']:
            merged_definition['metadata'][field] = current_state['metadata'][field]

    return merged_definition

def remove_none_values(dictionary):
    pruned = {}
    for key, val in dictionary.items():
        if val == None:
            continue
        if isinstance(val, dict):
            pruned[key] = remove_none_values(val)
        else:
            pruned[key] = val
    return pruned

def error_if_undefined(result):
    if isinstance(result, jinja2.Undefined):
        result._fail_with_undefined_error()
    else:
        return result

jinja2env = jinja2.Environment(
    finalize = error_if_undefined,
    undefined = jinja2.ChainableUndefined,
)
jinja2env.filters['bool'] = lambda x: bool(strtobool(x)) if isinstance(x, str) else bool(x)

class AgnosticVComponent(KopfObject):
    api_group = Babylon.agnosticv_api_group
    api_version = f"{Babylon.agnosticv_api_group}/{Babylon.agnosticv_version}"
    kind = 'AgnosticVComponent'
    plural = 'agnosticvcomponents'
    version = Babylon.agnosticv_version

    @property
    def __meta__(self):
        return self.spec['definition'].get('__meta__', {})

    @property
    def access_control(self):
        if 'access_control' not in self.__meta__:
            return None
        ret = self.__meta__['access_control']
        # FIXME - agnosticv format should match expected
        if 'allow_groups' in ret:
            ret['allowGroups'] = ret['allow_groups']
            del ret['allow_groups']
        if 'deny_groups' in ret:
            ret['denyGroups'] = ret['deny_groups']
            del ret['deny_groups']
        if 'view_only_groups' in ret:
            ret['viewOnlyGroups'] = ret['view_only_groups']
            del ret['view_only_groups']
        return ret

    @property
    def account(self):
        return self.name.split('.')[0]

    @property
    def agnosticv_repo(self):
        return self.spec['agnosticvRepo']

    @property
    def anarchy(self):
        return self.__meta__.get('anarchy', {})

    @property
    def anarchy_collections(self):
        return self.anarchy.get('collections', [{
            "name": "awx.awx",
            "version": "19.4.0",
        }])

    @property
    def anarchy_governor(self):
        return self.name

    @property
    def anarchy_namespace(self):
        if 'namespace' in self.anarchy:
            return jinja2env.from_string(self.anarchy['namespace']).render(self.template_vars)
        return 'anarchy-operator'

    @property
    def anarchy_remove_finished_actions_after(self):
        return self.anarchy.get('remove_finished_actions_after', '12h')

    @property
    def anarchy_remove_successful_runs_after(self):
        return self.anarchy.get('remove_successful_runs_after', '3h')

    @property
    def anarchy_roles(self):
        return self.anarchy.get('roles', [])

    @property
    def ansible_control_plane(self):
        return self.__meta__.get('ansible_control_plane', {})

    @property
    def ansible_control_plane_secret(self):
        return self.ansible_control_plane.get('secret')

    @property
    def asset_uuid(self):
        return self.__meta__.get('asset_uuid', '')

    @property
    def bookbag(self):
        if 'bookbag' not in self.__meta__:
            return None
        ret = self.__meta__['bookbag']
        # FIXME - agnosticv format should match expected
        if 'openshift_console' in ret:
            ret['openShiftConsole'] = ret['openshift_console']
            del ret['openshift_console']
        return ret

    @property
    def catalog_category(self):
        return self.catalog_meta.get('category', 'Other')

    @property
    def catalog_description(self):
        """
        Return description meta dictionary
        """
        description = self.catalog_meta.get('description', {})
        if isinstance(description, dict):
            return description
        return {}

    @property
    def catalog_description_content(self):
        return self.catalog_description.get('content',
            "Missing description, please add description.adoc or description.html in agnosticv."
        ).rstrip()

    @property
    def catalog_description_format(self):
        return self.catalog_description.get('format', 'asciidoc')

    @property
    def catalog_disable(self):
        if not 'namespace' in self.catalog_meta:
            return True
        return self.catalog_meta.get('disable', False)

    @property
    def catalog_display_name(self):
        return self.catalog_meta.get('display_name', self.name)

    @property
    def catalog_external_url(self):
        return self.catalog_meta.get('externalUrl')

    @property
    def catalog_icon(self):
        # FIXME - default icon dict?
        return self.catalog_meta.get('icon', {})

    @property
    def catalog_item_namespace(self):
        return jinja2env.from_string(self.catalog_meta.get('namespace')).render(self.template_vars)

    @property
    def catalog_keywords(self):
        return self.catalog_meta.get('keywords', [])

    @property
    def catalog_labels(self):
        # Return labels, silently transforming spaces to underscore
        return {
            key.replace(' ', '_'): val.replace(' ', '_')
            for key, val in self.catalog_meta.get('labels', {}).items()
        }

    @property
    def catalog_message_templates(self):
        ret = {}
        for key, value in self.catalog_meta.get('messageTemplates', {}).items():
            value = deepcopy(value)
            if 'outputFormat' not in value:
                value['outputFormat'] = 'html'
            if 'templateFormat' not in value:
                value['templateFormat'] = 'jinja2'
            ret[key] = value
        return ret

    @property
    def catalog_meta(self):
        return self.__meta__.get('catalog', {})

    @property
    def catalog_multiuser(self):
        return self.catalog_meta.get('multiuser', False)

    @property
    def catalog_parameters(self):
        return self.catalog_meta.get('parameters')

    @property
    def catalog_requester_parameters(self):
        return self.catalog_meta.get('requester_parameters')

    @property
    def catalog_terms_of_service(self):
        return self.catalog_meta.get('terms_of_service')

    @property
    def catalog_workshop_ui_disabled(self):
        return self.catalog_meta.get('workshopUiDisabled', False)

    @property
    def definition(self):
        return self.spec['definition']

    @property
    def deployer(self):
        return self.__meta__.get('deployer', {})

    @property
    def deployer_actions(self):
        ret = self.deployer.get('actions', {})
        for action in ('destroy', 'provision', 'start', 'status', 'stop'):
            if action not in ret:
                ret[action] = {}
        return ret

    @property
    def deployer_provision_time_estimate(self):
        return self.deployer_actions['provision'].get('time_estimate')

    @property
    def deployer_type(self):
        return self.deployer.get('type')

    @property
    def last_update(self):
        return self.__meta__.get('last_update')

    @property
    def lifespan(self):
        return self.__meta__.get('lifespan', {})

    @property
    def lifespan_default(self):
        return self.lifespan.get('default', '3d')

    @property
    def lifespan_maximum(self):
        return self.lifespan.get('maximum', '14d')

    @property
    def lifespan_relative_maximum(self):
        return self.lifespan.get('relativeMaximum', '5d')

    @property
    def linked_components(self):
        return [
            LinkedComponent(self, item) for item in self.__meta__.get('components', [])
        ]

    @property
    def path(self):
        return self.spec['path']

    @property
    def pull_request_commit_hash(self):
        return self.spec.get('pullRequestCommitHash')

    @property
    def pull_request_number(self):
        return self.spec.get('pullRequestNumber')

    @property
    def resource_provider_ref(self):
        return {
            "apiVersion": f"{Babylon.resource_broker_api_version}",
            "kind": "ResourceProvider",
            "name": self.name,
            "namespace": Babylon.resource_broker_namespace,
        }

    @property
    def resource_requires_claim(self):
        """
        Provisioning this resource requires a ResourceClaim when the requester must be known.
        """
        if self.catalog_requester_parameters:
            return True
        return False

    @property
    def runtime(self):
        return self.__meta__.get('runtime', {})

    @property
    def runtime_default(self):
        return self.runtime.get('default', '4h')

    @property
    def runtime_maximum(self):
        return self.runtime.get('maximum', '8h')

    @property
    def scheduler(self):
        return self.__meta__.get('scheduler', {})

    @property
    def scheduler_enable(self):
        return self.scheduler.get('enable')

    @property
    def secrets(self):
        return self.__meta__.get('secrets', [])

    @property
    def short_name(self):
        return self.name.split('.')[1]

    @property
    def stage(self):
        return self.name.split('.')[-1]

    @property
    def template_vars(self):
        return {
            "merged_vars": self.definition,
            **self.definition,
            "stage": self.stage,
        }

    def __anarchy_governor_definition(self):
        definition = {
            "apiVersion": Babylon.anarchy_api_version,
            "kind": "AnarchyGovernor",
            "metadata": {
                "annotations": {
                    f"{Babylon.agnosticv_api_group}/last-update": json.dumps(self.last_update),
                },
                "labels": {
                    f"{Babylon.agnosticv_api_group}/asset-uuid": self.asset_uuid,
                },
                "name": self.name,
                "namespace": self.anarchy_namespace,
            },
            "spec": {
                "actions": {},
                "ansibleGalaxyRequirements": {
                    "collections": self.anarchy_collections,
                    "roles": self.anarchy_roles,
                },
                "pythonRequirements": "awscli==1.18.92\npackaging==20.9\npymysql==0.9.3\n",
                "removeFinishedActions": {
                    "after": self.anarchy_remove_finished_actions_after,
                },
                "removeSuccessfulRuns": {
                    "after": self.anarchy_remove_successful_runs_after,
                },
                "subjectEventHandlers": {
                    "create": {
                        "roles": [ {"role": role['name']} for role in self.anarchy_roles ],
                    },
                    "delete": {
                        "roles": [ {"role": role['name']} for role in self.anarchy_roles ],
                    },
                    "update": {
                        "roles": [ {"role": role['name']} for role in self.anarchy_roles ],
                    }
                },
                "vars": {
                    "job_vars": {},
                },
                "varSecrets": [],
            }
        }

        job_vars_from_parameters = set()
        if self.catalog_parameters:
            for parameter in self.catalog_parameters:
                if 'variable' in parameter:
                    job_vars_from_parameters.add(parameter['variable'])
                elif 'annotation' not in parameter:
                    job_vars_from_parameters.add(parameter['name'])

        for variable, value in self.definition.items():
            if variable != '__meta__' and variable not in job_vars_from_parameters:
                definition['spec']['vars']['job_vars'][variable] = value

        pruned_meta = deepcopy(self.__meta__)
        # Remove values injected from AgnosticVRepo from __meta__
        if 'collections' in pruned_meta['anarchy']:
            del pruned_meta['anarchy']['collections']
        if 'roles' in pruned_meta['anarchy']:
            del pruned_meta['anarchy']['roles']
        if not pruned_meta['anarchy']:
            del pruned_meta['anarchy']
        # FIXME - more should be removed from __meta__, really __meta__ should not be passed at all
        definition['spec']['vars']['job_vars']['__meta__'] = pruned_meta

        sandbox_api_actions = pruned_meta.get('sandbox_api', {}).get('actions', {})

        for action_name in ('destroy', 'provision', 'start', 'status', 'stop'):
            action_config = {}

            # __meta__.sandbox_api.actions overrides __meta__.deployer.actions
            if action_name in sandbox_api_actions:
                action_config = sandbox_api_actions[action_name]
            else:
                if action_name in self.deployer_actions:
                    action_config = self.deployer_actions[action_name]
                else:
                    continue

            if action_config.get('disable'):
                continue
            # If action has explicitely enabled=False, skip it
            if action_config.get('enable', True) == False:
                continue

            action_def = {
                "roles": [ {"role": role['name']} for role in self.anarchy_roles ],
                "finishOnSuccessfulRun": True,
                "callbackHandlers": {
                    "complete": {
                        "roles": [ {"role": role['name']} for role in self.anarchy_roles ],
                    }
                }
            }
            if 'time_estimate' in action_config:
                action_def['timeEstimate'] = action_config['time_estimate']
            definition['spec']['actions'][action_name] = action_def

        if self.ansible_control_plane_secret:
            definition['spec']['varSecrets'].append({
                "name": self.ansible_control_plane_secret,
                "var": "babylon_tower",
            })
        else:
            definition['spec']['varSecrets'].append({
                "name": "babylon-tower",
                "var": "babylon_tower",
            })

        for secret in self.secrets:
            # FIXME - This is just bizarre! Why are we configuring the secret where we don't need it?!
            if (secret.get('var') == 'agnostics_mgr_access'
                and not self.scheduler_enable
            ):
                continue

            add_secret = {
                "name": secret['name'].replace('_', '-'),
                "var": secret.get('var', 'job_vars'),
            }
            if 'namespace' in secret:
                add_secret['namespace'] = secret['namespace']
            definition['spec']['varSecrets'].append(add_secret)

        return definition


    def __catalog_item_definition(self):
        namespace = self.catalog_item_namespace

        definition = {
            "apiVersion": Babylon.catalog_api_version,
            "kind": "CatalogItem",
            "metadata": {
                "name": self.name,
                "namespace": namespace,
                "annotations": {
                    # FIXME - These should not be in annotations
                    f"{Babylon.catalog_api_group}/description": self.catalog_description_content,
                    f"{Babylon.catalog_api_group}/descriptionFormat": self.catalog_description_format,
                    f"{Babylon.catalog_api_group}/displayName": self.catalog_display_name,
                    f"{Babylon.catalog_api_group}/keywords": ','.join(self.catalog_keywords),
                },
                "labels": {
                    f"{Babylon.catalog_api_group}/category": self.catalog_category,
                    f"{Babylon.agnosticv_api_group}/asset-uuid": self.asset_uuid,
                },
            },
            "spec": {
                "category": self.catalog_category,
                "description": self.catalog_description,
                "displayName": self.catalog_display_name,
                "keywords": self.catalog_keywords,
                "lastUpdate": self.last_update,
            }
        }

        # FIXME - weird default behavior from agnosticv-operator
        if self.catalog_icon:
            definition['metadata']['annotations'][f"{Babylon.catalog_api_group}/icon"] = json.dumps(self.catalog_icon)
            definition['spec']['icon'] = self.catalog_icon
        else:
            definition['metadata']['annotations'][f"{Babylon.catalog_api_group}/icon"] = ''

        if self.access_control:
            definition['spec']['accessControl'] = self.access_control

        if self.bookbag:
            definition['spec']['bookbag'] = self.bookbag

        for key, value in self.catalog_labels.items():
            definition['metadata']['labels'][f"{Babylon.catalog_api_group}/{key}"] = value

        if self.stage in ('dev', 'test', 'prod', 'event'):
            definition['metadata']['labels'][f"{Babylon.catalog_api_group}/stage"] = self.stage

        if self.catalog_external_url:
            definition['spec']['externalUrl'] = self.catalog_external_url
        else:
            definition['spec']['lifespan'] = {
                "default": self.lifespan_default,
                "maximum": self.lifespan_maximum,
                "relativeMaximum": self.lifespan_relative_maximum,
            }
            definition['spec']['runtime'] = {
                "default": self.runtime_default,
                "maximum": self.runtime_maximum,
            }
            definition['spec']['resources'] = []

            for idx, linked_component in enumerate(self.linked_components):
                if not 'linkedComponents' in definition['spec']:
                    definition['spec']['linkedComponents'] = []

                definition['spec']['linkedComponents'].append({
                    "name": linked_component.name,
                })
                if linked_component.display_name:
                    definition['spec']['linkedComponents'][-1]['displayName'] = linked_component.display_name

                definition['spec']['resources'].append({
                    "name": linked_component.name or linked_component.short_name,
                    "provider": linked_component.resource_provider_ref,
                })

                if linked_component.display_name:
                    definition['metadata']['annotations'][
                        f"{Babylon.catalog_api_group}/displayNameComponent{idx}"
                    ] = linked_component.display_name

            if self.deployer_type:
                definition['spec']['resources'].append({
                    "name": self.short_name,
                    "provider": self.resource_provider_ref,
                })

            if self.catalog_message_templates:
                definition['spec']['messageTemplates'] = self.catalog_message_templates

            if self.catalog_multiuser:
                definition['spec']['multiuser'] = True

            if self.catalog_workshop_ui_disabled:
                definition['spec']['workshopUiDisabled'] = True

            if self.catalog_parameters != None:
                definition['spec']['parameters'] = self.catalog_parameters

            if self.deployer_provision_time_estimate:
                definition['spec']['provisionTimeEstimate'] = self.deployer_provision_time_estimate

            if self.catalog_terms_of_service:
                definition['spec']['termsOfService'] = self.catalog_terms_of_service

        return definition

    def __resource_provider_definition(self):
        definition = {
            "apiVersion": Babylon.resource_broker_api_version,
            "kind": "ResourceProvider",
            "metadata": {
                "annotations": {
                    f"{Babylon.agnosticv_api_group}/last-update": json.dumps(self.last_update),
                },
                "labels": {
                    f"{Babylon.agnosticv_api_group}/asset-uuid": self.asset_uuid,
                },
                "name": self.name,
                "namespace": Babylon.resource_broker_namespace,
            },
            "spec": {
                "default": {
                    "spec": {
                        "vars": {
                            "action_schedule": {
                                "start": "{{ timestamp.utcnow }}",
                                "stop": "{{ timestamp.utcnow.add(resource_provider.spec.override.spec.vars.action_schedule.default_runtime) }}",
                            }
                        }
                    }
                },
                "lifespan": {
                    "default": self.lifespan_default,
                    "maximum": "{% if resource_claim.annotations['demo.redhat.com/open-environment'] | default(false) | bool %}365d{% else %}" + self.lifespan_maximum + "{% endif %}",
                    "relativeMaximum": "{% if resource_claim.annotations['demo.redhat.com/open-environment'] | default(false) | bool %}365d{% else %}" + self.lifespan_relative_maximum + "{% endif %}",
                },
                "matchIgnore": [
                    "/spec/vars/action_schedule(/.*)?",
                ],
                "override": {
                    "apiVersion": f"{Babylon.anarchy_api_version}",
                    "kind": "AnarchySubject",
                    "metadata": {
                        "name": self.name + "-{{ guid }}{% if resource_index | int > 0 or (resource_reference.name | default('')).endswith('-0') %}-{{ resource_index }}{% endif %}",
                        "namespace": self.anarchy_namespace,
                    },
                    "spec": {
                        "governor": self.anarchy_governor,
                        "vars": {
                            "action_schedule": {
                                "default_runtime": self.runtime_default,
                                "maximum_runtime": "{% if resource_claim.annotations['demo.redhat.com/open-environment'] | default(false) | bool %}365d{% else %}" + self.runtime_maximum + "{% endif %}",
                            },
                            "desired_state":
                                # FIXME - clean up syntax for readability.
                                "{%- if 0 < resource_states | map('default', {}, True) | list | json_query(\"length([?!contains(keys(status.towerJobs.provision || `{}`), 'completeTimestamp')])\") -%}\n"
                                "{#- desired_state started until all AnarchySubjects have finished provision -#}\n"
                                "started\n"
                                "{%- elif 0 < resource_templates | json_query(\"length([?spec.vars.action_schedule.start <= '\" ~ now(True, \"%FT%TZ\") ~ \"' && spec.vars.action_schedule.stop > '\" ~ now(True, \"%FT%TZ\") ~ \"'])\") -%}\n"
                                "{#- desired_state started for all if any should be started as determined by action schedule -#}\n"
                                "started\n"
                                "{%- elif 0 < resource_templates | json_query(\"length([?spec.vars.default_desired_state == 'started' && !(spec.vars.action_schedule.start || spec.vars.action_schedule.stop)])\") -%}\n"
                                "{#- desired_state started for all if any should be started as determined by default_desired_state -#}\n"
                                "started\n"
                                "{%- else -%}\n"
                                "stopped\n"
                                "{%- endif -%}",
                            "healthy": True,
                            "job_vars": {
                                "guid": "{{ guid }}{% if resource_index | int > 0 or (resource_reference.name | default('')).endswith('-0') %}-{{ resource_index }}{% endif %}"
                            }
                        },
                    }
                },
                "parameters": [
                    {
                        "name": "start_timestamp",
                        "allowUpdate": True,
                        "default": {
                            "template": "{{ now(true, '%FT%TZ') }}",
                        },
                        "required": True,
                        "validation": {
                            "openAPIV3Schema": {
                                "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$",
                                "type": "string",
                            }
                        }
                    }, {
                        "name": "stop_timestamp",
                        "allowUpdate": True,
                        "default": {
                            "template": "{{ (now(true) + runtime_default | parse_time_interval).strftime('%FT%TZ') }}",
                        },
                        "required": True,
                        "validation": {
                            "openAPIV3Schema": {
                                "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$",
                                "type": "string",
                            }
                        }
                    }
                ],
                "resourceRequiresClaim": self.resource_requires_claim,
                "statusSummaryTemplate": {
                    "provision_data": "{{ resources | default([]) | json_query('[].state.spec.vars.provision_data') | merge_list_of_dicts | object }}",
                    "runtime_default": "{{ runtime_default }}",
                    "runtime_maximum": "{{ runtime_maximum }}",
                    "state":
                        "{%- if 0 < resource_claim.status.provider.validationErrors | default([]) | length -%}\n"
                        "validation-failed\n"
                        "{%- elif 0 < resources | json_query(\"[?state.spec.vars.current_state=='provision-failed']\") | length -%}\n"
                        "provision-failed\n"
                        "{%- elif 0 < resources | json_query(\"[?state.spec.vars.current_state=='provision-error']\") | length -%}\n"
                        "provision-error\n"
                        "{%- elif 0 < resources | json_query(\"[?state.spec.vars.current_state=='provision-canceled']\") | length -%}\n"
                        "provision-canceled\n"
                        "{%- elif 0 < resources | json_query(\"[?state.spec.vars.current_state=='start-failed']\") | length -%}\n"
                        "start-failed\n"
                        "{%- elif 0 < resources | json_query(\"[?state.spec.vars.current_state=='start-error']\") | length -%}\n"
                        "start-error\n"
                        "{%- elif 0 < resources | json_query(\"[?state.spec.vars.current_state=='start-canceled']\") | length -%}\n"
                        "start-canceled\n"
                        "{%- elif 0 < resources | json_query(\"[?state.spec.vars.current_state=='stop-failed']\") | length -%}\n"
                        "stop-failed\n"
                        "{%- elif 0 < resources | json_query(\"[?state.spec.vars.current_state=='stop-error']\") | length -%}\n"
                        "stop-error\n"
                        "{%- elif 0 < resources | json_query(\"[?state.spec.vars.current_state=='stop-canceled']\") | length -%}\n"
                        "stop-canceled\n"
                        "{%- elif 0 < resources | json_query(\"[?state.spec.vars.current_state=='provisioning']\") | length -%}\n"
                        "provisioning\n"
                        "{%- elif 0 < resources | json_query(\"[?state.spec.vars.current_state=='provision-pending']\") | length -%}\n"
                        "provision-pending\n"
                        "{%- elif 0 < resources | json_query(\"[?state.spec.vars.current_state=='stopping']\") | length -%}\n"
                        "stopping\n"
                        "{%- elif 0 < resources | json_query(\"[?state.spec.vars.current_state=='starting']\") | length -%}\n"
                        "starting\n"
                        "{%- elif 0 < resources | json_query(\"[?state.spec.vars.current_state=='stop-pending']\") | length -%}\n"
                        "stop-pending\n"
                        "{%- elif 0 < resources | json_query(\"[?state.spec.vars.current_state=='start-pending']\") | length -%}\n"
                        "start-pending\n"
                        "{%- elif resources | length != resources | json_query(\"[?state.spec.vars && !contains(keys(state.spec.vars), 'current_state')]\") | length -%}\n"
                        "initalizing\n"
                        "{%- elif resources | length != resources | json_query(\"[?state]\") | length -%}\n"
                        "requested\n"
                        "{%- elif start_timestamp | default('1970-01-01T00:00:00Z') <= now(true, '%FT%TZ') and stop_timestamp | default('1970-01-01T00:00:00Z') > now(true, '%FT%TZ') -%}\n"
                        "{%-   if resources | length == resources | json_query(\"[?state.spec.vars.current_state=='started']\") | length -%}\n"
                        "started\n"
                        "{%-   else -%}\n"
                        "start-scheduled\n"
                        "{%-   endif -%}\n"
                        "{%- else -%}\n"
                        "{%-   if resources | length == resources | json_query(\"[?state.spec.vars.current_state=='stopped']\") | length -%}\n"
                        "stopped\n"
                        "{%-   else -%}\n"
                        "stop-scheduled\n"
                        "{%-   endif -%}\n"
                        "{%- endif -%}"
                },
                "template": {
                    "definition": {
                        "spec": {
                            "vars": {
                                "action_schedule": {
                                    "start": "{{ start_timestamp | default(omit) }}",
                                    "stop": "{{ stop_timestamp | default(omit) }}",
                                }
                            }
                        }
                    },
                    "enable": True,
                },
                "updateFilters": [
                    {
                        "pathMatch": "/spec/vars/action_schedule/.*",
                        "allowedOps": ["add", "replace"],
                    }, {
                        "pathMatch": "/spec/vars/desired_state",
                        "allowedOps": ["add", "replace"],
                    },
                ],
                "validation": {
                    "openAPIV3Schema": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["spec"],
                        "properties": {
                            "spec": {
                                "type": "object",
                                "additionalProperties": False,
                                "required": ["vars"],
                                "properties": {
                                    "vars": {
                                        "type": "object",
                                        "additionalProperties": False,
                                        "properties": {
                                            "action_schedule": {
                                                "type": "object",
                                                "additionalProperties": False,
                                                "properties": {
                                                    "start": {
                                                        "type": "string",
                                                        "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$",
                                                    },
                                                    "stop": {
                                                        "type": "string",
                                                        "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$",
                                                    }
                                                }
                                            },
                                            "check_status_request_timestamp": {
                                                "type": "string",
                                                "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$",
                                            },
                                            "job_vars": {
                                                "type": "object",
                                                "additionalProperties": False,
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                "vars": {
                    "runtime_default": self.runtime_default,
                    "runtime_maximum": self.runtime_maximum,
                }
            }
        }

        if not self.catalog_disable:
            definition['metadata']['labels'][f"{Babylon.catalog_api_group}/catalogItemName"] = self.name
            definition['metadata']['labels'][f"{Babylon.catalog_api_group}/catalogItemNamespace"] = self.catalog_item_namespace
            definition['spec']['statusSummaryTemplate']['catalog_item_name'] = self.name
            definition['spec']['statusSummaryTemplate']['catalog_item_namespace'] = self.catalog_item_namespace

        for idx, linked_component in enumerate(self.linked_components):
            definition['spec'].setdefault('linkedResourceProviders', []).append({
                "name": linked_component.component_name,
                "waitFor": f"current_state_{idx} == 'started'",
                "parameterValues": {
                    "runtime_default": "{{ runtime_default }}",
                    "runtime_maximum": "{{ runtime_maximum }}",
                },
                "templateVars": [
                    {
                        "name": f"current_state_{idx}",
                        "from": "/spec/vars/current_state",
                    }, {
                        "name": f"provision_data_{idx}",
                        "from": "/spec/vars/provision_data",
                    }
                ]
            })

            for item in linked_component.propagate_provision_data:
                if item.name:
                    definition['spec']['override']['spec']['vars']['job_vars'][item.var] = '{{ provision_data_' + str(idx) + '.' + item.name + '}}'
                else:
                    definition['spec']['override']['spec']['vars']['job_vars'][item.var] = '{{ provision_data_' + str(idx) + ' | object }}'

        if self.catalog_requester_parameters:
            for rp in self.catalog_requester_parameters:
                definition['spec']['override']['spec']['vars']['job_vars'][rp['name']] = rp['value']

        # Allow requesting status checks if not explicitly disabled
        if not self.deployer_actions['status'].get('disable'):
            definition['spec']['updateFilters'].append({
                "pathMatch": "/spec/vars/check_status_request_timestamp",
                "allowedOps": ["add", "replace"],
            })

        if self.catalog_parameters:
            open_api_schema_job_vars = definition['spec']['validation']['openAPIV3Schema']['properties']['spec']['properties']['vars']['properties']['job_vars']
            for parameter in self.catalog_parameters:
                resource_broker_parameter = {
                    'name': parameter['name'],
                    'allowUpdate': parameter.get('allowUpdate', False),
                    'required': parameter.get('required', False),
                }
                if 'openAPIV3Schema' in parameter:
                    resource_broker_parameter.setdefault('validation', {})['openAPIV3Schema'] = parameter['openAPIV3Schema']

                definition['spec']['parameters'].append(resource_broker_parameter)

                # FIXME - resource indexes is a clumsy way to configure parameters

                # '@' in resource indexes means current resource. Other values reference
                # linked resource providers.
                resource_indexes = parameter.get('resourceIndexes', ['@'])
                current_resource_index = len(self.linked_components)

                # Configure parameter propagation to linked components
                for resource_index in resource_indexes:
                    if resource_index == '@' or resource_index == current_resource_index:
                        continue
                    definition['spec']['linkedResourceProviders'][resource_index]['parameterValues'][parameter['name']] = '{{' + parameter['name'] + ' | object }}'

                # Below here is customization for how the parameter value is used to manage the
                # resource for this provider. Some parameters may only be used to propagate to
                # other linked providers.
                if '@' not in resource_indexes and current_resource_index not in resource_indexes:
                    continue

                # Skip annotation only parameters in template generation and validation
                if 'annotation' in parameter and 'variable' not in parameter:
                    continue

                open_api_schema_job_vars.setdefault('properties', {})
                open_api_schema_job_vars.setdefault('required', [])
                variable = parameter.get('variable', parameter['name'])
                default = None
                parameter_open_api_schema = parameter.get('openAPIV3Schema', {})
                if 'default' in parameter_open_api_schema:
                    default = parameter_open_api_schema['default']
                if 'description' in parameter:
                    parameter_open_api_schema['description'] = parameter['description']
                open_api_schema_job_vars['properties'][variable] = parameter_open_api_schema
                if parameter.get('required'):
                    open_api_schema_job_vars['required'].append(variable)
                if parameter.get('allowUpdate'):
                    definition['spec']['updateFilters'].append({
                        "pathMatch": f"/spec/vars/job_vars/{variable}(/.*)?"
                    })

                definition['spec']['template']['definition'].setdefault(
                    'spec', {}
                ).setdefault(
                    'vars', {}
                ).setdefault(
                    'job_vars', {}
                )[variable] = '{{ ' + parameter['name'] + ' | default(omit) | object }}'

        return definition

    async def __create_catalog_item(self, definition, logger):
        name = definition['metadata']['name']
        namespace = definition['metadata']['namespace']
        await Babylon.custom_objects_api.create_namespaced_custom_object(
            body = definition,
            group = Babylon.catalog_api_group,
            namespace = namespace,
            plural = 'catalogitems',
            version = Babylon.catalog_version,
        )
        logger.info(f"Created CatalogItem {name} in {namespace}")

    async def __create_anarchy_governor(self, definition, logger):
        name = definition['metadata']['name']
        namespace = definition['metadata']['namespace']
        await Babylon.custom_objects_api.create_namespaced_custom_object(
            body = definition,
            group = Babylon.anarchy_api_group,
            namespace = namespace,
            plural = 'anarchygovernors',
            version = Babylon.anarchy_version,
        )
        logger.info(f"Created AnarchyGovernor {name} in {namespace}")

    async def __create_resource_provider(self, definition, logger):
        await Babylon.custom_objects_api.create_namespaced_custom_object(
            body = definition,
            group = Babylon.resource_broker_api_group,
            namespace = Babylon.resource_broker_namespace,
            plural = 'resourceproviders',
            version = Babylon.resource_broker_version,
        )
        logger.info(f"Created ResourceProvider {self.name}")

    async def __delete_anarchy_governor(self, logger):
        # FIXME - add delete handling
        pass

    async def __delete_catalog_item(self, logger):
        # FIXME - add delete handling
        pass

    async def __delete_resource_provider(self, logger):
        # FIXME - add delete handling
        pass

    async def __manage_anarchy_governor(self, logger, retries=5):
        # FIXME - catalog_meta should not impact anarchy governor creation.
        if not self.deployer_type or not self.catalog_meta or self.catalog_meta.get('disable'):
            await self.__delete_anarchy_governor(logger=logger)
            return

        definition = self.__anarchy_governor_definition()
        current_state = None
        try:
            current_state = await Babylon.custom_objects_api.get_namespaced_custom_object(
                group = Babylon.anarchy_api_group,
                name = definition['metadata']['name'],
                namespace = definition['metadata']['namespace'],
                plural = 'anarchygovernors',
                version = Babylon.anarchy_version,
            )
        except kubernetes_asyncio.client.rest.ApiException as e:
            if e.status != 404:
                raise

        if current_state:
            await self.__update_anarchy_governor(
                current_state = current_state,
                definition = definition,
                logger = logger,
                retries = retries,
            )
        else:
            await self.__create_anarchy_governor(
                definition = definition,
                logger = logger,
            )

    async def __manage_catalog_item(self, logger, retries=5):
        if self.catalog_disable:
            await self.__delete_catalog_item(logger=logger)
            return

        definition = self.__catalog_item_definition()
        current_state = None
        try:
            current_state = await Babylon.custom_objects_api.get_namespaced_custom_object(
                group = Babylon.catalog_api_group,
                name = definition['metadata']['name'],
                namespace = definition['metadata']['namespace'],
                plural = 'catalogitems',
                version = Babylon.catalog_version,
            )
        except kubernetes_asyncio.client.rest.ApiException as e:
            if e.status != 404:
                raise

        if current_state:
            await self.__update_catalog_item(
                current_state = current_state,
                definition = definition,
                logger = logger,
                retries = retries,
            )
        else:
            await self.__create_catalog_item(
                definition = definition,
                logger = logger,
            )

    async def __manage_resource_provider(self, logger, retries=5):
        # FIXME - catalog_meta should not impact resource provider creation.
        # FIXME - deployer_type should not impact resource provider creation.
        if not self.deployer_type or not self.catalog_meta or self.catalog_meta.get('disable'):
            await self.__delete_resource_provider(logger=logger)
            return

        definition = self.__resource_provider_definition()

        current_state = None
        try:
            current_state = await Babylon.custom_objects_api.get_namespaced_custom_object(
                group = Babylon.resource_broker_api_group,
                name = self.name,
                namespace = Babylon.resource_broker_namespace,
                plural = 'resourceproviders',
                version = Babylon.resource_broker_version,
            )
        except kubernetes_asyncio.client.rest.ApiException as e:
            if e.status != 404:
                raise

        if current_state:
            await self.__update_resource_provider(
                current_state = current_state,
                definition = definition,
                logger = logger,
                retries = retries,
            )
        else:
            await self.__create_resource_provider(
                definition = definition,
                logger = logger,
            )

    async def __update_anarchy_governor(self, current_state, definition, logger, retries):
        name = definition['metadata']['name']
        namespace = definition['metadata']['namespace']

        if 'deletionTimestamp' in current_state['metadata']:
            raise kopf.TemporaryError(
                f"Unable to update AnarchyGovernor {name} in {namespace} because it is being deleted.",
                delay=10
            )

        merged_definition = merge_dynamic_fields(definition, current_state)
        merged_definition['metadata'].setdefault('annotations', {})[Babylon.last_update_annotation] = json.dumps(self.last_update)

        # FIXME - agnosticv-operator handling of None/null was unpredictable
        if remove_none_values(merged_definition) == remove_none_values(current_state):
            logger.debug("AnarchyGovernor {name} in {namespace} is unchaged.")
            return

        logger.info(f"Updating AnarchyGovernor {name} in {namespace}")
        try:
            await Babylon.custom_objects_api.replace_namespaced_custom_object(
                body = merged_definition,
                group = Babylon.anarchy_api_group,
                name = name,
                namespace = namespace,
                plural = 'anarchygovernors',
                version = Babylon.anarchy_version,
            )
        except kubernetes_asyncio.client.rest.ApiException as e:
            if e.status == 404:
                await self.__create_anarchy_governor(definition=definition, logger=logger)
            elif e.status == 409:
                if retries:
                    await self.__manage_anarchy_governor(logger=logger, retries=retries-1)
                else:
                    raise kopf.TemporaryError(
                        f"Failed to update AnarchyGovernor {name} in {namespace}: 409 conflict",
                        delay=60,
                    )
            else:
                raise

    async def __update_catalog_item(self, current_state, definition, logger, retries):
        catalog_item_name = definition['metadata']['name']
        catalog_item_namespace = definition['metadata']['namespace']

        if 'deletionTimestamp' in current_state['metadata']:
            raise kopf.TemporaryError(
                f"Unable to update CatalogItem {catalog_item_name} in "
                f"{catalog_item_namespace} because it is being deleted.",
                delay=10
            )

        merged_definition = merge_dynamic_fields(definition, current_state)

        # Preserve annotation values
        for annotation, value in current_state['metadata'].get('annotations', {}).items():
            if (
                not annotation.startswith(f"{Babylon.catalog_api_group}/") or
                annotation in (
                    "babylon.gpte.redhat.com/ops",
                    "babylon.gpte.redhat.com/totalRatings",
                )
            ):
                merged_definition['metadata']['annotations'][annotation] = value

        # Preserve label values
        for label, value in current_state['metadata'].get('labels', {}).items():
            if (
                not label.startswith(f"{Babylon.catalog_api_group}/") or
                label in (
                    "babylon.gpte.redhat.com/rating",
                    "babylon.gpte.redhat.com/disabled",
                )
            ):
                merged_definition['metadata']['labels'][label] = value

        if merged_definition == current_state:
            logger.debug("CatalogItem {catalog_item_name} in {catalog_item_namespace} is unchaged.")
            return

        logger.info(f"Updating CatalogItem {catalog_item_name} in {catalog_item_namespace}")
        try:
            await Babylon.custom_objects_api.replace_namespaced_custom_object(
                body = merged_definition,
                group = Babylon.catalog_api_group,
                name = catalog_item_name,
                namespace = catalog_item_namespace,
                plural = 'catalogitems',
                version = Babylon.catalog_version,
            )
        except kubernetes_asyncio.client.rest.ApiException as e:
            if e.status == 404:
                await self.__create_catalog_item(definition=definition, logger=logger)
            elif e.status == 409:
                if retries:
                    await self.__manage_catalog_item(logger=logger, retries=retries-1)
                else:
                    raise kopf.TemporaryError(
                        f"Failed to update CatalogItem {catalog_item_name} in "
                        f"{catalog_item_namespace}: 409 conflict",
                        delay=60,
                    )
            else:
                raise

    async def __update_resource_provider(self, current_state, definition, logger, retries):
        merged_definition = merge_dynamic_fields(definition, current_state)
        merged_definition['metadata'].setdefault('annotations', {})[Babylon.last_update_annotation] = json.dumps(self.last_update)

        if merged_definition == current_state:
            logger.debug("ResourceProvider {self.name} is unchanged.")
            return

        # FIXME - Add last updated information into annotation

        logger.info(f"Updating ResourceProvider {self.name}")
        try:
            await Babylon.custom_objects_api.replace_namespaced_custom_object(
                body = merged_definition,
                group = Babylon.resource_broker_api_group,
                name = self.name,
                namespace = Babylon.resource_broker_namespace,
                plural = 'resourceproviders',
                version = Babylon.resource_broker_version,
            )
        except kubernetes_asyncio.client.rest.ApiException as e:
            if e.status == 404:
                await self.__create_resource_provider(definition=definition, logger=logger)
            elif e.status == 409:
                if retries:
                    await self.__manage_resource_provider(logger=logger, retries=retries-1)
                else:
                    raise kopf.TemporaryError(
                        f"Failed to update ResourceProvider {self.name}: 409 conflict",
                        delay=60,
                    )
            else:
                raise

    async def handle_create(self, logger):
        await self.manage_config(logger=logger)

    async def handle_delete(self, logger):
        # FIXME - Implement delete
        pass

    async def handle_resume(self, logger):
        await self.manage_config(logger=logger)

    async def handle_update(self, logger):
        await self.manage_config(logger=logger)

    async def manage_config(self, logger):
        await self.__manage_catalog_item(logger=logger)
        if not self.catalog_external_url:
            await self.__manage_anarchy_governor(logger=logger)
            await self.__manage_resource_provider(logger=logger)


class LinkedComponent:
    def __init__(self, parent, definition):
        self.item = definition.get('item')
        self.display_name = definition.get('display_name')
        self.name = definition.get('name')
        self.propagate_provision_data = [
            PropagateProvisionDataItem(item) for item in definition.get('propagate_provision_data', [])
        ]

        # FIXME - this will be a nice feature, but need strict agnosticv-operator compatibility
        component_name_parts = [part.lower().replace('_', '-') for part in self.item.split('/')]
        #if len(component_name_parts) == 1:
        #    component_name_parts.insert(0, parent.account)
        #if len(component_name_parts) == 2:
        #    component_name_parts.append(parent.stage)
        #self.component_name = '.'.join(component_name_parts)
        self.component_name = self.item.lower().replace('/', '.').replace('_', '-') + "." + parent.stage

        self.short_name = component_name_parts[1]

    @property
    def resource_provider_ref(self):
        return {
            "apiVersion": f"{Babylon.resource_broker_api_version}",
            "kind": "ResourceProvider",
            "name": self.component_name,
            "namespace": Babylon.resource_broker_namespace,
        }


class PropagateProvisionDataItem:
    def __init__(self, definition):
        self.name = definition.get('name')
        self.var = definition['var']
