"""Seat allocation for multi-asset workshop provisions."""
from math import ceil, isfinite


def num_users_schema(catalog_spec):
    if catalog_spec.get('multiuser') is not True:
        return None
    for parameter in catalog_spec.get('parameters', []):
        if parameter.get('name') == 'num_users':
            return parameter.get('openAPIV3Schema') or {}
    return None


def user_capacity(schema):
    maximum = schema.get('maximum')
    if (isinstance(maximum, (int, float)) and not isinstance(maximum, bool)
            and isfinite(maximum) and maximum >= 1):
        return int(maximum)
    return None


def provision_count(catalog_spec, seats):
    schema = num_users_schema(catalog_spec)
    if schema is None:
        return seats
    maximum = user_capacity(schema)
    return ceil(seats / maximum) if maximum else 1


def next_instance_users(schema, total_users, allocated_users):
    remaining = max(0, total_users - allocated_users)
    maximum = user_capacity(schema)
    return min(remaining, maximum) if maximum else remaining
