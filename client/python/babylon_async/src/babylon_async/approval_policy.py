"""Catalog item approval policy compiler and evaluator.

The canonical copy of this module is
client/python/babylon_async/src/babylon_async/approval_policy.py. It is
vendored byte-for-byte as catalog/api/approval_policy.py because the catalog
API image is built from catalog/api only. Edit the canonical copy and copy it;
catalog/api/test_approval_policy.py fails if the copies differ.

This module uses only the Python standard library and never evaluates code,
templates or expressions from policy documents. Policies are data: a bounded
tree of `all` / `any` nodes with typed comparison leaves.

AgnosticV source (`__meta__.catalog.approval_policy`):

    version: v1
    default: not_required | manager_required
    default_reason: Text shown when default requires approval
    default_override_reason: Required when `default: not_required` is explicit
    approval:
      approver: requester_manager
      expires_after: 72h
    retry:
      window: 72h
      max_attempts: 3
    rules:
      <rule_id>:
        when: <condition>
        require: manager
        reason: Text shown to requester and approver
        disabled: false
        disabled_reason: Required when disabled is true

Condition:

    {all: [<condition>, ...]}
    {any: [<condition>, ...]}
    {field: request.quantity, op: gte, value: 20}

Published CatalogItem field (`spec.approvalPolicy`) uses camelCase keys, a
sorted list of rules and a digest of the semantic content. See
docs/Catalog_Item_Orders.md for the full contract.
"""

import hashlib
import json
import math
import re

POLICY_VERSION = 'v1'
EVALUATOR_VERSION = 'v1'
SUPPORTED_VERSIONS = (POLICY_VERSION,)

STATE_VALID = 'Valid'
STATE_INVALID = 'Invalid'

DEFAULT_NOT_REQUIRED = 'not_required'
DEFAULT_MANAGER_REQUIRED = 'manager_required'
REQUIRE_MANAGER = 'manager'
APPROVER_REQUESTER_MANAGER = 'requester_manager'
DEFAULT_RULE_ID = 'default'
DEFAULT_REASON = 'Manager approval is required for this catalog item.'

MAX_RULES = 50
MAX_DEPTH = 5
MAX_CHILDREN = 20
MAX_NODES = 200
MAX_IN_VALUES = 50
MAX_TEXT_LENGTH = 500
MAX_STRING_VALUE_LENGTH = 256
MIN_EXPIRES_AFTER_SECONDS = 3600
MAX_EXPIRES_AFTER_SECONDS = 30 * 86400
MAX_RETRY_WINDOW_SECONDS = 30 * 86400
MAX_RETRY_ATTEMPTS = 10

OPERATORS = ('eq', 'ne', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'exists')
NUMERIC_OPERATORS = ('gt', 'gte', 'lt', 'lte')
LIST_OPERATORS = ('in', 'not_in')

REQUEST_FIELDS = {
    'request.order_type': 'string',
    'request.purpose': 'string',
    'request.activity': 'string',
    'request.quantity': 'integer',
    'request.duration_hours': 'number',
}
PARAMETER_FIELD_PREFIX = 'parameters.'
# Order form fields that the catalog UI excludes from parameters. Their values
# come from dedicated order fields, so policies must use request.* instead.
RESERVED_PARAMETERS = ('purpose', 'purpose_activity', 'purpose_explanation', 'salesforce_id')

_RULE_ID_RE = re.compile(r'^[a-z0-9]([a-z0-9_-]{0,61}[a-z0-9])?$')
_PARAMETER_NAME_RE = re.compile(r'^[A-Za-z_][A-Za-z0-9_-]{0,127}$')
_DURATION_RE = re.compile(r'^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$')

_TOP_LEVEL_KEYS = {
    'version', 'default', 'default_reason', 'default_override_reason',
    'approval', 'retry', 'rules',
}
_APPROVAL_KEYS = {'approver', 'expires_after'}
_RETRY_KEYS = {'window', 'max_attempts'}
_RULE_KEYS = {'when', 'require', 'reason', 'disabled', 'disabled_reason'}

