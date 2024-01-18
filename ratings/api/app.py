import logging
from datetime import datetime
from fastapi import FastAPI,Request
from fastapi.responses import HTMLResponse
from models import Database as db
from models.custom_base import create_tables
from routers import ratings
from babylon import Babylon


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


@app.middleware("http")
async def log_access(request: Request, call_next):
    log = logging.getLogger("uvicorn.access")

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

    log.info(log_data)

    return response


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
