import logging

def suppress_handler_succeeded_messages(record: logging.LogRecord) -> bool:
    txt = record.getMessage()
    if txt.startswith("Handler ") and txt.endswith(" succeeded."):
        return False
    return True

def configure_kopf_logging():
    objlogger = logging.getLogger('kopf.objects')
    objlogger.addFilter(suppress_handler_succeeded_messages)
