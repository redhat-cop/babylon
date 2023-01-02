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
                    provision_uuid varchar(64) NOT NULL, email varchar NOT NULL, 
                        catalog_item_id int NOT NULL, rating int, comment TEXT, 
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        PRIMARY KEY(provision_uuid, email),
                        FOREIGN KEY(provision_uuid) REFERENCES provisions(uuid) ON DELETE CASCADE,
                        FOREIGN KEY(email) REFERENCES students(email) ON DELETE CASCADE,
                        FOREIGN KEY(catalog_item_id) REFERENCES catalog_items(id) ON DELETE CASCADE
                    );"""
INSERT_RATING = (
    """INSERT INTO ratings (provision_uuid, catalog_item_id, email, rating, comment) 
    VALUES ( 
        %(uuid)s, 
        (SELECT catalog_id FROM provisions WHERE uuid = %(uuid)s),
        %(email)s, %(rating)s, %(comment)s
    )
    ON CONFLICT (provision_uuid, email) 
        DO UPDATE SET rating = %(rating)s, comment = %(comment)s, updated_at = NOW() 
        WHERE ratings.provision_uuid = %(uuid)s AND ratings.email = %(email)s;"""
)
GET_RATING = (
    """SELECT AVG(ratings.rating) as rating_score, COUNT(*) as total_ratings FROM ratings 
    JOIN catalog_items ON catalog_items.id=ratings.catalog_item_id
    WHERE catalog_items.agnosticv_key = (%s);"""
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
def index(request):
    return 200, '<h1>Babylon Ratings</h1>'

# {"provision_uuid": "the_uuid", "email": "user@redhat.com", "rating": 48, comment: "My comment"}
@app.route("/api/ratings/v1/rate", methods=['POST'])
async def rate(request):
    schema = Schema({
        "provision_uuid": And(str, len),
        "email": And(str, len),
        Optional("rating"): Or(And(Use(int), lambda n: 0 <= n <= 5), None),
        Optional("comment"): Or(And(str, len), None),
    })
    data = await request.data()
    try:
        validated = schema.validate(data)
    except Exception as e:
        logger.info(f"Invalid rating params for {data}")
        return 400, 'Invalid parameters'
    logger.info(data)
    uuid = data["provision_uuid"]
    email = data["email"]
    _rating = data.get("rating", None)
    rating = round(_rating * 10, 0) if _rating is not None else None
    comment = data.get("comment", None)
    try: 
        await execute_query(INSERT_RATING, {
            'uuid': uuid,
            'email': email, 
            'rating': rating, 
            'comment': comment
        })
    except:
        return 404, 'Invalid parameters'
    return 200, 'Rating added / updated.'


@app.route("/api/ratings/v1/catalogitem/{catalog_item}", methods=['GET'])
async def get_catalog_item_rating(request):
    catalog_item = request.path_params.get("catalog_item")
    query = await execute_query(GET_RATING, (catalog_item, ))
    resultArr = query.get("result", [{}])
    if (resultArr[0]):
        _rating_score = resultArr[0].get("rating_score", None)
        rating_score = round(_rating_score / 10, 2) if _rating_score is not None else None
        total_ratings = resultArr[0].get("total_ratings", 0)
        return 200, {"rating_score": rating_score, "total_ratings": total_ratings}
    return 404, 'Not Found'