# Published (camelCase) to source (snake_case) key mapping.
_PUBLISHED_TOP_LEVEL_KEYS = {
    'version': 'version',
    'default': 'default',
    'defaultReason': 'default_reason',
    'defaultOverrideReason': 'default_override_reason',
}
_PUBLISHED_APPROVAL_KEYS = {'approver': 'approver', 'expiresAfter': 'expires_after'}
_PUBLISHED_RETRY_KEYS = {'window': 'window', 'maxAttempts': 'max_attempts'}
_PUBLISHED_RULE_KEYS = {
    'when': 'when',
    'require': 'require',
    'reason': 'reason',
    'disabled': 'disabled',
    'disabledReason': 'disabled_reason',
}
_PUBLISHED_METADATA_KEYS = {'state', 'digest', 'evaluatorVersion', 'source', 'errors'}


class ApprovalPolicyError(Exception):
    """Raised for an invalid policy document."""

    def __init__(self, errors):
        if isinstance(errors, str):
            errors = [errors]
        super().__init__('; '.join(errors))
        self.errors = list(errors)


class ApprovalPolicyEvaluationError(Exception):
    """Raised when a valid policy cannot be evaluated against the inputs."""


def _canonical_numbers(value):
    # Kubernetes returns a stored 2.0 as 2, so whole-number floats digest as
    # integers to keep digests stable across a store/read round trip.
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, dict):
        return {key: _canonical_numbers(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_canonical_numbers(item) for item in value]
    return value


def canonical_json(value):
    """Return canonical JSON used for digests."""
    return json.dumps(
        _canonical_numbers(value), sort_keys=True, separators=(',', ':'),
        ensure_ascii=False, allow_nan=False,
    )


def sha256_digest(value):
    """Return `sha256:<hex>` digest of canonical JSON for value."""
    return 'sha256:' + hashlib.sha256(canonical_json(value).encode('utf-8')).hexdigest()


def parse_duration(value):
    """Parse duration like `72h`, `3d` or `1d12h` into seconds.

    Returns None for invalid or empty values."""
    if not isinstance(value, str) or not value:
        return None
    match = _DURATION_RE.match(value)
    if not match or not any(match.groups()):
        return None
    days, hours, minutes, seconds = (int(group or 0) for group in match.groups())
    return days * 86400 + hours * 3600 + minutes * 60 + seconds


def value_type(value):
    """Return the policy type name for a JSON value."""
    if isinstance(value, bool):
        return 'boolean'
    if isinstance(value, int):
        return 'integer'
    if isinstance(value, float):
        return 'number'
    if isinstance(value, str):
        return 'string'
    if value is None:
        return 'null'
    if isinstance(value, list):
        return 'array'
    if isinstance(value, dict):
        return 'object'
    return 'unknown'


def _type_category(type_name):
    if type_name in ('integer', 'number'):
        return 'number'
    return type_name


def _is_scalar(value):
    if isinstance(value, float) and not math.isfinite(value):
        return False
    return value_type(value) in ('boolean', 'integer', 'number', 'string')


def parameter_types(parameter_specs):
    """Return {name: declared type or None} for CatalogItem spec.parameters."""
    types = {}
    for parameter in parameter_specs or []:
        if not isinstance(parameter, dict):
            continue
        name = parameter.get('name')
        if not isinstance(name, str) or not name:
            continue
        schema = parameter.get('openAPIV3Schema')
        declared = schema.get('type') if isinstance(schema, dict) else None
        types[name] = declared if isinstance(declared, str) else None
    return types


class _Compiler:
    def __init__(self, parameter_specs):
        self.errors = []
        self.node_count = 0
        self.parameter_types = (
            None if parameter_specs is None else parameter_types(parameter_specs)
        )

    def error(self, message):
        self.errors.append(message)

    def text(self, value, path, required=False):
        if value is None:
            if required:
                self.error(f"{path} is required")
            return None
        if not isinstance(value, str) or not value.strip():
            self.error(f"{path} must be a non-empty string")
            return None
        if len(value) > MAX_TEXT_LENGTH:
            self.error(f"{path} must be at most {MAX_TEXT_LENGTH} characters")
            return None
        return value

    def unknown_keys(self, value, allowed, path):
        for key in value:
            if key not in allowed:
                self.error(f"{path}.{key} is not a supported field")

    def duration(self, value, path, minimum, maximum):
        seconds = parse_duration(value)
        if seconds is None:
            self.error(f"{path} must be a duration such as 72h or 3d")
            return None
        if seconds < minimum or seconds > maximum:
            self.error(f"{path} must be between {minimum} and {maximum} seconds")
            return None
        return value

    def field_type(self, field, path):
        if not isinstance(field, str) or not field:
            self.error(f"{path}.field must be a non-empty string")
            return None, False
        if field in REQUEST_FIELDS:
            return REQUEST_FIELDS[field], True
        if field.startswith(PARAMETER_FIELD_PREFIX):
            name = field[len(PARAMETER_FIELD_PREFIX):]
            if not _PARAMETER_NAME_RE.match(name):
                self.error(f"{path}.field {field!r} is not a valid parameter reference")
                return None, False
            if name in RESERVED_PARAMETERS:
                self.error(
                    f"{path}.field {field!r} is set from order fields, not parameters; "
                    "use request.purpose or request.activity"
                )
                return None, False
            if self.parameter_types is None:
                return None, True
            if name not in self.parameter_types:
                self.error(f"{path}.field {field!r} references an undefined catalog parameter")
                return None, False
            return self.parameter_types[name], True
        self.error(
            f"{path}.field {field!r} is not supported; use one of "
            f"{', '.join(sorted(REQUEST_FIELDS))} or parameters.<name>"
        )
        return None, False

    def literal(self, value, path):
        if not _is_scalar(value):
            self.error(f"{path} must be a string, number or boolean")
            return False
        if isinstance(value, str) and len(value) > MAX_STRING_VALUE_LENGTH:
            self.error(f"{path} must be at most {MAX_STRING_VALUE_LENGTH} characters")
            return False
        return True

    def compatible(self, declared, literal, path):
        if declared is None:
            return
        declared_category = _type_category(declared)
        if declared_category not in ('boolean', 'number', 'string'):
            self.error(f"{path} compares field of unsupported type {declared!r}")
            return
        if _type_category(value_type(literal)) != declared_category:
            self.error(
                f"{path} has type {value_type(literal)!r} but field has type {declared!r}"
            )

    def condition(self, node, path, depth):
        self.node_count += 1
        if self.node_count > MAX_NODES:
            if self.node_count == MAX_NODES + 1:
                self.error(f"policy has more than {MAX_NODES} condition nodes")
            return None
        if depth > MAX_DEPTH:
            self.error(f"{path} exceeds maximum nesting depth of {MAX_DEPTH}")
            return None
        if not isinstance(node, dict):
            self.error(f"{path} must be a mapping")
            return None
        kinds = [key for key in ('all', 'any', 'field') if key in node]
        if len(kinds) != 1:
            self.error(f"{path} must contain exactly one of all, any or field")
            return None
        kind = kinds[0]
        if kind in ('all', 'any'):
            self.unknown_keys(node, {kind}, path)
            children = node[kind]
            if not isinstance(children, list) or not children:
                self.error(f"{path}.{kind} must be a non-empty list")
                return None
            if len(children) > MAX_CHILDREN:
                self.error(f"{path}.{kind} must have at most {MAX_CHILDREN} entries")
                return None
            compiled = [
                self.condition(child, f"{path}.{kind}[{index}]", depth + 1)
                for index, child in enumerate(children)
            ]
            if any(child is None for child in compiled):
                return None
            return {kind: compiled}

        self.unknown_keys(node, {'field', 'op', 'value'}, path)
        declared, field_ok = self.field_type(node.get('field'), path)
        op = node.get('op')
        if op not in OPERATORS:
            self.error(f"{path}.op must be one of {', '.join(OPERATORS)}")
            return None
        if not field_ok:
            return None
        compiled = {'field': node['field'], 'op': op}
        if op == 'exists':
            value = node.get('value', True)
            if not isinstance(value, bool):
                self.error(f"{path}.value must be a boolean for exists")
                return None
            compiled['value'] = value
            return compiled
        if 'value' not in node:
            self.error(f"{path}.value is required for {op}")
            return None
        value = node['value']
        if op in LIST_OPERATORS:
            if not isinstance(value, list) or not value:
                self.error(f"{path}.value must be a non-empty list for {op}")
                return None
            if len(value) > MAX_IN_VALUES:
                self.error(f"{path}.value must have at most {MAX_IN_VALUES} entries")
                return None
            if not all(self.literal(item, f"{path}.value[{index}]") for index, item in enumerate(value)):
                return None
            categories = {_type_category(value_type(item)) for item in value}
            if len(categories) != 1:
                self.error(f"{path}.value entries must all have the same type")
                return None
            for index, item in enumerate(value):
                self.compatible(declared, item, f"{path}.value[{index}]")
        else:
            if not self.literal(value, f"{path}.value"):
                return None
            if op in NUMERIC_OPERATORS and _type_category(value_type(value)) != 'number':
                self.error(f"{path}.value must be a number for {op}")
                return None
            self.compatible(declared, value, f"{path}.value")
        compiled['value'] = value
        return compiled

    def compile(self, raw):
        if not isinstance(raw, dict):
            raise ApprovalPolicyError('approval_policy must be a mapping')
        self.unknown_keys(raw, _TOP_LEVEL_KEYS, 'approval_policy')

        version = raw.get('version')
        if version is None:
            self.error('approval_policy.version is required')
        elif version not in SUPPORTED_VERSIONS:
            self.error(
                f"approval_policy.version {version!r} is not supported; "
                f"supported versions: {', '.join(SUPPORTED_VERSIONS)}"
            )

        compiled = {'version': version}

        default = raw.get('default', DEFAULT_NOT_REQUIRED)
        if default not in (DEFAULT_NOT_REQUIRED, DEFAULT_MANAGER_REQUIRED):
            self.error(
                f"approval_policy.default must be {DEFAULT_NOT_REQUIRED} or "
                f"{DEFAULT_MANAGER_REQUIRED}"
            )
        compiled['default'] = default
        default_reason = self.text(raw.get('default_reason'), 'approval_policy.default_reason')
        if default_reason is not None:
            compiled['default_reason'] = default_reason
        override_reason = self.text(
            raw.get('default_override_reason'), 'approval_policy.default_override_reason'
        )
        if 'default' in raw and default == DEFAULT_NOT_REQUIRED:
            # An explicit `not_required` is how an included/shared
            # `manager_required` default is overridden by a merge. Make that
            # override visible and justified rather than silent.
            if override_reason is None and 'default_override_reason' not in raw:
                self.error(
                    'approval_policy.default_override_reason is required when '
                    'default is explicitly not_required'
                )
        if override_reason is not None:
            compiled['default_override_reason'] = override_reason

        approval = raw.get('approval', {})
        if not isinstance(approval, dict):
            self.error('approval_policy.approval must be a mapping')
        else:
            self.unknown_keys(approval, _APPROVAL_KEYS, 'approval_policy.approval')
            approver = approval.get('approver', APPROVER_REQUESTER_MANAGER)
            if approver != APPROVER_REQUESTER_MANAGER:
                self.error(
                    f"approval_policy.approval.approver must be {APPROVER_REQUESTER_MANAGER}"
                )
            compiled['approval'] = {'approver': approver}
            if 'expires_after' in approval:
                expires_after = self.duration(
                    approval['expires_after'], 'approval_policy.approval.expires_after',
                    MIN_EXPIRES_AFTER_SECONDS, MAX_EXPIRES_AFTER_SECONDS,
                )
                if expires_after is not None:
                    compiled['approval']['expires_after'] = expires_after

        if 'retry' in raw:
            retry = raw['retry']
            if not isinstance(retry, dict):
                self.error('approval_policy.retry must be a mapping')
            else:
                self.unknown_keys(retry, _RETRY_KEYS, 'approval_policy.retry')
                compiled_retry = {}
                if 'window' in retry:
                    window = self.duration(
                        retry['window'], 'approval_policy.retry.window',
                        0, MAX_RETRY_WINDOW_SECONDS,
                    )
                    if window is not None:
                        compiled_retry['window'] = window
                if 'max_attempts' in retry:
                    max_attempts = retry['max_attempts']
                    if (
                        isinstance(max_attempts, bool)
                        or not isinstance(max_attempts, int)
                        or not 1 <= max_attempts <= MAX_RETRY_ATTEMPTS
                    ):
                        self.error(
                            'approval_policy.retry.max_attempts must be an integer '
                            f"between 1 and {MAX_RETRY_ATTEMPTS}"
                        )
                    else:
                        compiled_retry['max_attempts'] = max_attempts
                compiled['retry'] = compiled_retry

        rules = raw.get('rules', {})
        compiled_rules = []
        if isinstance(rules, list):
            self.error(
                'approval_policy.rules must be a mapping keyed by rule id; lists '
                'are replaced wholesale when AgnosticV files are merged'
            )
        elif not isinstance(rules, dict):
            self.error('approval_policy.rules must be a mapping keyed by rule id')
        elif len(rules) > MAX_RULES:
            self.error(f"approval_policy.rules must have at most {MAX_RULES} rules")
        else:
            for rule_id in sorted(rules, key=str):
                compiled_rule = self.rule(rule_id, rules[rule_id])
                if compiled_rule is not None:
                    compiled_rules.append(compiled_rule)
        compiled['rules'] = compiled_rules

        if self.errors:
            raise ApprovalPolicyError(self.errors)
        return compiled

    def rule(self, rule_id, rule):
        path = f"approval_policy.rules.{rule_id}"
        if not isinstance(rule_id, str) or not _RULE_ID_RE.match(rule_id):
            self.error(f"{path}: rule id must match {_RULE_ID_RE.pattern}")
            return None
        if rule_id == DEFAULT_RULE_ID:
            self.error(f"{path}: rule id {DEFAULT_RULE_ID!r} is reserved")
            return None
        if not isinstance(rule, dict):
            self.error(f"{path} must be a mapping")
            return None
        self.unknown_keys(rule, _RULE_KEYS, path)
        if rule.get('require') != REQUIRE_MANAGER:
            self.error(f"{path}.require must be {REQUIRE_MANAGER}")
        reason = self.text(rule.get('reason'), f"{path}.reason", required=True)
        disabled = rule.get('disabled', False)
        if not isinstance(disabled, bool):
            self.error(f"{path}.disabled must be a boolean")
            disabled = False
        disabled_reason = self.text(rule.get('disabled_reason'), f"{path}.disabled_reason")
        if disabled and disabled_reason is None and 'disabled_reason' not in rule:
            self.error(f"{path}.disabled_reason is required when disabled is true")
        if 'when' not in rule:
            self.error(f"{path}.when is required")
            return None
        when = self.condition(rule['when'], f"{path}.when", 1)
        if when is None or reason is None:
            return None
        compiled = {
            'id': rule_id,
            'when': when,
            'require': REQUIRE_MANAGER,
            'reason': reason,
        }
        if disabled:
            compiled['disabled'] = True
        if disabled_reason is not None:
            compiled['disabled_reason'] = disabled_reason
        return compiled


def _published_from_compiled(compiled):
    published = {
        'version': compiled['version'],
        'default': compiled['default'],
    }
    if 'default_reason' in compiled:
        published['defaultReason'] = compiled['default_reason']
    if 'default_override_reason' in compiled:
        published['defaultOverrideReason'] = compiled['default_override_reason']
    approval = {'approver': compiled['approval']['approver']}
    if 'expires_after' in compiled['approval']:
        approval['expiresAfter'] = compiled['approval']['expires_after']
    published['approval'] = approval
    if 'retry' in compiled:
        retry = {}
        if 'window' in compiled['retry']:
            retry['window'] = compiled['retry']['window']
        if 'max_attempts' in compiled['retry']:
            retry['maxAttempts'] = compiled['retry']['max_attempts']
        published['retry'] = retry
    rules = []
    for rule in compiled['rules']:
        entry = {
            'id': rule['id'],
            'when': rule['when'],
            'require': rule['require'],
            'reason': rule['reason'],
        }
        if rule.get('disabled'):
            entry['disabled'] = True
        if 'disabled_reason' in rule:
            entry['disabledReason'] = rule['disabled_reason']
        rules.append(entry)
    published['rules'] = rules
    return published


def _semantic_digest(published):
    return sha256_digest({
        key: value for key, value in published.items()
        if key not in _PUBLISHED_METADATA_KEYS
    })


def compile_approval_policy(raw, parameter_specs=None, source=None):
    """Compile AgnosticV `approval_policy` into the published CatalogItem form.

    Always returns a dict. An invalid policy is published with
    `state: Invalid` and `errors` so that ordering blocks rather than
    silently falling back to an older or absent policy.

    parameter_specs is CatalogItem `spec.parameters` (list) used to verify
    parameter references and literal types. source is optional provenance.
    """
    compiler = _Compiler(parameter_specs)
    try:
        compiled = compiler.compile(raw)
    except ApprovalPolicyError as exception:
        published = {
            'state': STATE_INVALID,
            'errors': exception.errors[:20],
            'evaluatorVersion': EVALUATOR_VERSION,
        }
        if isinstance(raw, dict) and isinstance(raw.get('version'), str):
            published['version'] = raw['version'][:32]
        try:
            published['digest'] = sha256_digest(raw)
        except (TypeError, ValueError):
            published['digest'] = sha256_digest(repr(raw))
        if source:
            published['source'] = source
        return published
    published = _published_from_compiled(compiled)
    published['state'] = STATE_VALID
    published['evaluatorVersion'] = EVALUATOR_VERSION
    published['digest'] = _semantic_digest(published)
    if source:
        published['source'] = source
    return published


def _raw_from_published(published):
    """Convert published camelCase policy back to AgnosticV form so that the
    same validator checks both. Unknown keys are preserved to be rejected."""
    raw = {}
    for key, value in published.items():
        if key in _PUBLISHED_METADATA_KEYS:
            continue
        if key in _PUBLISHED_TOP_LEVEL_KEYS:
            raw[_PUBLISHED_TOP_LEVEL_KEYS[key]] = value
        elif key == 'approval' and isinstance(value, dict):
            raw['approval'] = {
                _PUBLISHED_APPROVAL_KEYS.get(k, k): v for k, v in value.items()
            }
        elif key == 'retry' and isinstance(value, dict):
            raw['retry'] = {
                _PUBLISHED_RETRY_KEYS.get(k, k): v for k, v in value.items()
            }
        elif key == 'rules' and isinstance(value, list):
            rules = {}
            for index, rule in enumerate(value):
                if not isinstance(rule, dict) or not isinstance(rule.get('id'), str):
                    raise ApprovalPolicyError(f"rules[{index}] must be a mapping with an id")
                if rule['id'] in rules:
                    raise ApprovalPolicyError(f"rules[{index}] duplicates rule id {rule['id']!r}")
                rules[rule['id']] = {
                    _PUBLISHED_RULE_KEYS.get(k, k): v
                    for k, v in rule.items() if k != 'id'
                }
            raw['rules'] = rules
        else:
            raw[key] = value
    # `default` is always published explicitly; the override reason rule only
    # applies to AgnosticV sources.
    if raw.get('default') == DEFAULT_NOT_REQUIRED and 'default_override_reason' not in raw:
        raw = dict(raw)
        raw.pop('default')
    return raw


class LoadedPolicy:
    """A validated published policy ready for evaluation."""

    def __init__(self, published, compiled):
        self.published = published
        self.compiled = compiled

    @property
    def digest(self):
        return self.published['digest']

    @property
    def version(self):
        return self.compiled['version']

    @property
    def approval(self):
        return self.compiled['approval']

    @property
    def retry(self):
        return self.compiled.get('retry', {})

    @property
    def rules(self):
        return self.compiled['rules']


def load_published_policy(published, parameter_specs=None):
    """Validate a published CatalogItem `spec.approvalPolicy`.

    Returns LoadedPolicy. Raises ApprovalPolicyError if the policy was
    published invalid, fails validation, uses an unsupported version, or its
    digest does not match its content."""
    if not isinstance(published, dict):
        raise ApprovalPolicyError('approvalPolicy must be a mapping')
    state = published.get('state')
    if state == STATE_INVALID:
        errors = published.get('errors')
        if not isinstance(errors, list) or not errors:
            errors = ['approvalPolicy was published as invalid']
        raise ApprovalPolicyError([str(error) for error in errors])
    if state != STATE_VALID:
        raise ApprovalPolicyError(f"approvalPolicy.state {state!r} is not supported")
    raw = _raw_from_published(published)
    compiled = _Compiler(parameter_specs).compile(raw)
    expected = _semantic_digest(_published_from_compiled(compiled))
    if published.get('digest') != expected:
        raise ApprovalPolicyError('approvalPolicy.digest does not match policy content')
    return LoadedPolicy(published, compiled)


def _resolve(field, inputs):
    if field in inputs.get('unavailable_fields', ()):
        raise ApprovalPolicyEvaluationError(
            f"{field} is not a validated input for this catalog item"
        )
    if field in REQUEST_FIELDS:
        key = field[len('request.'):]
        request = inputs.get('request') or {}
        return key in request and request[key] is not None, request.get(key)
    name = field[len(PARAMETER_FIELD_PREFIX):]
    parameters = inputs.get('parameters') or {}
    declared = inputs.get('parameter_names')
    if declared is not None and name not in declared:
        raise ApprovalPolicyEvaluationError(
            f"{field} references an undefined catalog parameter"
        )
    return name in parameters and parameters[name] is not None, parameters.get(name)


def _check_actual(field, actual, literal):
    if not _is_scalar(actual):
        raise ApprovalPolicyEvaluationError(
            f"{field} has unsupported value type {value_type(actual)!r}"
        )
    if _type_category(value_type(actual)) != _type_category(value_type(literal)):
        raise ApprovalPolicyEvaluationError(
            f"{field} has type {value_type(actual)!r} but policy compares "
            f"{value_type(literal)!r}"
        )


def _evaluate(node, inputs):
    if 'all' in node:
        results = [_evaluate(child, inputs) for child in node['all']]
        return all(results)
    if 'any' in node:
        results = [_evaluate(child, inputs) for child in node['any']]
        return any(results)
    field = node['field']
    op = node['op']
    present, actual = _resolve(field, inputs)
    if op == 'exists':
        return present == node['value']
    if not present:
        return False
    literal = node['value']
    if op in LIST_OPERATORS:
        _check_actual(field, actual, literal[0])
        matched = actual in literal
        return matched if op == 'in' else not matched
    _check_actual(field, actual, literal)
    if op == 'eq':
        return actual == literal
    if op == 'ne':
        return actual != literal
    if op == 'gt':
        return actual > literal
    if op == 'gte':
        return actual >= literal
    if op == 'lt':
        return actual < literal
    return actual <= literal


def evaluate_approval_policy(published, request, parameters, parameter_specs=None,
                             unavailable_fields=()):
    """Evaluate a published policy for a normalized order.

    request: {order_type, purpose, activity, quantity, duration_hours}
    parameters: normalized effective parameter values
    parameter_specs: CatalogItem spec.parameters
    unavailable_fields: fields that are not validated for this order, such as
        request.purpose for items without purpose options. Referencing one is
        an evaluation error rather than an absent value, so that `ne` and
        `not_in` cannot be satisfied by free text or omission.

    Returns a result dict:

        state: NotConfigured | Evaluated | Invalid | Error
        approvalRequired: bool
        matchedRules: [{id, reason}]
        disabledRules: [{id, reason}]
        errors: [str]
        policy: published policy snapshot (or None)
        policyDigest, policyVersion, evaluatorVersion

    `Invalid` and `Error` results must block the order. They never imply
    that approval is not required.
    """
    result = {
        'approvalRequired': False,
        'disabledRules': [],
        'errors': [],
        'evaluatorVersion': EVALUATOR_VERSION,
        'matchedRules': [],
        'policy': None,
        'policyDigest': None,
        'policyVersion': None,
    }
    if published is None:
        result['state'] = 'NotConfigured'
        return result
    result['policy'] = published
    if isinstance(published, dict):
        result['policyDigest'] = published.get('digest')
        result['policyVersion'] = published.get('version')
    try:
        loaded = load_published_policy(published, parameter_specs)
    except ApprovalPolicyError as exception:
        result['state'] = 'Invalid'
        result['approvalRequired'] = True
        result['errors'] = exception.errors
        return result

    inputs = {
        'request': request or {},
        'parameters': parameters or {},
        'unavailable_fields': set(unavailable_fields or ()),
        'parameter_names': (
            None if parameter_specs is None else set(parameter_types(parameter_specs))
        ),
    }
    if loaded.compiled['default'] == DEFAULT_MANAGER_REQUIRED:
        result['matchedRules'].append({
            'id': DEFAULT_RULE_ID,
            'reason': loaded.compiled.get('default_reason', DEFAULT_REASON),
        })
    try:
        for rule in loaded.rules:
            if rule.get('disabled'):
                result['disabledRules'].append({
                    'id': rule['id'],
                    'reason': rule.get('disabled_reason', ''),
                })
                continue
            if _evaluate(rule['when'], inputs):
                result['matchedRules'].append({'id': rule['id'], 'reason': rule['reason']})
    except ApprovalPolicyEvaluationError as exception:
        result['state'] = 'Error'
        result['approvalRequired'] = True
        result['matchedRules'] = []
        result['errors'] = [str(exception)]
        return result
    result['state'] = 'Evaluated'
    result['approvalRequired'] = bool(result['matchedRules'])
    return result
