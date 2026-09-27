import unittest
from datetime import datetime, timedelta, timezone

from wgr_labels import wgr_jira_labels

# A fixed "now" so lead-time math is deterministic.
NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)


def iso(days_from_now):
    return (NOW + timedelta(days=days_from_now)).isoformat().replace('+00:00', 'Z')


class TestWgrJiraLabels(unittest.TestCase):
    def test_base_labels_for_single_asset(self):
        labels = wgr_jira_labels({'catalogItemNames': ['item-a'], 'eventDate': iso(30)}, now=NOW)
        self.assertEqual(labels, ['whiteglove', 'whiteglove-pending'])

    def test_multi_asset(self):
        labels = wgr_jira_labels({'catalogItemNames': ['a', 'b'], 'eventDate': iso(30)}, now=NOW)
        self.assertIn('whiteglove-multi-asset', labels)
        self.assertNotIn('whiteglove-consultation', labels)

    def test_consultation_when_no_catalog_items(self):
        labels = wgr_jira_labels({'catalogItemNames': [], 'eventDate': iso(30)}, now=NOW)
        self.assertIn('whiteglove-consultation', labels)

    def test_short_notice_under_14_days(self):
        labels = wgr_jira_labels({'catalogItemNames': ['a'], 'eventDate': iso(10)}, now=NOW)
        self.assertIn('whiteglove-short-notice', labels)

    def test_no_short_notice_at_or_beyond_14_days(self):
        labels = wgr_jira_labels({'catalogItemNames': ['a'], 'eventDate': iso(20)}, now=NOW)
        self.assertNotIn('whiteglove-short-notice', labels)

    def test_premium_event_adds_whiteglove_event(self):
        labels = wgr_jira_labels(
            {'catalogItemNames': ['a'], 'eventDate': iso(30), 'isPremiumEvent': True}, now=NOW
        )
        self.assertIn('whiteglove-event', labels)

    def test_premium_event_absent_when_flag_false_or_missing(self):
        self.assertNotIn(
            'whiteglove-event',
            wgr_jira_labels({'catalogItemNames': ['a'], 'eventDate': iso(30), 'isPremiumEvent': False}, now=NOW),
        )
        self.assertNotIn(
            'whiteglove-event',
            wgr_jira_labels({'catalogItemNames': ['a'], 'eventDate': iso(30)}, now=NOW),
        )

    def test_premium_event_combines_with_other_labels(self):
        labels = wgr_jira_labels(
            {'catalogItemNames': [], 'eventDate': iso(5), 'isPremiumEvent': True}, now=NOW
        )
        self.assertEqual(
            labels,
            ['whiteglove', 'whiteglove-pending', 'whiteglove-consultation', 'whiteglove-event', 'whiteglove-short-notice'],
        )

    def test_missing_event_date_omits_short_notice(self):
        labels = wgr_jira_labels({'catalogItemNames': ['a']}, now=NOW)
        self.assertEqual(labels, ['whiteglove', 'whiteglove-pending'])


if __name__ == '__main__':
    unittest.main()
