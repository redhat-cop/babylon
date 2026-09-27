"""Jira label taxonomy for White Glove Requests.

Kept as a standalone, dependency-free module so the classification rules can be
unit-tested without importing the full aiohttp application.
"""

from datetime import datetime, timezone

SHORT_NOTICE_DAYS = 14


def wgr_jira_labels(data, now=None):
    """Compute the Jira labels for a White Glove Request payload.

    Args:
        data: the WGR request body (dict) sent to /api/jira/wgr.
        now: optional aware datetime used as "now" for lead-time math; defaults
            to the current UTC time. Injectable for deterministic tests.

    Returns:
        A list of Jira labels, in a stable order, with no duplicates.
    """
    labels = ['whiteglove', 'whiteglove-pending']

    catalog_item_names = data.get('catalogItemNames') or []
    if len(catalog_item_names) > 1:
        labels.append('whiteglove-multi-asset')
    if not catalog_item_names:
        labels.append('whiteglove-consultation')

    if data.get('isPremiumEvent'):
        labels.append('whiteglove-event')

    event_date_str = data.get('eventDate')
    if event_date_str:
        event_date = datetime.fromisoformat(event_date_str.replace('Z', '+00:00'))
        reference = now or datetime.now(timezone.utc)
        if (event_date - reference).days < SHORT_NOTICE_DAYS:
            labels.append('whiteglove-short-notice')

    return labels
