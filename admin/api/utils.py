import os
import base64
import json
import psycopg2
import re
import logging

from psycopg2.extras import DictCursor
from psycopg2 import ProgrammingError
from psycopg2 import pool
from retrying import retry
from decimal import Decimal
from datetime import datetime, timezone, timedelta
from babylon import Babylon

logger = logging.getLogger('babylon-admin-api')

@retry(stop_max_attempt_number=3, wait_exponential_multiplier=500, wait_exponential_max=5000)
async def get_secret_data(secret_name, secret_namespace=None):
    if os.path.exists('/run/secrets/kubernetes.io/serviceaccount/namespace'):
        current_namespace = open('/run/secrets/kubernetes.io/serviceaccount/namespace').read()
    else:
        current_namespace = 'babylon-catalog-dev'
    secret = await Babylon.core_v1_api.read_namespaced_secret(
        secret_name, current_namespace
    )
    data = {k: base64.b64decode(v).decode('utf-8') for (k, v) in secret.data.items()}

    # Attempt to evaluate secret data values as YAML
    for k, v in data.items():
        try:
            data[k] = json.loads(v)
        except json.decoder.JSONDecodeError:
            pass
    return data


async def get_conn_params(secret_name='gpte-db-secrets'):
    """Get connection parameters from the passed dictionary.
    Return a dictionary with parameters to connect to PostgreSQL server.
    """
    params_dict = await get_secret_data(secret_name)
    params_map = {
        "hostname": "host",
        "username": "user",
        "password": "password",
        "port": "port",
        "ssl_mode": "sslmode",
        "ca_cert": "sslrootcert",
        "dbname": "database",
        "options": "options"
    }

    kw = dict((params_map[k], v) for (k, v) in params_dict.items()
              if k in params_map and v != '' and v is not None)

    return kw


@retry(stop_max_attempt_number=3, wait_exponential_multiplier=500, wait_exponential_max=5000)
async def connect_to_db(fail_on_conn=True):
    """ Connect to database and returns connection pool
    :param fail_on_conn:
    :return: connection pool
    """
    db_connection = None
    conn_params = await get_conn_params()
    try:
        db_connection = pool.ThreadedConnectionPool(2, 4, **conn_params)

    except TypeError as e:
        if 'sslrootcert' in e.args[0]:
            logger.error("Postgresql server must be at least version 8.4 to support sslrootcert")
        if fail_on_conn:
            logger.error(f"unable to connect to database: {e}")
        else:
            logger.error(f"PostgreSQL server is unavailable: {e}")
            db_connection = None
    except Exception as e:
        if fail_on_conn:
            logger.error(f"unable to connect to database: {e}")
        else:
            logger.error(f"PostgreSQL server is unavailable: {e}")
            db_connection = None

    return db_connection

async def execute_query(query, positional_args=None, autocommit=True):
    db_connection = await connect_to_db()
    db_pool_conn = db_connection.getconn()

    encoding = 'utf-8'
    if encoding is not None:
        db_pool_conn.set_client_encoding(encoding)

    cursor = db_pool_conn.cursor(cursor_factory=DictCursor)

    # Prepare args:
    if positional_args:
        arguments = positional_args
    else:
        arguments = None

    query_result = []
    rowcount = 0
    statusmessage = ''
    try:
        cursor.execute(query, arguments)
        statusmessage = cursor.statusmessage
        if cursor.rowcount > 0:
            rowcount += cursor.rowcount

        try:
            for row in cursor.fetchall():
                # Ansible engine does not support decimals.
                # An explicit conversion is required on the module's side
                row = dict(row)

                for (key, val) in row.items():
                    if isinstance(val, Decimal):
                        row[key] = float(val)

                    elif isinstance(val, timedelta):
                        row[key] = str(val)

                    elif isinstance(val, datetime):
                        row[key] = val.isoformat()

                query_result.append(row)
        except ProgrammingError as e:
            query_result = []
        except Exception as e:
            logger.error(f"Cannot fetch rows from cursor: {e}")

    except Exception as e:
        db_pool_conn.rollback()
        cursor.close()
        db_connection.putconn(db_pool_conn)
        db_connection.closeall()
        logger.error("Cannot execute SQL \n"
                    "Query: '%s' \n"
                    "Arguments: %s: \n"
                    "Error: %s, \n"
                    "query list: %s\n"
                    "" % (query, arguments, e))
    
    try:
        if autocommit:
            db_pool_conn.commit()
        else:
            db_pool_conn.rollback()

        kw = dict(
            querystring=cursor.query,
            statusmessage=statusmessage,
            result=query_result,
            rowcount=rowcount,
        )
        cursor.close()
        db_connection.putconn(db_pool_conn)
        db_connection.closeall()
        del db_connection

        return kw
    except Exception as e:
        logger.error(f"ERROR closing connection {e}")
        pass