import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'operator'))
from multiuser import next_instance_users, num_users_schema, provision_count


class MultiuserAllocationTest(unittest.TestCase):
    def test_capped_workshop(self):
        spec = {'multiuser': True, 'parameters': [
            {'name': 'num_users', 'openAPIV3Schema': {'maximum': 20}}]}
        schema = num_users_schema(spec)
        self.assertEqual(provision_count(spec, 30), 2)
        self.assertEqual(next_instance_users(schema, 30, 0), 20)
        self.assertEqual(next_instance_users(schema, 30, 20), 10)
        # If the first instance failed, only the 10 successful seats count.
        self.assertEqual(next_instance_users(schema, 30, 10), 20)

    def test_uncapped_workshop(self):
        spec = {'multiuser': True, 'parameters': [{'name': 'num_users'}]}
        self.assertEqual(provision_count(spec, 30), 1)
        self.assertEqual(next_instance_users(num_users_schema(spec), 30, 0), 30)

    def test_boundaries(self):
        spec = {'multiuser': True, 'parameters': [
            {'name': 'num_users', 'openAPIV3Schema': {'maximum': 20}}]}
        for seats, count in [(1, 1), (20, 1), (40, 2), (41, 3)]:
            with self.subTest(seats=seats):
                self.assertEqual(provision_count(spec, seats), count)

    def test_other_assets_unchanged(self):
        for spec in [{}, {'multiuser': True}, {'multiuser': False, 'parameters': [
                {'name': 'num_users', 'openAPIV3Schema': {'maximum': 20}}]}]:
            self.assertEqual(provision_count(spec, 30), 30)


if __name__ == '__main__':
    unittest.main()
