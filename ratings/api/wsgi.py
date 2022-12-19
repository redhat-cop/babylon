from app import application
import logging

logger = logging.getLogger('babylon-ratings')

#----------------------------------------------------------------------------#
# Launch.
#----------------------------------------------------------------------------#

if __name__ == "__main__":
    execute_query(CREATE_RATINGS_TABLE)
    logger.info("Booting up WSGI")
    application.run(port=8080)