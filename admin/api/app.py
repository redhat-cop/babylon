import logging
import psycopg2
import os

from asgi_tools import App, ResponseError
from datetime import datetime, timezone
from logging import Formatter, FileHandler
from utils import execute_query

from babylon import Babylon

logger = logging.getLogger('babylon-admin-api')

CREATE_SCHEMA = """CREATE SCHEMA IF NOT EXISTS babylon-admin; SET schema 'babylon-admin';"""
CREATE_INCIDENTS_TABLE = """CREATE TABLE IF NOT EXISTS incidents (
                        id SERIAL PRIMARY KEY, 
                        status enum ('active', 'resolved') NOT NULL,
                        incident_type enum ('general'),
                        message TEXT,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    );"""
INSERT_INCIDENT = (
    """INSERT INTO incidents (status, message) 
    VALUES (%(status)s, %(message)s);"""
)
UPDATE_INCIDENT = (
    """UPDATE incidents SET 
        status = %(status)s, 
        incident_type = %(incident_type)s, 
        message = %(message)s, 
        updated_at = NOW() 
    WHERE id = %(incident_id)s;"""
)
GET_INCIDENTS_BY_STATUS = (
    """SELECT * FROM incidents WHERE status = %s;"""
)

app = App()

@app.on_startup
async def on_startup():
    await Babylon.on_startup()
    # await execute_query(CREATE_SCHEMA)
    await execute_query(CREATE_INCIDENTS_TABLE)

@app.on_shutdown
async def on_cleanup():
    await Babylon.on_cleanup()

@app.route("/", methods=['GET'])
async def index(request):
    return 200, '<h1>Babylon Admin API</h1>'

@app.route("/api/admin/v1/incidents", methods=['GET'])
async def incidents_get(request):
    args = request.args
    status = args.get("status", 'active')
    query = await execute_query(GET_INCIDENTS_BY_STATUS, {
                'status': status,
            })
    return query.get("result", [])

@app.route("/api/admin/v1/incidents", methods=['POST'])
async def create_incident(request):
    schema = Schema({
        "status": And(str, len),
        "incident_type": And(str, len, lambda s: s in ('active', 'resolved')),
        "message": And(str, len)
    })
    data = await request.data()
    try:
        validated = schema.validate(data)
    except Exception as e:
        logger.info(f"Invalid incident params - {e}")
        return 400, 'Invalid parameters'
    status = data["status"]
    incident_type = data["incident_type"]
    message = data["message"]
    logger.info(f"New incident {status} - {incident_type} - {message}")
    try: 
        await execute_query(INSERT_INCIDENT, {
            'status': status,
            'incident_type': incident_type, 
            'message': message
        })
    except:
        return 400, 'Invalid parameters'
    return 200, 'Incident created.'

@app.route("/api/admin/v1/incidents/{incident_id}", methods=['POST'])
async def update_incident(request):
    schema = Schema({
        "status": And(str, len),
        "incident_type": And(str, len, lambda s: s in ('active', 'resolved')),
        "message": And(str, len)
    })
    data = await request.data()
    try:
        validated = schema.validate(data)
    except Exception as e:
        logger.info(f"Invalid incident params - {e}")
        return 400, 'Invalid parameters'
    incident_id = request.path_params.get("incident_id")
    status = data["status"]
    incident_type = data["incident_type"]
    message = data["message"]
    logger.info(f"Update incident {incident_id} - {status} - {incident_type} - {message}")
    try: 
        await execute_query(UPDATE_INCIDENT, {
            'status': status,
            'incident_type': incident_type, 
            'message': message,
            'incident_id': incident_id
        })
    except:
        return 400, 'Invalid parameters'
    return 200, 'Incident updated.'