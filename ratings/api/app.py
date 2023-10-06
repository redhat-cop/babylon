import logging
import psycopg2
import os

from asgi_tools import App, ResponseError
from datetime import datetime, timezone
from logging import Formatter, FileHandler
from utils import execute_query
from schema import Schema, And, Or, Use, Optional, SchemaError

from babylon import Babylon

logger = logging.getLogger('babylon-ratings')

CREATE_RATINGS_TABLE = """CREATE TABLE IF NOT EXISTS ratings (
                    request_id varchar(64) NOT NULL, email varchar NOT NULL, 
                        resource_id int NOT NULL, rating int, comment TEXT, 
                        useful varchar,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        PRIMARY KEY(request_id, email),
                        FOREIGN KEY(email) REFERENCES users(email) ON DELETE CASCADE,
                        FOREIGN KEY(resource_id) REFERENCES catalog_resource(id) ON DELETE CASCADE
                    );"""

INSERT_RATING = (
    """INSERT INTO ratings (request_id, resource_id, email, rating, comment, useful) 
    VALUES ( 
        %(uuid)s, 
        (SELECT resource_id FROM provisions WHERE request_id = %(request_id)s),
        %(email)s, %(rating)s, %(comment)s, %(useful)s
    )
    ON CONFLICT (request_id, email) 
        DO UPDATE SET rating = %(rating)s, comment = %(comment)s, useful = %(useful)s, updated_at = NOW() 
        WHERE ratings.request_id = %(request_id)s AND ratings.email = %(email)s;"""
)
GET_CATALOG_ITEM_RATING = (
    """SELECT AVG(rating) AS rating_score, COUNT(*) AS total_ratings FROM 
    (SELECT ratings.rating  
        FROM ratings 
        JOIN catalog_resource ON catalog_resource.id=ratings.resource_id
        WHERE catalog_resource.name=(%s) AND catalog_resource.active = TRUE
    ) as ratings_select;"""
)
GET_CATALOG_ITEM_RATING_HISTORY = (
    """SELECT ratings.email, ratings.rating, ratings.comment, ratings.useful  
        FROM ratings 
        JOIN catalog_resource ON catalog_resource.id=ratings.resource_id
        WHERE catalog_resource.name=(%s) AND catalog_resource.active = TRUE;"""
)
GET_PROVISION_RATING = (
    """SELECT request_id, email, rating, comment, useful FROM ratings 
    WHERE request_id = %(request_id)s AND email = %(email)s;"""
)

app = App()

@app.on_startup
async def on_startup():
    await Babylon.on_startup()
    await execute_query(CREATE_RATINGS_TABLE)

@app.on_shutdown
async def on_cleanup():
    await Babylon.on_cleanup()

@app.route("/", methods=['GET'])
async def index(request):
    return 200, '<h1>Babylon Ratings</h1>'

@app.route("/api/ratings/v1/provisions/{request_id}/users/{email}", methods=['GET'])
async def provision_rating_get(request):
    request_id = request.path_params.get("request_id")
    email = request.path_params.get("email")
    query = await execute_query(GET_PROVISION_RATING, {
                'request_id': request_id,
                'email': email
            })
    resultArr = query.get("result", [])
    if (len(resultArr) > 0):
        _rating_score = resultArr[0].get("rating", None)
        resultArr[0]["rating"] = round(_rating_score / 10, 2) if _rating_score is not None else None
        return 200, resultArr[0]
    return 404, 'Not Found'

# {"email": "user@redhat.com", "rating": 4, comment: "My comment", useful: "yes"}
@app.route("/api/ratings/v1/provisions/{request_id}", methods=['POST'])
async def provision_rating_set(request):
    schema = Schema({
        "email": And(str, len),
        Optional("rating"): Or(And(Use(int), lambda n: 0 <= n <= 5), None),
        Optional("comment"): Or(str, None),
        Optional("useful"): Or(str, None),
    })
    data = await request.data()
    try:
        schema.validate(data)
    except Exception as e:
        logger.info(f"Invalid rating params for {data} - {e}")
        return 400, 'Invalid parameters'
    uuid = request.path_params['request_id']
    email = data["email"]
    _rating = data.get("rating", None)
    rating = round(_rating * 10, 0) if _rating is not None else None
    comment = data.get("comment", None)
    useful = data.get("useful", None)
    logger.info(f"Set new rating for: request {uuid} - {email} - {rating} - {comment} - {useful}")
    try: 
        await execute_query(INSERT_RATING, {
            'uuid': uuid,
            'email': email, 
            'rating': rating, 
            'comment': comment,
            'useful': useful
        })
    except:
        return 400, 'Invalid parameters'
    return 200, 'Rating added / updated.'

@app.route("/api/ratings/v1/catalogitem/{catalog_item}", methods=['GET'])
async def catalog_item_rating_get(request):
    catalog_item = request.path_params.get("catalog_item")
    query = await execute_query(GET_CATALOG_ITEM_RATING, (catalog_item, ))
    resultArr = query.get("result", [])
    if (len(resultArr) > 0):
        _rating_score = resultArr[0].get("rating_score", None)
        rating_score = round(_rating_score / 10, 2) if _rating_score is not None else None
        total_ratings = resultArr[0].get("total_ratings", 0)
        return 200, {"rating_score": rating_score, "total_ratings": total_ratings}
    return 404, 'Not Found'

@app.route("/api/ratings/v1/catalogitem/{catalog_item}/history", methods=['GET'])
async def catalog_item_rating_history_get(request):
    catalog_item = request.path_params.get("catalog_item")
    query = await execute_query(GET_CATALOG_ITEM_RATING_HISTORY, (catalog_item, ))
    resultArr = query.get("result", [])
    if (len(resultArr) > 0):
        return 200, {"ratings": resultArr}
    return 404, 'Not Found'
