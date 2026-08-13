from __future__ import annotations
from copy import deepcopy

import json

from typing import List, Mapping

from .k8s_object import K8sObject
from .agnosticvrepo import AgnosticVRepo
from .anarchygovernor import AnarchyGovernor
from .anarchysubject import AnarchySubject
from .catalogitem import CatalogItem
from .poolboy_templating import jinja2process
from .resourceprovider import ResourceProvider
from .resourcereference import ResourceReference
from .tenantclusterpool import TenantClusterPool

CATALOG_ACTION_NAMES = ('destroy', 'provision', 'start', 'status', 'stop')

class AgnosticVComponent(K8sObject):
    api_group = "gpte.redhat.com"
    api_version = "v1"
    kind = "AgnosticVComponent"
    plural = "agnosticvcomponents"
    api_group_version = f"{api_group}/{api_version}"

    @property
    def __meta__(self) -> Mapping:
        """Return __meta__ from AgnosticV vars"""
        return self.definition.get('__meta__', {})

    @property
    def __template_vars(self) -> Mapping:
        """Return jinja template vars use to evaluate template strings in
        component definition"""
        return {
            "asset_uuid": self.asset_uuid,
            "merged_vars": self.definition,
            **self.definition,
            "stage": self.stage,
        }

    @property
    def access_control(self) -> Mapping|None:
        if 'access_control' not in self.__meta__:
            return None
        ret = deepcopy(self.__meta__['access_control'])
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
    def account(self) -> str:
        """Return "account". This is defined as the first portion of the name.
        For example, "tests.test-empty-config.prod" has account "tests"
        """
        return self.name.split('.')[0]

    @property
    def agnosticv_repo_name(self) -> str:
        return self.spec.agnosticv_repo

    @property
    def anarchy_collections(self):
        """Return anarchy collections for ansible galaxy requirements"""
        return self.__meta__.get('anarchy', {}).get('collections', [{
            "name": "awx.awx",
            "version": "24.6.1",
        }])

    @property
    def anarchy_remove_finished_actions_after(self):
        """Return configuration for how long to keep finished AnarchyActions.
        Default 12h"""
        return self.__meta__.get('anarchy', {}).get('remove_finished_actions_after', '12h')

    @property
    def anarchy_remove_successful_runs_after(self):
        """Return configuration for how long to keep finished AnarchyRuns.
        Default 3h"""
        return self.__meta__.get('anarchy', {}).get('remove_successful_runs_after', '3h')

    @property
    def anarchy_roles(self) -> str:
        """Return anarchy roles for ansible galaxy requirements"""
        return self.__meta__.get('anarchy', {}).get('roles', [])

    @property
    def ansible_control_plane_secret(self):
        return self.__meta__.get('ansible_control_plane', {}).get('secret')

    @property
    def asset_uuid(self) -> str|None:
        """Return asset uuid"""
        return self.__meta__.get('asset_uuid')

    @property
    def catalog_category(self) -> str:
        """Return catalog category with default"""
        return self.__meta__.get('catalog', {}).get('category', 'Other')

    @property
    def catalog_description_content(self) -> str:
        """Return catalog description content with default"""
        return self.__meta__.get(
            "catalog", {}
        ).get(
            "description", {}
        ).get(
            "content",
            "Missing description, please add description.adoc or description.html in agnosticv."
        ).rstrip()

    @property
    def catalog_description_format(self) -> str:
        """Return catalog description format with default"""
        return self.__meta__.get(
            "catalog", {}
        ).get(
            "description", {}
        ).get(
            "format", "asciidoc"
        )

    @property
    def catalog_disable(self) -> bool:
        catalog_meta = self.__meta__.get('catalog')
        if catalog_meta is None:
            return True
        if 'namespace' not in catalog_meta:
            return True
        return catalog_meta.get('disable', False)

    @property
    def catalog_display_name(self):
        """Return display name with default"""
        return self.__meta__.get('catalog', {}).get('display_name', self.name)

    @property
    def catalog_email_from(self) -> str|None:
        return self.__meta__.get('catalog', {}).get('email', {}).get('from')

    @property
    def catalog_external_url(self) -> str|None:
        return self.__meta__.get('catalog', {}).get('externalUrl')

    @property
    def catalog_icon(self) -> dict:
        # FIXME - default icon dict?
        return self.__meta__.get('catalog', {}).get('icon', {})

    @property
    def catalog_item_namespace(self) -> str:
        """Return namespace in which to create CatalogItem object."""
        return jinja2process(
            self.__meta__.get('catalog', {}).get('namespace'),
            variables=self.__template_vars,
        )

    @property
    def catalog_keywords(self) -> List[str]:
        """Return list of catalog keywords with empty list default"""
        return self.__meta__.get('catalog', {}).get('keywords', [])

    @property
    def catalog_labels(self) -> Mapping[str, str]:
        """Return labels, silently transforming spaces to underscore"""
        labels = self.__meta__.get('catalog', {}).get('labels', {})
        return {
            key.replace(' ', '_'): val.replace(' ', '_')
            for key, val in labels.items()
        }

    @property
    def catalog_message_templates(self):
        ret = {}
        for key, value in self.__meta__.get('catalog', {}).get('messageTemplates', {}).items():
            value = deepcopy(value)
            if 'outputFormat' not in value:
                value['outputFormat'] = 'html'
            if 'templateFormat' not in value:
                value['templateFormat'] = 'jinja2'
            ret[key] = value
        return ret

    @property
    def catalog_multiuser(self) -> bool:
        """Deprecated flag to indicate workshop user mode.
        Single and multi user is considered "multiuser" because they both report `users`."""
        return self.catalog_workshop_user_mode != 'none'

    @property
    def catalog_num_users_parameter(self) -> str:
        """Which catalog parameter controls number of workshop user seats provisioned
        when workshop_user_mode is 'multi'."""
        if self.catalog_workshop_user_mode != "multi":
            return None
        return self.__meta__.get('catalog', {}).get('num_users_parameter', 'num_users')

    @property
    def catalog_parameters(self) -> List[Mapping]|None:
        return self.__meta__.get('catalog', {}).get('parameters')

    @property
    def catalog_requester_parameters(self):
        return self.__meta__.get('catalog', {}).get('requester_parameters', [])

    @property
    def catalog_support_link(self):
        return self.__meta__.get('catalog', {}).get('supportLink')

    @property
    def catalog_terms_of_service(self) -> str|None:
        return self.__meta__.get('catalog', {}).get('terms_of_service')

    @property
    def catalog_workshop_lab_ui_redirect(self) -> bool:
        return self.__meta__.get('catalog', {}).get('workshopLabUiRedirect', False)

    @property
    def catalog_workshop_ui_disabled(self):
        return self.__meta__.get('catalog', {}).get('workshopUiDisabled', False)

    @property
    def catalog_workshop_ui_enabled_by_default(self):
        return self.__meta__.get('catalog', {}).get('workshopUiEnabledByDefault', False)

    @property
    def catalog_workshop_ui_max_instances(self):
        return self.__meta__.get('catalog', {}).get('workshopUiMaxInstances', 30)

    @property
    def catalog_workshop_user_mode(self) -> str:
        """Return workshop user mode which ay be:

        "multi" - Multiple users may be provisioned and controlled with `num_users` parameter.
        "single" - Workshop provisions with a single user reported with `agnosticd_user_info`.
        "none" - Provision should not report users. If used in a workshop the environment itself is a workshop seat."""
        catalog_meta = self.__meta__.get('catalog', {})
        # Check if explicitly declared.
        if 'workshop_user_mode' in catalog_meta:
            return catalog_meta['workshop_user_mode']
        # Fallback to deprecated multiuser boolean
        if catalog_meta.get('multiuser'):
            return "multi"
        # Otherwise default to "none"
        return "none"

    @property
    def definition(self) -> Mapping:
        """Return merged vars from AgnosticV"""
        return self.spec.definition

    @property
    def deployer_actions(self):
        ret = {
            **self.__meta__.get('deployer', {}).get('actions', {})
        }
        for action in CATALOG_ACTION_NAMES:
            if action not in ret:
                ret[action] = {}
        return ret

    @property
    def deployer_provision_time_estimate(self):
        return self.deployer_actions['provision'].get('time_estimate')

    @property
    def deployer_type(self) -> str|None:
        return self.__meta__.get('deployer', {}).get('type')

    @property
    def deprecated_anarchy_governors(self) -> List[AgnosticVComponentStatusAnarchyGovernor]:
        """Return deprecated anarchy governors from status or None
        if `deprecatedAnarchyGovernors` not present in status.

        These represent AnarchyGovernors that were created for this
        AgnosticVComponent in a different namespace than currently configured.
        These AnarchyGovernors should be cleaned up and deleted once no
        AnarchySubjects still reference these.
        """
        if 'status' not in self._definition:
            return []
        return self.status.deprecated_anarchy_governors or []

    @property
    def last_update(self) -> Mapping|None:
        return self.__meta__.get('last_update')

    @property
    def lifespan_default(self) -> str:
        return self.__meta__.get('lifespan', {}).get('default', '3d')

    @property
    def lifespan_maximum(self) -> str:
        return self.__meta__.get('lifespan', {}).get('maximum', '14d')

    @property
    def lifespan_relative_maximum(self) -> str:
        return self.__meta__.get('lifespan', {}).get('relativeMaximum', '5d')

    @property
    def linked_components(self) -> List[AgnosticVLinkedComponent]:
        """List of linked AgnosticVComponents.
        Returns a possibly empty list of AgnosticVLinkedComponent objects which
        describe how this component is associated to other
        AgnosticVLinkedComponents"""
        return [
            AgnosticVLinkedComponent(self, item)
            for item in self.__meta__.get('components', [])
        ]

    @property
    def owners(self):
        return self.__meta__.get('owners', {})

    @property
    def path(self):
        """Return path of AgnosticVComponent within AgnosticV repository."""
        return self.spec.path

    @property
    def pull_request_commit_hash(self) -> str|None:
        """Return pull request commit hash source for AgnosticVComponent or None
        if not managed by a pull request."""
        return self.spec.pull_request_commit_hash

    @property
    def pull_request_number(self) -> int|None:
        """Return pull request number source for AgnosticVComponent or None
        if not managed by a pull request."""
        return self.spec.pull_request_number

    @property
    def reporting_labels(self) -> Mapping[str, str]:
        """Return reporting labels, silently transforming spaces to underscore"""
        labels = self.__meta__.get('reporting', {}).get('labels', {})
        return {
            key.replace(' ', '_'): val.replace(' ', '_')
            for key, val in labels.items()
        }

    @property
    def resource_provider_ref(self) -> Mapping[str,str]:
        return {
            "apiVersion": "poolboy.gpte.redhat.com/v1",
            "kind": "ResourceProvider",
            "name": self.name,
            "namespace": "poolboy",
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
    def runtime_default(self) -> str:
        return self.__meta__.get('runtime', {}).get('default', '4h')

    @property
    def runtime_maximum(self) -> str:
        return self.__meta__.get('runtime', {}).get('maximum', '8h')

    @property
    def scheduler_enable(self):
        return self.__meta__.get('scheduler', {}).get('enable')

    @property
    def secrets(self):
        return self.__meta__.get('secrets', [])

    @property
    def short_name(self):
        """Return "stage". This is defined as the middle portion of the name.
        For example, "tests.test-empty-config.prod" has short name test-empty-config.
        """
        return self.name.split('.')[1]

    @property
    def spec(self) -> AgnosticVComponentSpec:
        """Return AgnosticVComponentSpec"""
        return AgnosticVComponentSpec(self._definition['spec'])

    @property
    def stage(self) -> str:
        """Return "stage". This is defined as the last portion of the name.
        For example, "tests.test-empty-config.prod" has stage "prod"
        """
        return self.name.split('.')[-1]

    @property
    def status(self) -> AgnosticVComponentStatus|None:
        """Return AgnosticVComponentSpec"""
        if 'status' not in self._definition:
            return None
        return AgnosticVComponentStatus(self._definition['status'])

    @property
    def supported_actions(self) -> Mapping:
        ret = {}
        for action_name in CATALOG_ACTION_NAMES:
            if not self.check_action_enabled(action_name):
                continue
            deployer_action_config = self.__meta__.get('deployer', {}).get('actions', {}).get(action_name, {})
            action_entry = {}
            if 'time_estimate' in deployer_action_config:
                action_entry['timeEstimate'] = deployer_action_config['time_estimate']
            ret[action_name] = action_entry
        return ret

    @property
    def zerotouch_access(self) -> Mapping|None:
        return self.__meta__.get('zerotouchAccess')

    def check_action_enabled(self, action_name) -> bool:
        """Check if action is enabled for deployer or sandbox api"""
        meta = self.__meta__
        deployer_action_config = meta.get('deployer', {}).get('actions', {}).get(action_name, {})
        sandbox_action_config = meta.get('sandbox_api', {}).get('actions', {}).get(action_name, {})
        if deployer_action_config.get('disable', False) and not sandbox_action_config.get('enable', False):
            return False
        return True

    def get_anarchy_governor_definition(self,
        environment_level: str,
    ) -> Mapping|None:
        """Get AnarchyGovernor definition
        Return None if item is configured without a deployer."""
        # FIXME - catalog_meta should not impact anarchy governor creation.
        if not self.deployer_type or self.asset_uuid is None or self.catalog_disable or self.catalog_external_url is not None:
            return None

        anarchy_namespace = self.get_anarchy_namespace()
        
        definition = {
            "apiVersion": AnarchyGovernor.api_group_version,
            "kind": AnarchyGovernor.kind,
            "metadata": {
                "annotations": {
                    "gpte.redhat.com/last-update": json.dumps(self.last_update),
                },
                "labels": {
                    "gpte.redhat.com/asset-uuid": self.asset_uuid,
                },
                "name": self.name,
                "namespace": anarchy_namespace,
            },
            "spec": {
                "actions": {},
                "ansibleGalaxyRequirements": {
                    "collections": self.anarchy_collections,
                    "roles": self.anarchy_roles,
                },
                # awscli: (deprecated) legacy interaction with sandbox database
                # packaging: for version comparison with git_tag_prefix
                "pythonRequirements": "awscli==1.42.56\npackaging==25.0\n",
                "removeFinishedActions": {
                    "after": self.anarchy_remove_finished_actions_after,
                },
                "removeSuccessfulRuns": {
                    "after": self.anarchy_remove_successful_runs_after,
                },
                "subjectEventHandlers": {
                    "create": {
                        "roles": [
                            {"role": role['name']} for role in self.anarchy_roles
                        ],
                    },
                    "delete": {
                        "roles": [
                            {"role": role['name']} for role in self.anarchy_roles
                        ],
                    },
                    "update": {
                        "roles": [
                            {"role": role['name']} for role in self.anarchy_roles
                        ],
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

        # Add environment_level cloud_selctor for OcpSandboxes provided by tenant clusters
        if 'sandboxes' in pruned_meta:
            for item in pruned_meta['sandboxes']:
                if (
                    item.get('kind') == 'OcpSandbox' and
                    'lab' in item.get('cloud_selector', {})
                ):
                    item['cloud_selector']['environment_level'] = environment_level

        # FIXME - more should be removed from __meta__, really __meta__ should not be passed at all
        definition['spec']['vars']['job_vars']['__meta__'] = pruned_meta

        for action_name in CATALOG_ACTION_NAMES:
            if not self.check_action_enabled(action_name):
                continue
            deployer_action_config = self.deployer_actions.get(action_name)

            action_def = {
                "roles": [
                    {"role": role['name']} for role in self.anarchy_roles
                ],
                "finishOnSuccessfulRun": True,
                "callbackHandlers": {
                    "complete": {
                        "roles": [
                            {"role": role['name']} for role in self.anarchy_roles
                        ],
                    }
                }
            }
            if 'time_estimate' in deployer_action_config:
                action_def['timeEstimate'] = deployer_action_config['time_estimate']
            definition['spec']['actions'][action_name] = action_def

        # FIXME - this should likely just be removed in favor of always dynamically finding tower secret
        if self.ansible_control_plane_secret:
            definition['spec']['varSecrets'].append({
                "name": self.ansible_control_plane_secret,
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

    def get_anarchy_namespace(self) -> str:
        """Return anarchy namespace which will be used if this component owns
        an AnarchyGovernor"""

        # Get template string from anarchy metadata
        template_str = self.definition.get('__meta__', {}).get('anarchy', {}).get('namespace')

        # Anarchy namespace should really always be defined, but fallback to
        # anarchy-operator as default
        if template_str is None:
            return 'anarchy-operator'

        return jinja2process(template_str, variables=self.__template_vars)

    def get_catalog_item_definition(self,
        agnosticv_repo: AgnosticVRepo,
        linked_agnosticv_components: List[AgnosticVComponent],
    ) -> Mapping|None:
        """Get CatalogItem definition from AgnosticV component.
        Return None if catalog is disabled."""
        if self.asset_uuid is None or self.catalog_disable:
            return None
        
        definition = {
            "apiVersion": CatalogItem.api_group_version,
            "kind": CatalogItem.kind,
            "metadata": {
                "annotations": {
                    # FIXME - These should not be in annotations
                    "babylon.gpte.redhat.com/description": self.catalog_description_content,
                    "babylon.gpte.redhat.com/descriptionFormat": self.catalog_description_format,
                    "babylon.gpte.redhat.com/displayName": self.catalog_display_name,
                    "babylon.gpte.redhat.com/keywords": ','.join(self.catalog_keywords),
                },
                "labels": {
                    "babylon.gpte.redhat.com/category": self.catalog_category,
                    "gpte.redhat.com/asset-uuid": self.asset_uuid,
                },
                "name": self.name,
                "namespace": self.catalog_item_namespace,
            },
            "spec": {
                "agnosticvRepo": {
                    "name": agnosticv_repo.name,
                    "git": {
                        "ref": agnosticv_repo.git_ref,
                        "url": agnosticv_repo.git_url,
                    }
                },
                "category": self.catalog_category,
                "description": {
                    "content": self.catalog_description_content,
                    "format": self.catalog_description_format,
                },
                "displayName": self.catalog_display_name,
                "keywords": self.catalog_keywords,
                "lastUpdate": self.last_update,
                "workshopUserMode": self.catalog_workshop_user_mode,
            },
        }

        if self.access_control:
            definition['spec']['accessControl'] = self.access_control

        # FIXME - deprecated, should not be in annotations
        if self.catalog_icon:
            definition['spec']['icon'] = self.catalog_icon
            definition['metadata']['annotations']["babylon.gpte.redhat.com/icon"] = json.dumps(self.catalog_icon)
        else:
            definition['metadata']['annotations']["babylon.gpte.redhat.com/icon"] = ""

        if self.catalog_num_users_parameter is not None:
            definition['spec']['numUsersParameter'] = self.catalog_num_users_parameter

        for key, value in self.catalog_labels.items():
            definition['metadata']['labels'][f"babylon.gpte.redhat.com/{key}"] = value

        for key, value in self.reporting_labels.items():
            definition['metadata']['labels'][f"demo.redhat.com/{key}"] = value

        if self.stage in ('dev', 'test', 'prod', 'event'):
            definition['metadata']['labels'][f"babylon.gpte.redhat.com/stage"] = self.stage
        
        if self.catalog_parameters != None:
            definition['spec']['parameters'] = []
            for catalog_parameter in self.catalog_parameters:
                parameter = {
                    key: value for key, value in catalog_parameter.items()
                    if key not in {'components', 'variable'}
                }
                definition['spec']['parameters'].append(parameter)

        if self.catalog_terms_of_service is not None:
            definition['spec']['termsOfService'] = self.catalog_terms_of_service

        if self.zerotouch_access is not None:
            definition['spec']['zerotouchAccess'] = self.zerotouch_access

        if self.catalog_support_link:
            definition['spec']['supportLink'] = self.catalog_support_link

        if self.catalog_external_url:
            definition['spec']['externalUrl'] = self.catalog_external_url
            return definition

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

        # Supported actions include all actions supported by all components
        supported_actions = deepcopy(self.supported_actions)
        for linked_agnosticv_component in linked_agnosticv_components:
            for key, value in linked_agnosticv_component.supported_actions.items():
                if key not in supported_actions:
                    supported_actions[key] = value

        for idx, linked_component in enumerate(self.linked_components):
            entry = {"name": linked_component.name}
            definition['spec'].setdefault("linkedComponents", []).append(entry)
            if linked_component.display_name:
                entry['displayName'] = linked_component.display_name

            definition['spec']['resources'].append({
                "name": linked_component.name or linked_component.short_name,
                "provider": linked_component.resource_provider_reference.definition,
            })

            if linked_component.display_name:
                definition['metadata']['annotations'][
                    f"babylon.gpte.redhat.com/displayNameComponent{idx}"
                ] = linked_component.display_name

        if self.deployer_type:
            definition['spec']['resources'].append({
                "name": self.short_name,
                "provider": self.resource_provider_ref,
            })

        if self.catalog_email_from is not None:
            definition['spec'].setdefault('email', {})['from'] = self.catalog_email_from

        if self.catalog_message_templates:
            definition['spec']['messageTemplates'] = self.catalog_message_templates

        if self.catalog_multiuser:
            definition['spec']['multiuser'] = True

        if len(self.owners) > 0:
            definition['spec']['owners'] = {
                key: value for key, value in self.owners.items()
                if key == 'maintainer'
            }

        if self.deployer_provision_time_estimate:
            definition['spec']['provisionTimeEstimate'] = self.deployer_provision_time_estimate

        if self.catalog_workshop_lab_ui_redirect:
            definition['spec']['workshopLabUiRedirect'] = self.catalog_workshop_lab_ui_redirect

        if self.catalog_workshop_ui_disabled:
            definition['spec']['workshopUiDisabled'] = True
        else:
            definition['spec']['workshopUiMaxInstances'] = self.catalog_workshop_ui_max_instances
            if self.catalog_workshop_ui_enabled_by_default:
                definition['spec']['workshopUiEnabledByDefault'] = True

        return definition

    def get_resource_provider_definition(self) -> Mapping|None:
        """Get ResourceProvider definition
        Return None if item is an exernal url."""
        # FIXME - catalog_meta should not impact anarchy governor creation.
        if self.asset_uuid is None or self.catalog_disable or self.catalog_external_url is not None:
            return None
        definition = {
            "apiVersion": ResourceProvider.api_group_version,
            "kind": ResourceProvider.kind,
            "metadata": {
                "annotations": {
                    "gpte.redhat.com/last-update": json.dumps(self.last_update),
                },
                "labels": {
                    "gpte.redhat.com/asset-uuid": self.asset_uuid,
                },
                "name": self.name,
                "namespace": "poolboy",
            },
            "spec": {
                "healthCheck":
                    "spec.vars.current_state | default('') not in ("
                    "'provision-canceled', 'provision-error', 'provision-failed', "
                    "'start-error', 'start-failed', 'stop-error', 'stop-failed')",
                "lifespan": {
                    "default": self.lifespan_default,
                    "maximum": self.lifespan_maximum,
                    "relativeMaximum": self.lifespan_relative_maximum,
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
                "readinessCheck":
                    "spec.vars.desired_state | default('') == spec.vars.current_state | default('') "
                    "and spec.vars.current_state | default('') in ('started', 'stopped')",
                "statusSummaryTemplate": {
                    "agnosticv": {
                        "account": self.account,
                        "asset_uuid": self.asset_uuid,
                        "path": self.path,
                        "repo": self.agnosticv_repo_name,
                        "short_name": self.short_name,
                        "stage": self.stage,
                    },
                    "error_message": "{{ resources | default([]) | json_query(\"[].state.status.runStatusMessage|join('; ', @)\") | default(omit, true) }}",
                    "provision_data": "{{ resources | default([]) | json_query('[].state.spec.vars.provision_data') | merge_list_of_dicts | object }}",
                    "runtime_default": "{{ runtime_default }}",
                    "runtime_maximum": "{{ runtime_maximum }}",
                    "state":
                        "{{"
                        "'validation-failed' if has_validation_errors | bool else "
                        "'provision-canceled' if has_resource_provision_canceled | bool else "
                        "'provision-error' if has_resource_provision_error | bool else "
                        "'provision-failed' if has_resource_provision_failed | bool else "
                        "'start-canceled' if has_resource_start_canceled | bool else "
                        "'start-error' if has_resource_start_error | bool else "
                        "'start-failed' if has_resource_start_failed | bool else "
                        "'stop-canceled' if has_resource_stop_canceled | bool else "
                        "'stop-error' if has_resource_stop_error | bool else "
                        "'stop-failed' if has_resource_stop_failed | bool else "
                        "'provision-queued' if has_resource_provision_queued | bool else "
                        "'provisioning' if has_resource_provisioning | bool else "
                        "'provision-pending' if has_resource_provision_pending | bool else "
                        "'stopping' if has_resource_stopping | bool else "
                        "'starting' if has_resource_starting | bool else "
                        "'stop-pending' if has_resource_stop_pending | bool else "
                        "'start-pending' if has_resource_start_pending | bool else "
                        "'initializing' if has_resource_initializing | bool else "
                        "'requested' if has_resource_without_state | bool else "
                        "'start-scheduled' if start_is_scheduled and has_resource_that_can_start | bool else "
                        "'stop-scheduled' if stop_is_scheduled and has_resource_that_can_stop | bool else "
                        "'stopped' if has_resource_stopped | bool else "
                        "'started'"
                        "}}",
                    "supportedActions": "{{ resources | json_query(\"[].state.status.supportedActions\") | merge_list_of_dicts | object }}",
                },
                # Variables for Jinja templates
                "vars": {
                    "has_resource_initializing":
                        "{{ (resources | json_query(\"[?state.spec.vars && !contains(keys(state.spec.vars), 'current_state')]\") | length > 0) | bool }}",
                    "has_resource_provision_error":
                        "{{ (resources | json_query(\"[?state.spec.vars.current_state=='provision-error']\") | length > 0) | bool }}",
                    "has_resource_provision_canceled":
                        "{{ (resources | json_query(\"[?state.spec.vars.current_state=='provision-canceled']\") | length > 0) | bool }}",
                    "has_resource_provision_failed":
                        "{{ (resources | json_query(\"[?state.spec.vars.current_state=='provision-failed']\") | length > 0) | bool }}",
                    "has_resource_provision_pending":
                        "{{ (resources | json_query(\"[?state.spec.vars.current_state=='provision-pending']\") | length > 0) | bool }}",
                    "has_resource_provision_queued":
                        "{{ (resources | json_query(\"[?state.spec.vars.current_state=='provision-queued']\") | length > 0) | bool }}",
                    "has_resource_provisioning":
                        "{{ (resources | json_query(\"[?state.spec.vars.current_state=='provisioning']\") | length > 0) | bool }}",
                    "has_resource_start_error":
                        "{{ (resources | json_query(\"[?state.spec.vars.current_state=='start-error']\") | length > 0) | bool }}",
                    "has_resource_start_canceled":
                        "{{ (resources | json_query(\"[?state.spec.vars.current_state=='start-canceled']\") | length > 0) | bool }}",
                    "has_resource_start_failed":
                        "{{ (resources | json_query(\"[?state.spec.vars.current_state=='start-failed']\") | length > 0) | bool }}",
                    "has_resource_start_pending":
                        "{{ (resources | json_query(\"[?state.spec.vars.current_state=='start-pending']\") | length > 0) | bool }}",
                    "has_resource_starting":
                        "{{ (resources | json_query(\"[?state.spec.vars.current_state=='starting']\") | length > 0) | bool }}",
                    "has_resource_stop_error":
                        "{{ (resources | json_query(\"[?state.spec.vars.current_state=='stop-error']\") | length > 0) | bool }}",
                    "has_resource_stop_canceled":
                        "{{ (resources | json_query(\"[?state.spec.vars.current_state=='stop-canceled']\") | length > 0) | bool }}",
                    "has_resource_stop_failed":
                        "{{ (resources | json_query(\"[?state.spec.vars.current_state=='stop-failed']\") | length > 0) | bool }}",
                    "has_resource_stop_pending":
                        "{{ (resources | json_query(\"[?state.spec.vars.current_state=='stop-pending']\") | length > 0) | bool }}",
                    "has_resource_stopped":
                        "{{ (resources | json_query(\"[?state.spec.vars.current_state=='stopped']\") | length > 0) | bool }}",
                    "has_resource_stopping":
                        "{{ (resources | json_query(\"[?state.spec.vars.current_state=='stopping']\") | length > 0) | bool }}",
                    "has_resource_that_can_start":
                        "{{ (resources | json_query(\"[?state.spec.vars.current_state=='stopped' && contains(keys(state.status.supportedActions), 'start')]\") | length > 0) | bool }}",
                    "has_resource_that_can_stop":
                        "{{ (resources | json_query(\"[?state.spec.vars.current_state=='started' && contains(keys(state.status.supportedActions), 'stop')]\") | length > 0) | bool }}",
                    "has_resource_without_state":
                        "{{ (resources | length > resources | json_query(\"[?state]\") | length) | bool }}",
                    "has_validation_errors":
                        "{{ (resource_claim.status.provider.validationErrors | default([]) | length > 0) | bool }}",
                    "runtime_default": self.runtime_default,
                    "runtime_maximum": self.runtime_maximum,
                    "start_is_scheduled":
                        "{{ (start_timestamp | default('1970-01-01T00:00:00Z') <= now(true, '%FT%TZ') and stop_timestamp | default('2999-01-01T00:00:00Z') > now(true, '%FT%TZ')) | bool }}",
                    "stop_is_scheduled":
                        "{{ (not start_is_scheduled) | bool }}",
                }
            }
        }

        if self.deployer_type:
            definition['spec']['default'] = {
                "spec": {
                    "vars": {
                        "action_schedule": {
                            "start": "{{ timestamp.utcnow }}",
                            "stop": "{{ timestamp.utcnow.add(resource_provider.spec.override.spec.vars.action_schedule.default_runtime) }}",
                        }
                    }
                }
            }
            definition['spec']['matchIgnore'] = ["/spec/vars/action_schedule(/.*)?"]
            definition['spec']['override'] = {
                "apiVersion": AnarchySubject.api_group_version,
                "kind": AnarchySubject.kind,
                "metadata": {
                    "name": self.name + "-{{ guid }}{% if resource_index | int > 0 or (resource_reference.name | default('')).endswith('-0') %}-{{ resource_index }}{% endif %}",
                    "namespace": self.get_anarchy_namespace(),
                },
                "spec": {
                    "governor": self.name,
                    "vars": {
                        "action_schedule": {
                            "default_runtime": self.runtime_default,
                            "maximum_runtime": self.runtime_maximum,
                        },
                        "desired_state":
                            # FIXME - clean up syntax for readability.
                            "{%- if 0 < resource_states | map('default', {}, True) | list | json_query(\"length([?!contains([keys(status.actions.provision || `{}`), keys(status.towerJobs.provision || `{}`)][], 'completeTimestamp')])\") -%}\n"
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
            }
            definition['spec']['resourceRequiresClaim'] = self.resource_requires_claim
            definition['spec']['template'] = {
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
            }
            definition['spec']['updateFilters'] = [
                {
                    "pathMatch": "/spec/vars/action_schedule/.*",
                    "allowedOps": ["add", "replace"],
                }, {
                    "pathMatch": "/spec/vars/desired_state",
                    "allowedOps": ["add", "replace"],
                },
            ]
            definition['spec']['validation'] = {
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
            }

            if self.catalog_requester_parameters:
                for rp in self.catalog_requester_parameters:
                    definition['spec']['override']['spec']['vars']['job_vars'][rp['name']] = rp['value']

            # Allow requesting status checks if not explicitly disabled
            if not self.deployer_actions['status'].get('disable'):
                definition['spec']['updateFilters'].append({
                    "pathMatch": "/spec/vars/check_status_request_timestamp",
                    "allowedOps": ["add", "replace"],
                })

        if not self.catalog_disable:
            definition['metadata']['labels'][f"babylon.gpte.redhat.com/catalogItemName"] = self.name
            definition['metadata']['labels'][f"babylon.gpte.redhat.com/catalogItemNamespace"] = self.catalog_item_namespace
            definition['spec']['statusSummaryTemplate']['catalog_item_name'] = self.name
            definition['spec']['statusSummaryTemplate']['catalog_item_namespace'] = self.catalog_item_namespace

        for idx, linked_component in enumerate(self.linked_components):
            linked_resource_provider = {
                "name": linked_component.component_name,
                "waitFor": f"current_state_{idx} == 'started'",
                "parameterValues": {
                    "start_timestamp": "{{ start_timestamp }}",
                    "stop_timestamp": "{{ stop_timestamp }}",
                    **linked_component.parameter_values,
                },
                "resourceName": linked_component.name,
                "templateVars": [
                    {
                        "name": f"current_state_{idx}",
                        "from": "/spec/vars/current_state",
                    }, {
                        "name": f"provision_data_{idx}",
                        "from": "/spec/vars/provision_data",
                    }
                ]
            }

            if linked_component.when:
                linked_resource_provider['when'] = linked_component.when
            definition['spec'].setdefault('linkedResourceProviders', []).append(linked_resource_provider)

            if self.deployer_type:
                for item in linked_component.propagate_provision_data:
                    if item.name:
                        definition['spec']['override']['spec']['vars']['job_vars'][item.var] = '{{provision_data_' + str(idx) + '.' + item.name + '|default(omit)|object}}'
                    else:
                        definition['spec']['override']['spec']['vars']['job_vars'][item.var] = '{{provision_data_' + str(idx) + '|default(omit)|object}}'

        if self.catalog_parameters:
            if self.deployer_type:
                open_api_schema_vars = definition['spec']['validation']['openAPIV3Schema']['properties']['spec']['properties']['vars']
                open_api_schema_job_vars = open_api_schema_vars['properties']['job_vars']
            for parameter in self.catalog_parameters:
                parameter_name = parameter['name']
                resource_broker_parameter = {
                    'name': parameter_name,
                    'allowUpdate': parameter.get('allowUpdate', False),
                    'required': parameter.get('required', False),
                }
                if 'openAPIV3Schema' in parameter:
                    resource_broker_parameter.setdefault('validation', {})['openAPIV3Schema'] = parameter['openAPIV3Schema']

                definition['spec']['parameters'].append(resource_broker_parameter)

                # Configure parameter propagation to linked components
                apply_parameter_to_current = False
                for component in parameter.get('components', [{"name": "current"}]):
                    component_name = component.get('name')
                    for linked_provider_config in definition['spec'].get('linkedResourceProviders', []):
                        if component_name == 'all' or component_name == linked_provider_config['resourceName']:
                            linked_provider_config.setdefault('parameterValues', {})[parameter_name] = '{{' + parameter_name + '|object}}'
                    if component_name == 'all' or component_name == 'current':
                        apply_parameter_to_current = True

                # Below here is customization for how the parameter value is used to manage the
                # resource for this provider. Some parameters may only be used to propagate to
                # other linked providers.
                if not self.deployer_type:
                    continue

                if not apply_parameter_to_current:
                    continue

                # Define variable for Anarchy if configured.
                if parameter.get('anarchyVar'):
                    definition['spec']['template']['definition'].setdefault(
                        'spec', {}
                    ).setdefault(
                        'vars', {}
                    )[parameter['anarchyVar']] = '{{' + parameter_name + '|default(omit)|object}}'

                variable = None
                if 'variable' in parameter:
                    # Custom variable name
                    variable = parameter['variable']
                elif 'annotation' not in parameter and 'anarchyVar' not in parameter:
                    # Default variable to parameter name if not setting annotation or var for anarchy
                    variable = parameter_name
                if not variable:
                    # No variable, nothing else to do
                    continue

                open_api_schema_job_vars.setdefault('properties', {})
                open_api_schema_job_vars.setdefault('required', [])
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
                )[variable] = '{{' + parameter_name + '|default(omit)|object}}'

        return definition


    def get_tenant_cluster_pool_definition(self,
        environment_level: str,
        namespace: str="shared-clusters",
    ) -> Mapping|None:
        """Get TenantClusterPool definition.
        Return None if item is not a host cluster for tenants."""
        sandbox_host = self.definition.get('__meta__', {}).get('sandbox_host')
        if self.asset_uuid is None or sandbox_host is None:
            return None
        definition = {
            "apiVersion": TenantClusterPool.api_group_version,
            "kind": TenantClusterPool.kind,
            "metadata": {
                "annotations": {
                    "gpte.redhat.com/last-update": json.dumps(self.last_update),
                },
                "labels": {
                    "gpte.redhat.com/asset-uuid": self.asset_uuid,
                },
                "name": self.name,
                "namespace": namespace,
            },
            "spec": {
                "clusterProvisioning": {
                    "provider": {
                        "name": self.name,
                        "parameterValues": {
                            "purpose": "Tenant Cluster",
                        }
                    }
                },
                "enabled": False,
                "maxClusters": 0,
                "minAvailableSandboxPlacements": 0,
                "minClusters": 0,
                "sandboxHost": deepcopy(sandbox_host),
            },
        }
        definition['spec']['sandboxHost']['annotations']['environment_level'] = environment_level
        definition['spec']['sandboxHost'].setdefault('quota_required', False)
        return definition

    async def get_agnosticv_repo(self, cache: bool=False) -> AgnosticVRepo:
        return await AgnosticVRepo.get(
            cache=cache,
            client=self.client,
            name=self.agnosticv_repo_name,
            namespace=self.namespace,
        )

    async def get_linked_agnosticv_components(
        self,
        cache: bool=False,
        recurse: bool=False,
        _depth: int=0,
    ) -> List[AgnosticVComponent]:
        """Get AgnosticVComponent definitions for linked components."""
        ret = []
        if _depth > 5:
            raise Exception("Recursive loop in linked agnosticv components!")
        for item in self.linked_components:
            agnosticv_component = await self.client.get_agnosticv_component(
                name=item.component_name,
                cache=cache,
            )
            if recurse:
                ret.extend(
                    await agnosticv_component.get_linked_agnosticv_components(
                        cache=cache,
                        recurse=True, # FIXME
                        _depth=_depth+1,
                    )
                )
            ret.append(agnosticv_component)
        return ret


class AgnosticVComponentSpec:
    def __init__(self, definition):
        self._definition = definition

    @property
    def agnosticv_repo(self) -> str:
        """Return name of AgnosticVRepo associated with this component"""
        return self._definition['agnosticvRepo']

    @property
    def path(self) -> str:
        """Return path of AgnosticVComponent within AgnosticV repository."""
        return self._definition['path']

    @property
    def pull_request_commit_hash(self) -> str|None:
        """Return pull request commit hash source for AgnosticVComponent or None
        if not managed by a pull request."""
        return self._definition.get('pullRequestCommitHash')

    @property
    def pull_request_number(self) -> int|None:
        """Return pull request number source for AgnosticVComponent or None
        if not managed by a pull request."""
        return self._definition.get('pullRequestNumber')

    @property
    def definition(self) -> Mapping:
        return self._definition['definition']

class AgnosticVComponentStatus:
    def __init__(self, definition):
        self._definition = definition

    @property
    def anarchy_governor(self) -> AgnosticVComponentStatusAnarchyGovernor|None:
        if 'anarchyGovernor' not in self._definition:
            return None
        return AgnosticVComponentStatusAnarchyGovernor(self._definition['anarchyGovernor'])

    @property
    def deprecated_anarchy_governors(self) -> List[AgnosticVComponentStatusAnarchyGovernor]|None:
        """Return deprecated anarchy governors from status or None
        if `deprecatedAnarchyGovernors` not present in status.

        These represent AnarchyGovernors that were created for this
        AgnosticVComponent in a different namespace than currently configured.
        These AnarchyGovernors should be cleaned up and deleted once no
        AnarchySubjects still reference these.
        """
        if 'deprecatedAnarchyGovernors' not in self._definition:
            return None
        return [
            AgnosticVComponentStatusAnarchyGovernor(item)
            for item in self._definition['deprecatedAnarchyGovernors']
        ]

class AgnosticVComponentStatusAnarchyGovernor:
    def __init__(self, definition):
        self._definition = definition

    @property
    def name(self) -> str:
        return self._definition['name']

    @property
    def namespace(self) -> str:
        return self._definition['namespace']

    @property
    def uid(self) -> str:
        return self._definition['uid']


class AgnosticVLinkedComponent:
    """Representation of a components listed in __meta__.components"""
    def __init__(self, parent, definition):
        self.item = definition.get('item')
        self.display_name = definition.get('display_name')
        self.propagate_provision_data = [
            AgnosticVLinkedComponentPropagateProvisionDataItem(item)
            for item in definition.get('propagate_provision_data', [])
        ]

        component_name_parts = [part.lower().replace('_', '-') for part in self.item.split('/')]
        # Add account to match parent if not given in the reference
        if len(component_name_parts) == 1:
            component_name_parts.insert(0, parent.account)
        # Add stage to match parent if not given in the reference
        if len(component_name_parts) == 2:
            component_name_parts.append(parent.stage)
        self.component_name = '.'.join(component_name_parts)
        self.name = definition.get('name', self.component_name)
        self.parameter_values = definition.get('parameter_values', {})
        self.short_name = component_name_parts[1]
        self.when = definition.get('when')

    @property
    def resource_provider_reference(self) -> ResourceReference:
        return ResourceReference({
            "apiVersion": "poolboy.gpte.redhat.com/v1",
            "kind": "ResourceProvider",
            "name": self.component_name,
            "namespace": "poolboy",
        })

class AgnosticVLinkedComponentPropagateProvisionDataItem:
    def __init__(self, definition):
        self.name = definition.get('name')
        self.var = definition['var']
