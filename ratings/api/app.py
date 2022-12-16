from flask import Flask, g, request
from flask_expects_json import expects_json
from datetime import datetime, timezone
import logging
from logging import Formatter, FileHandler
import psycopg2
import os
from utils import execute_query

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
    """SELECT ROUND(AVG(ratings.rating), 0) as rating FROM ratings 
    JOIN catalog_items ON catalog_items.id=ratings.catalog_item_id
    WHERE catalog_items.agnosticv_key = (%s);"""
)

application = Flask('babylon-ratings')
if not application.debug:
    file_handler = FileHandler('error.log')
    file_handler.setFormatter(
        Formatter('%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]')
    )
    application.logger.setLevel(logging.INFO)
    file_handler.setLevel(logging.INFO)
    application.logger.addHandler(file_handler)

@application.route("/")
def index():
    return "<h1>Babylon Ratings</h1>"

# {"provision_uuid": "the_uuid", "email": "user@redhat.com", "rating": 48, comment: "My comment"}
@application.post("/api/ratings/v1/rate")
@expects_json({
  "type": "object",
  "properties": {
    "provision_uuid": { "type": "string" },
    "email": { "type": "string" },
    "rating": { "type": ["integer", "null"] },
    "comment": { "type": ["string", "null"] },
  },
  "required": ["provision_uuid", "email"]
})
def rate():
    uuid = g.data["provision_uuid"]
    email = g.data["email"]
    rating = g.data["rating"]
    comment = g.data["comment"]
    if (rating and (rating < 0 or rating > 50)):
        return {"message": f"Invalid rating, must be between 0-50"}, 400

    try: 
        execute_query(INSERT_RATING, { \
                    'uuid': uuid,
                    'email': email, 
                    'rating': rating, 
                    'comment': comment
                })
    except:
        return {"message": f"Invalid parameters"}, 400
    return {"message": f"Rating added/updated."}, 201


@application.get("/api/ratings/v1/catalogitem/<string:catalog_item>")
def get_catalog_item_rating(catalog_item):
    query = execute_query(GET_RATING, (catalog_item, ))
    rating = query.get("result", [{}])[0].get("rating", None)
    if (rating):
        return {"catalog_item": catalog_item, "rating": int(rating)}
    return {}, 404

#----------------------------------------------------------------------------#
# Launch.
#----------------------------------------------------------------------------#

if __name__ == "__main__":
    execute_query(CREATE_RATINGS_TABLE)
    logger.info("Booting up")
    application.run(port=80)