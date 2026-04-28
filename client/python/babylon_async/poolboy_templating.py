import copy
import functools
import json
import random
import re
from datetime import datetime, timedelta, timezone

import jinja2
import jmespath
import pytimeparse
from str2bool import str2bool
from strgen import StringGenerator

MAX_RECURSION_DEPTH = 100

class TimeStamp(object):
    def __init__(self, set_datetime=None):
        if not set_datetime:
            self.datetime = datetime.now(timezone.utc)
        elif isinstance(set_datetime, datetime):
            self.datetime = set_datetime
        elif isinstance(set_datetime, str):
            self.datetime = datetime.strptime(set_datetime, "%Y-%m-%dT%H:%M:%S%z")
        else:
            self.datetime = set_datetime

    def __call__(self, arg):
        return TimeStamp(arg)

    def __eq__(self, other):
        return self.datetime == other.datetime

    def __ne__(self, other):
        return self.datetime != other.datetime

    def __ge__(self, other):
        return self.datetime >= other.datetime

    def __gt__(self, other):
        return self.datetime > other.datetime

    def __le__(self, other):
        return self.datetime <= other.datetime

    def __lt__(self, other):
        return self.datetime < other.datetime

    def __str__(self):
        return self.datetime.strftime('%FT%TZ')

    def __add__(self, interval):
        return self.add(interval)

    def add(self, interval):
        ret = TimeStamp(self.datetime)
        if isinstance(interval, timedelta):
            ret.datetime += interval
        elif isinstance(interval, str):
            ret.datetime += timedelta(seconds=pytimeparse.parse(interval))
        elif isinstance(interval, number.Number):
            ret.datetime += timedelta(seconds=interval)
        else:
            raise Exception(f"Unable to add {interval} to Timestamp")
        return ret

    @property
    def utcnow(self):
        return TimeStamp()

def error_if_undefined(result):
    if isinstance(result, jinja2.Undefined):
        result._fail_with_undefined_error()
    else:
        return result

def seconds_to_interval(seconds:int) -> str:
    if seconds % 86400 == 0:
        return f"{int(seconds / 86400)}d"
    elif seconds % 3600 == 0:
        return f"{int(seconds / 3600)}h"
    elif seconds % 60 == 0:
        return f"{int(seconds / 60)}m"
    else:
        return f"{int(seconds)}s"

def timedelta_to_str(td:timedelta) -> str:
    total_seconds = int(td.total_seconds())
    days = total_seconds // 86400
    hours = (total_seconds % 86400) // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60

    ret = ""
    if days > 0:
        ret += f"{days}d"
    if hours > 0:
        ret += f"{hours:d}h"
    if minutes > 0:
        ret += f"{minutes}m"
    if seconds > 0:
        ret += f"{seconds}s"
    return ret

jinja2env = jinja2.Environment(
    finalize = error_if_undefined,
    undefined = jinja2.ChainableUndefined,
)
jinja2env.filters['bool'] = lambda x: bool(str2bool(x)) if isinstance(x, str) else bool(x)
jinja2env.filters['json_query'] = lambda x, query: jmespath.search(query, x)
jinja2env.filters['merge_list_of_dicts'] = lambda a: functools.reduce(lambda d1, d2: {**(d1 or {}), **(d2 or {})}, a) if a else {}
jinja2env.filters['object'] = lambda x: json.dumps(x)
jinja2env.filters['parse_time_interval'] = lambda x: timedelta(seconds=pytimeparse.parse(str(x)))
jinja2env.filters['strgen'] = lambda x: StringGenerator(x).render()
jinja2env.filters['to_datetime'] = lambda s, f='%Y-%m-%d %H:%M:%S': datetime.strptime(str(s), f)
jinja2env.filters['to_json'] = lambda x: json.dumps(x)

# Regex to detect if it looks like this value should be rendered as a raw type
# rather than a string.
#
# So given a template in YAML of:
#
# example:
#   boolean_as_string: "{{ 1 == 1 }}"
#   boolean_raw: "{{ (1 == 1) | bool }}"
#   float_as_string: "{{ 1 / 3 }}"
#   float_raw: "{{ (1 / 3) | float }}"
#   number_as_string: "{{ 1 + 1 }}"
#   number_raw: "{{ (1 + 1) | int }}"
#   object_as_string: "{{ {'user': {'name': 'alice'}} }}"
#   object_raw: "{{ {'user': {'name': 'alice'}} | object }}"
#
# Will render to:
#
# example:
#   boolean_as_string: 'True'
#   boolean_raw: true
#   float_as_string: '0.3333333333333333'
#   float_raw: 0.3333333333333333
#   number_as_string: '2'
#   number_raw: 2
#   object_as_string: '{''user'': {''name'': ''alice''}}'
#   object_raw:
#     user:
#       name: alice
type_filter_match_re = re.compile(r'^{{(?!.*{{).*\| *(bool|float|int|list|object) *}}$')

def check_condition(condition, variables={}, template_variables={}):
    return jinja2process(
        template="{{ (" + condition + ") | bool}}",
        variables=variables,
        template_variables=template_variables,
    )

