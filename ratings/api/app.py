import os
import logging
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, HTMLResponse
from babylon import Babylon
from routers import ratings
from models import Database as db
from models.custom_base import create_tables


logger = logging.getLogger('babylon-ratings')


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

    return "<h1>Babylon Rating API</h1>"


# Including Routers
app.include_router(ratings.router)
