# -*- coding: utf-8 -*-

# Copyright: (c) 2021, Johnathan Kupferer <jkupfere@redhat.com>
# GNU General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)

__metaclass__ = type

from ansible.errors import AnsibleFilterError
from ansible.plugins.filter.core import to_bool

import yaml

def babylon_extract_parameter_vars(vars_dict):
    """
    Filter parameter variables from all values provided for provision.

    Most values will be included in the AnarchyGovernor as they are not
    parameters which are expected to be different with each requested
    environment.

    The `__meta__.catalag.parameters` provides a list of expected parameters
    along with data type validation that will be applied. Variables are
    converted to the types expected by the validation to prevent them from
    being rejected.
    """
    parameter_vars = dict()
    parameters = vars_dict.get('__meta__', {}).get('catalog', {}).get('parameters')
    requester_parameters = vars_dict.get('__meta__', {}).get('catalog', {}).get('requester_parameters')

    # Cloud tags may passed as a YAML string which must be interpreted.
    # Strip out guid and uuid from cloud tags as these will conflict with Babylon assignment.
    if 'cloud_tags' in vars_dict and isinstance(vars_dict['cloud_tags'], str):
        vars_dict['cloud_tags'] = {
            k: v for k, v in yaml.safe_load(vars_dict['cloud_tags']).items() if k not in ('guid', 'uuid')
        }

    if parameters == None and requester_parameters == None:
        # No parameters configured, so must pass all vars as parameter vars
        for varname, value in vars_dict.items():
            if varname not in ('__meta__', 'agnosticv_meta', 'guid', 'uuid'):
                parameter_vars[varname] = value

    if parameters:
        # Pass parameter vars with expected type conversions
        for parameter in parameters:
            # Use explicit variable name for parameter if set, otherwise use parameter name as variable name
            # unless parameter sets an annotation.
            varname = parameter.get('variable', None if 'annotation' in parameter else parameter['name'])
            vartype = parameter.get('openAPIV3Schema', {}).get('type')
            if varname and varname in vars_dict:
                raw_value = vars_dict[varname]
                try:
                    if vartype == 'boolean':
                        parameter_vars[varname] = to_bool(raw_value)
                    elif vartype == 'integer':
                        parameter_vars[varname] = int(raw_value)
                    elif vartype == 'number':
                        parameter_vars[varname] = float(raw_value)
                    elif vartype == 'string':
                        parameter_vars[varname] = str(raw_value)
                    else:
                        parameter_vars[varname] = raw_value
                except ValueError:
                    raise AnsibleFilterError(
                        'Invalid value for {}: "{}" is cannot be parsed as {}'.format(varname, raw_value, vartype)
                    )

    if requester_parameters:
        for requester_parameter in requester_parameters:
            # Requester parameters are always strings.
            varname = requester_parameter.get('variable', None if 'annotation' in requester_parameter else requester_parameter['name'])
            parameter_vars[varname] = vars_dict[varname]

    return parameter_vars

class FilterModule(object):
    ''' Ansible core jinja2 filters '''

    def filters(self):
        return {
            'babylon_extract_parameter_vars': babylon_extract_parameter_vars,
        }
