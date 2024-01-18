import os
import logging
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from babylon import Babylon
from routers import incidents
from models import Database as db
from models.custom_base import create_tables
from datetime import datetime


logger = logging.getLogger('babylon-api')


app = FastAPI()


@app.on_event("startup")
async def on_startup():
    await Babylon.on_startup()
    await db.initialize()
    await create_tables()


@app.on_event("shutdown")
async def on_cleanup():
    await Babylon.on_cleanup()
    await db.shutdown()


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    client_ip = request.client.host
    msg = f"Index page requested by IP: {client_ip}"
    user_agent = request.headers.get('user-agent')
    msg += f", User-Agent: {user_agent}"
    referer = request.headers.get('referer')
    msg += f", Referer: {referer}"
    request_method = request.method
    msg += f", Method: {request_method}"
    logger.warning(msg)

    return "<h1>Babylon Incident API</h1>"


@app.middleware("http")
async def log_access(request: Request, call_next):
    start_time = datetime.now()

    response = await call_next(request)

    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds() * 1000

    log_data = {
        "client_host": request.client.host,
        "method": request.method,
        "path": request.url.path,
        "query": request.url.query,
        "fragment": request.url.fragment,
        "status_code": response.status_code,
        "response_time": f"{duration}ms"
    }

    logger.info(log_data)

    return response


# Including Routers
app.include_router(incidents.router)
