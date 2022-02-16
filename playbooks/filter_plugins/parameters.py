# -*- coding: utf-8 -*-

# Copyright: (c) 2021, Johnathan Kupferer <jkupfere@redhat.com>
# GNU General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)

from __future__ import absolute_import, division, print_function
__metaclass__ = type

from ansible.module_utils.six import string_types

import yaml

def babylon_extract_parameter_vars(vars_dict):
    parameter_vars = dict()
    parameters = vars_dict.get('__meta__', {}).get('catalog', {}).get('parameters')

    # Cloud tags may passed as a YAML string which must be interpreted.
    # Strip out guid and uuid from cloud tags as these will conflict with Babylon assignment.
    if 'cloud_tags' in vars_dict and isinstance(vars_dict['cloud_tags'], string_types):
        vars_dict['cloud_tags'] = {
            k: v for k, v in yaml.safe_load(vars_dict['cloud_tags']).items() if k not in ('guid', 'uuid')
        }

    if parameters == None:
        # No parameters configured, so must pass all vars as parameter vars
        for varname, value in vars_dict.items():
            if varname not in ('__meta__', 'agnosticv_meta', 'cloud_tags', 'guid', 'uuid'):
                parameter_vars[varname] = value
    else:
        # Pass parameter vars with expected type conversions
        for parameter in parameters:
            # Use explicit variable name for parameter if set, otherwise use parameter name as variable name
            # unless parameter sets an annotation.
            varname = parameter.get('variable', None if 'annotation' in parameter else parameter['name'])
            vartype = parameter.get('openAPIV3Schema', {}).get('type')
            if varname and varname in vars_dict:
                raw_value = vars_dict[varname]
                if vartype == 'boolean':
                    parameter_vars[varname] = raw_value.lower() in ('1', 'true', 'yes')
                elif vartype == 'integer':
                    parameter_vars[varname] = int(raw_value)
                elif vartype == 'number':
                    parameter_vars[varname] = float(raw_value)
                elif vartype == 'string':
                    parameter_vars[varname] = str(raw_value)
                else:
                    parameter_vars[varname] = raw_value


    return parameter_vars

class FilterModule(object):
    ''' Ansible core jinja2 filters '''

    def filters(self):
        return {
            'babylon_extract_parameter_vars': babylon_extract_parameter_vars,
        }
