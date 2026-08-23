import logging

def suppress_handler_succeeded_messages(record: logging.LogRecord) -> bool:
    """Suppress unnecessary logs saying things succeeded."""
    txt = record.getMessage()
    if txt.startswith("Handler ") and txt.endswith(" succeeded."):
        return False
    if txt.startswith("Timer ") and txt.endswith(" succeeded."):
        return False
    if txt.endswith("is processed: 1 succeeded; 0 failed."):
        return False
    return True

def configure_kopf_logging():
    objlogger = logging.getLogger('kopf.objects')
    objlogger.addFilter(suppress_handler_succeeded_messages)
