#!/usr/bin/env python

import unittest
from filter_plugins.parameters import babylon_extract_parameter_vars

class TestParametersFilter(unittest.TestCase):
    def test_00(self):
        input_vars = {
            "__meta__": {
                "catalog": {
                    "parameters": [{
                        "name": "pvar1",
                    }]
                }
            },
            "pvar1": "23",
        }
        self.assertEqual(babylon_extract_parameter_vars(input_vars), {"pvar1": "23"})

    def test_01(self):
        input_vars = {
            "__meta__": {
                "catalog": {
                    "parameters": [{
                        "name": "pvar1",
                        "openAPIV3Schema": {
                            "type": "integer"
                        }
                    }]
                }
            },
            "pvar1": "23",
        }
        self.assertEqual(babylon_extract_parameter_vars(input_vars), {"pvar1": 23})

    def test_02(self):
        input_vars = {
            "__meta__": {
                "catalog": {
                    "parameters": [{
                        "name": "pvar1",
                        "openAPIV3Schema": {
                            "type": "number"
                        }
                    }]
                }
            },
            "pvar1": "1.5",
        }
        self.assertEqual(babylon_extract_parameter_vars(input_vars), {"pvar1": 1.5})

    def test_03(self):
        input_vars = {
            "__meta__": {
                "catalog": {
                    "parameters": [{
                        "name": "pvar1",
                        "openAPIV3Schema": {
                            "type": "boolean"
                        }
                    }]
                }
            },
            "pvar1": "true",
        }
        self.assertEqual(babylon_extract_parameter_vars(input_vars), {"pvar1": True})

    def test_00(self):
        input_vars = {
            "__meta__": {
                "catalog": {
                    "parameters": [{
                        "name": "pvar1",
                        "openAPIV3Schema": {
                            "type": "string"
                        }
                    }]
                }
            },
            "pvar1": "23",
        }
        self.assertEqual(babylon_extract_parameter_vars(input_vars), {"pvar1": "23"})

    def test_05(self):
        input_vars = {
            "cloud_tags": '{"foo": "bar", "guid": "abcd", "uuid": "00000000-0000-0000-0000-000000000000"}',
            "guid": "abcd",
            "pvar1": "true",
            "uuid": "00000000-0000-0000-0000-000000000000",
        }
        self.assertEqual(babylon_extract_parameter_vars(input_vars), {"cloud_tags": {"foo": "bar"}, "pvar1": "true"})

if __name__ == '__main__':
    unittest.main()