def template_output_typing(template_out, template):
    '''Convert template output to corresponding type as determined by final filter.'''
    type_filter_match = type_filter_match_re.match(template)
    if type_filter_match:
        type_filter = type_filter_match.group(1)
        try:
            if type_filter == 'bool':
                return bool(str2bool(template_out))
            elif type_filter == 'float':
                return float(template_out)
            elif type_filter == 'int':
                return int(template_out)
            elif type_filter == 'list':
                return json.loads(template_out)
            elif type_filter == 'object':
                return json.loads(template_out)
        except ValueError:
            pass
    return template_out

def j2now(utc=False, fmt=None):
    dt = datetime.now(timezone.utc if utc else None)
    return dt.strftime(fmt) if fmt else dt

j2template_cache = {}
def j2template_get(template: str):
    if template in j2template_cache:
        return j2template_cache[template]
    j2template = jinja2env.from_string(template)
    j2template_cache[template] = j2template
    return j2template


def jinja2process(template, omit=None, variables={}, template_variables={}):
    variables = copy.copy(variables)
    variables['datetime'] = datetime
    variables['now'] = j2now
    variables['omit'] = omit
    variables['timedelta'] = timedelta
    variables['timezone'] = timezone
    variables['timestamp'] = TimeStamp()
    variables['__recursion_depth__'] = 0
    j2template = j2template_get(template)

    class TemplateVariable(object):
        '''Variable may contain template string referencing other variables.'''
        def __init__(self, value):
            self.value = value
            self.j2template = j2template_get(value) if '{{' in value or '{%' in value else None

        def get_typed_value(self):
            if self.j2template:
                template_out = self.__str__()
                return template_output_typing(template_out, self.value)
            return self.value

        def __bool__(self):
            return str2bool(self.__str__())

        def __contains__(self, item):
            return item in self.get_typed_value()

        def __eq__(self, cmp):
            if isinstance(TemplateVariable, cmp):
                return self.get_typed_value() == cmp.get_typed_value()
            else:
                return self.get_typed_value() == cmp

        def __float__(self):
            return float(self.__str__())

        def __ge__(self):
            if isinstance(TemplateVariable, cmp):
                return self.get_typed_value() >= cmp.get_typed_value()
            else:
                return self.get_typed_value() >= cmp

        def __getattr__(self, key):
            return self[key]

        def __getitem__(self, key):
            return self.get_typed_value()[key]

        def __gt__(self):
            if isinstance(TemplateVariable, cmp):
                return self.get_typed_value() > cmp.get_typed_value()
            else:
                return self.get_typed_value() > cmp

        def __int__(self):
            return int(self.__str__())

        def __le__(self):
            if isinstance(TemplateVariable, cmp):
                return self.get_typed_value() <= cmp.get_typed_value()
            else:
                return self.get_typed_value() <= cmp

        def __len__(self):
            return len(self.get_typed_value());

        def __lt__(self):
            if isinstance(TemplateVariable, cmp):
                return self.get_typed_value() < cmp.get_typed_value()
            else:
                return self.get_typed_value() < cmp

        def __ne__(self, cmp):
            return not self == cmp

        def __repr__(self):
            return self.__str__()

        def __str__(self):
            if self.j2template is None:
                return str(self.value)
            if variables['__recursion_depth__'] > MAX_RECURSION_DEPTH:
                raise RuntimeError("Template variable exceeded max recursion")
            variables['__recursion_depth__'] += 1
            ret = self.j2template.render(variables)
            variables['__recursion_depth__'] -= 1
            return ret

    for name, value in template_variables.items():
        variables[name] = TemplateVariable(value) if isinstance(value, str) else value

    template_out = j2template.render(variables)
    return template_output_typing(template_out, template)

def recursive_process_template_strings(template, variables={}, template_variables={}):
    """Take a template and recursively process template strings within it.
    The template may be any type.
    If it is a dictionary or list then all values will be recursively procesed.
    Strings will be handled as templates and values replaced by output.
    If a template string ends in a bool, float, int, or object filter then
    output will be converted from string to the corresponding type.

    This method is used in various places including generating status summary,
    validating parameters, checking heath/readiness, and generating resource definitions.

    Keyword arguments:
    variables -- simple key/value pair variables
    template_variables -- variables which may contain template strings and should only come from trusted sources
    """
    omit = '__omit_place_holder__' + ''.join(random.choices('abcdef0123456789', k=40))
    return __recursive_strip_omit(
        __recursive_process_template_strings(
            omit = omit,
            template = template,
            variables = variables,
            template_variables = template_variables,
        ),
        omit = omit,
    )

def __recursive_process_template_strings(template, omit, variables, template_variables):
    if isinstance(template, dict):
        return {
            key: __recursive_process_template_strings(val, omit=omit, variables=variables, template_variables=template_variables)
            for key, val in template.items()
        }
    elif isinstance(template, list):
        return [
            __recursive_process_template_strings(item, omit=omit, variables=variables, template_variables=template_variables)
            for item in template
        ]
    elif isinstance(template, str):
        return jinja2process(template, omit=omit, variables=variables, template_variables=template_variables)
    else:
        return template

def __recursive_strip_omit(value, omit):
    if isinstance(value, dict):
        return {
            key: __recursive_strip_omit(val, omit=omit)
            for key, val in value.items()
            if val != omit
        }
    elif isinstance(value, list):
        return [
            __recursive_strip_omit(item, omit=omit) for item in value if item != omit
        ]
    elif value != omit:
        return value
