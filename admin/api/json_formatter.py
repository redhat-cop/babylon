import logging
import json


class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_data = {
            "time": self.formatTime(record, self.datefmt),
            "name": record.name,
            "level": record.levelname,
            "message": record.getMessage()
        }
        return json.dumps(log_data)
