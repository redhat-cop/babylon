import json
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, '.')
import audit as audit_mod
from audit import (
    parse_k8s_path,
    classify_action,
    extract_details,
    audit_log,
    audit_log_api_action,
)


class TestParseK8sPath(unittest.TestCase):

    def test_namespaced_with_name(self):
        r = parse_k8s_path('/apis/poolboy.gpte.redhat.com/v1/namespaces/user-alice/resourceclaims/my-claim')
        self.assertIsNotNone(r)
        assert r is not None
        self.assertEqual(r['api_group'], 'poolboy.gpte.redhat.com')
        self.assertEqual(r['version'], 'v1')
        self.assertEqual(r['namespace'], 'user-alice')
        self.assertEqual(r['plural'], 'resourceclaims')
        self.assertEqual(r['name'], 'my-claim')

    def test_namespaced_collection(self):
        r = parse_k8s_path('/apis/babylon.gpte.redhat.com/v1/namespaces/user-alice/workshops')
        self.assertIsNotNone(r)
        assert r is not None
        self.assertEqual(r['plural'], 'workshops')
        self.assertIsNone(r['name'])
        self.assertEqual(r['namespace'], 'user-alice')

    def test_non_namespaced_with_name(self):
        r = parse_k8s_path('/apis/poolboy.gpte.redhat.com/v1/resourcepools/my-pool')
        self.assertIsNotNone(r)
        assert r is not None
        self.assertEqual(r['plural'], 'resourcepools')
        self.assertEqual(r['name'], 'my-pool')
        self.assertIsNone(r['namespace'])

    def test_core_api(self):
        r = parse_k8s_path('/api/v1/namespaces/default/configmaps/my-cm')
        self.assertIsNotNone(r)
        assert r is not None
        self.assertEqual(r['api_group'], '')
        self.assertEqual(r['version'], 'v1')
        self.assertEqual(r['namespace'], 'default')
        self.assertEqual(r['plural'], 'configmaps')
        self.assertEqual(r['name'], 'my-cm')

    def test_invalid_path_returns_none(self):
        self.assertIsNone(parse_k8s_path('/foo/bar'))

    def test_empty_path_returns_none(self):
        self.assertIsNone(parse_k8s_path(''))

    def test_path_with_query_string(self):
        r = parse_k8s_path('/apis/poolboy.gpte.redhat.com/v1/namespaces/user-alice/resourceclaims/my-claim')
        self.assertIsNotNone(r)


class TestClassifyAction(unittest.TestCase):

    # --- POST ---
    def test_post_resourceclaim(self):
        self.assertEqual(classify_action('POST', 'resourceclaims', {}), 'order_service')

    def test_post_workshop(self):
        self.assertEqual(classify_action('POST', 'workshops', {}), 'create_workshop')

    def test_post_selfpacedlab(self):
        self.assertEqual(classify_action('POST', 'selfpacedlabs', {}), 'create_self_paced_lab')

    def test_post_multiworkshop(self):
        self.assertEqual(classify_action('POST', 'multiworkshops', {}), 'create_multi_workshop')

    # --- DELETE ---
    def test_delete_resourceclaim(self):
        self.assertEqual(classify_action('DELETE', 'resourceclaims', None), 'delete_service')

    def test_delete_workshop(self):
        self.assertEqual(classify_action('DELETE', 'workshops', None), 'delete_workshop')

    def test_delete_selfpacedlab(self):
        self.assertEqual(classify_action('DELETE', 'selfpacedlabs', None), 'delete_self_paced_lab')

    # --- PATCH resourceclaims ---
    def test_patch_resourceclaim_start(self):
        body = {'spec': {'provider': {'parameterValues': {'start_timestamp': '2024-01-01T00:00:00Z', 'stop_timestamp': '2024-01-01T04:00:00Z'}}}}
        self.assertEqual(classify_action('PATCH', 'resourceclaims', body), 'start_service')

    def test_patch_resourceclaim_stop(self):
        body = {'spec': {'provider': {'parameterValues': {'stop_timestamp': '2024-01-01T00:00:00Z'}}}}
        self.assertEqual(classify_action('PATCH', 'resourceclaims', body), 'stop_service')

    def test_patch_resourceclaim_retire(self):
        body = {'spec': {'lifespan': {'end': '2024-01-05T00:00:00Z'}}}
        self.assertEqual(classify_action('PATCH', 'resourceclaims', body), 'retire_service')

    def test_patch_resourceclaim_tenant_cluster_action(self):
        body = {'metadata': {'annotations': {'babylon.gpte.redhat.com/tenant-cluster-action': '{"action":"reboot"}'}}}
        self.assertEqual(classify_action('PATCH', 'resourceclaims', body), 'tenant_cluster_action')

    def test_patch_resourceclaim_unknown(self):
        self.assertEqual(classify_action('PATCH', 'resourceclaims', {}), 'update_service')

    # --- PATCH workshops ---
    def test_patch_workshop_start(self):
        body = {'spec': {'actionSchedule': {'start': '2024-01-01T10:00:00Z', 'stop': '2024-01-01T18:00:00Z'}}}
        self.assertEqual(classify_action('PATCH', 'workshops', body), 'start_workshop')

    def test_patch_workshop_stop(self):
        body = {'spec': {'actionSchedule': {'stop': '2024-01-01T18:00:00Z'}}}
        self.assertEqual(classify_action('PATCH', 'workshops', body), 'stop_workshop')

    def test_patch_workshop_retire(self):
        body = {'spec': {'lifespan': {'end': '2024-01-05T00:00:00Z'}}}
        self.assertEqual(classify_action('PATCH', 'workshops', body), 'retire_workshop')

    def test_patch_workshop_lock(self):
        body = {'metadata': {'labels': {'demo.redhat.com/lock-enabled': 'true'}}}
        self.assertEqual(classify_action('PATCH', 'workshops', body), 'lock_workshop')

    def test_patch_workshop_unlock(self):
        body = {'metadata': {'labels': {'demo.redhat.com/lock-enabled': 'false'}}}
        self.assertEqual(classify_action('PATCH', 'workshops', body), 'unlock_workshop')

    def test_patch_workshop_edit_displayname(self):
        body = {'spec': {'displayName': 'New Name'}}
        self.assertEqual(classify_action('PATCH', 'workshops', body), 'edit_workshop')

    def test_patch_workshop_edit_description(self):
        body = {'spec': {'description': 'New description'}}
        self.assertEqual(classify_action('PATCH', 'workshops', body), 'edit_workshop')

    # --- PATCH workshopprovisions ---
    def test_patch_workshopprovision_scale(self):
        body = {'spec': {'count': 25}}
        self.assertEqual(classify_action('PATCH', 'workshopprovisions', body), 'scale_workshop')

    def test_patch_workshopprovision_unknown(self):
        self.assertEqual(classify_action('PATCH', 'workshopprovisions', {}), 'update_workshop_provision')

    # --- PATCH anarchysubjects ---
    def test_patch_anarchysubject_force_delete(self):
        body = {'metadata': {'finalizers': None}}
        self.assertEqual(classify_action('PATCH', 'anarchysubjects', body), 'force_delete_anarchy_subject')

    # --- PATCH anarchyruns ---
    def test_patch_anarchyrun_retry(self):
        body = {'metadata': {'labels': {'anarchy.gpte.redhat.com/runner': 'pending'}}}
        self.assertEqual(classify_action('PATCH', 'anarchyruns', body), 'retry_anarchy_run')

    # --- PATCH resourcehandles ---
    def test_patch_resourcehandle_extend_lifespan(self):
        body = {'spec': {'lifespan': {'maximum': '30d', 'relativeMaximum': '14d'}}}
        self.assertEqual(classify_action('PATCH', 'resourcehandles', body), 'extend_lifespan')

    # --- JSON Patch (arrays) ---
    def test_json_patch_assign_user(self):
        body = [
            {'op': 'test', 'path': '/spec/resourceClaimName', 'value': 'my-claim'},
            {'op': 'add', 'path': '/spec/assignment', 'value': {'email': 'user@example.com'}},
        ]
        self.assertEqual(classify_action('PATCH', 'workshopuserassignments', body), 'assign_user')

    def test_json_patch_unassign_user(self):
        body = [{'op': 'remove', 'path': '/spec/assignment'}]
        self.assertEqual(classify_action('PATCH', 'workshopuserassignments', body), 'unassign_user')

    def test_json_patch_selfpaced_assign_user(self):
        body = [{'op': 'add', 'path': '/spec/assignment', 'value': {'email': 'user@example.com'}}]
        self.assertEqual(classify_action('PATCH', 'selfpacedlabuserassignments', body), 'assign_user')

    # --- Fault tolerance ---
    def test_none_body_post(self):
        self.assertEqual(classify_action('POST', 'workshops', None), 'create_workshop')

    def test_none_body_patch_resourceclaim(self):
        self.assertEqual(classify_action('PATCH', 'resourceclaims', None), 'update_service')

    def test_unknown_resource(self):
        result = classify_action('DELETE', 'unknownresources', None)
        self.assertIn('delete', result)

    def test_broken_body_returns_string(self):
        # Should not raise, even with unexpected body types
        result = classify_action('PATCH', 'resourceclaims', 'not-a-dict')
        self.assertIsInstance(result, str)

    # --- Malformed body fault tolerance ---
    def test_patch_resourceclaim_parameterValues_is_list(self):
        body = {'spec': {'provider': {'parameterValues': ['unexpected', 'list']}}}
        result = classify_action('PATCH', 'resourceclaims', body)
        self.assertEqual(result, 'update_service')

    def test_patch_resourceclaim_resources_is_string(self):
        body = {'spec': {'resources': 'not-a-list'}}
        result = classify_action('PATCH', 'resourceclaims', body)
        self.assertEqual(result, 'update_service')

    def test_patch_resourceclaim_resources_is_int(self):
        body = {'spec': {'resources': 42}}
        result = classify_action('PATCH', 'resourceclaims', body)
        self.assertEqual(result, 'update_service')

    def test_patch_resourceclaim_resources_contains_non_dict(self):
        body = {'spec': {'resources': ['not-a-dict', 123, None]}}
        result = classify_action('PATCH', 'resourceclaims', body)
        self.assertEqual(result, 'update_service')

    def test_patch_resourceclaim_action_schedule_is_list(self):
        body = {'spec': {'resources': [{'template': {'spec': {'vars': {'action_schedule': ['bad']}}}}]}}
        result = classify_action('PATCH', 'resourceclaims', body)
        self.assertEqual(result, 'update_service')

    def test_patch_workshop_actionSchedule_is_list(self):
        body = {'spec': {'actionSchedule': ['not', 'a', 'dict']}}
        result = classify_action('PATCH', 'workshops', body)
        self.assertEqual(result, 'update_workshop')

    def test_patch_workshop_actionSchedule_is_string(self):
        body = {'spec': {'actionSchedule': 'bad-value'}}
        result = classify_action('PATCH', 'workshops', body)
        self.assertEqual(result, 'update_workshop')

    def test_patch_workshop_spec_is_list(self):
        body = {'spec': ['not', 'a', 'dict']}
        result = classify_action('PATCH', 'workshops', body)
        self.assertEqual(result, 'update_workshop')

    def test_patch_resourceclaim_body_is_int(self):
        result = classify_action('PATCH', 'resourceclaims', 42)
        self.assertEqual(result, 'update_service')

    def test_patch_workshop_body_is_bool(self):
        result = classify_action('PATCH', 'workshops', True)
        self.assertEqual(result, 'update_workshop')


class TestExtractDetails(unittest.TestCase):

    def test_start_service(self):
        body = {'spec': {'provider': {'parameterValues': {
            'start_timestamp': '2024-01-01T10:00:00Z',
            'stop_timestamp': '2024-01-01T18:00:00Z',
        }}}}
        details = extract_details('start_service', body)
        self.assertEqual(details['start_timestamp'], '2024-01-01T10:00:00Z')
        self.assertEqual(details['stop_timestamp'], '2024-01-01T18:00:00Z')

    def test_stop_service(self):
        body = {'spec': {'provider': {'parameterValues': {'stop_timestamp': '2024-01-01T18:00:00Z'}}}}
        details = extract_details('stop_service', body)
        self.assertEqual(details['stop_timestamp'], '2024-01-01T18:00:00Z')

    def test_retire_service(self):
        body = {'spec': {'lifespan': {'end': '2024-01-05T00:00:00Z'}}}
        details = extract_details('retire_service', body)
        self.assertEqual(details['lifespan_end'], '2024-01-05T00:00:00Z')

    def test_order_service_extracts_name(self):
        body = {
            'metadata': {
                'name': 'my-service-abc12',
                'annotations': {'babylon.gpte.redhat.com/catalogItemDisplayName': 'Red Hat OpenShift'},
            }
        }
        details = extract_details('order_service', body)
        self.assertEqual(details['resource_name'], 'my-service-abc12')
        self.assertEqual(details['catalog_item_display_name'], 'Red Hat OpenShift')

    def test_scale_workshop(self):
        body = {'spec': {'count': 25}}
        details = extract_details('scale_workshop', body)
        self.assertEqual(details['count'], 25)

    def test_edit_workshop_fields_changed(self):
        body = {'spec': {'displayName': 'New Name', 'description': 'New desc'}}
        details = extract_details('edit_workshop', body)
        self.assertIn('displayName', details['fields_changed'])
        self.assertIn('description', details['fields_changed'])

    def test_edit_workshop_no_password_in_details(self):
        # accessPassword is in body but must NOT appear in details
        body = {'spec': {'accessPassword': 'supersecret'}}
        details = extract_details('edit_workshop', body)
        self.assertNotIn('accessPassword', details)
        dumped = json.dumps(details)
        self.assertNotIn('supersecret', dumped)

    def test_assign_user_extracts_email(self):
        body = [
            {'op': 'add', 'path': '/spec/assignment', 'value': {'email': 'user@example.com'}},
        ]
        details = extract_details('assign_user', body)
        self.assertEqual(details['email'], 'user@example.com')

    def test_extend_lifespan(self):
        body = {'spec': {'lifespan': {'maximum': '30d', 'relativeMaximum': '14d'}}}
        details = extract_details('extend_lifespan', body)
        self.assertEqual(details['maximum'], '30d')
        self.assertEqual(details['relative_maximum'], '14d')

    def test_tenant_cluster_action(self):
        body = {'metadata': {'annotations': {'babylon.gpte.redhat.com/tenant-cluster-action': '{"action":"reboot"}'}}}
        details = extract_details('tenant_cluster_action', body)
        self.assertEqual(details['cluster_action'], 'reboot')

    def test_share_service_users(self):
        body = {'spec': {'users': [{'name': 'a@example.com'}, {'name': 'b@example.com'}]}}
        details = extract_details('share_service', body)
        self.assertEqual(details['users'], ['a@example.com', 'b@example.com'])

    def test_unknown_action_returns_empty(self):
        self.assertEqual(extract_details('totally_unknown', {}), {})

    def test_none_body_returns_empty(self):
        self.assertEqual(extract_details('start_service', None), {})

    def test_malformed_body_returns_empty(self):
        self.assertEqual(extract_details('start_service', 'not-a-dict'), {})

    def test_missing_nested_keys_returns_empty(self):
        # Body missing expected nested structure
        body = {'spec': {}}
        details = extract_details('start_service', body)
        self.assertEqual(details, {})


class TestAuditLog(unittest.TestCase):

    def _capture_log(self, *args, **kwargs):
        with patch.object(audit_mod.audit_logger, 'info') as mock_info:
            audit_log(*args, **kwargs)
            self.assertTrue(mock_info.called)
            return json.loads(mock_info.call_args[0][0])

    def test_session_created_format(self):
        record = self._capture_log('session_created', user='alice', details={'admin': True})
        self.assertEqual(record['event'], 'session_created')
        self.assertEqual(record['user'], 'alice')
        self.assertEqual(record['details']['admin'], True)
        self.assertIn('timestamp', record)

    def test_system_status_updated_format(self):
        data = {'workshops_ordering_blocked': True}
        record = self._capture_log('system_status_updated', user='admin', details=data)
        self.assertEqual(record['event'], 'system_status_updated')
        self.assertEqual(record['details']['workshops_ordering_blocked'], True)

    def test_effective_user_omitted_when_same(self):
        record = self._capture_log('api_action', user='alice', effective_user='alice', action='start_service')
        self.assertNotIn('effective_user', record)

    def test_effective_user_present_when_different(self):
        record = self._capture_log('api_action', user='admin', effective_user='alice', action='start_service')
        self.assertEqual(record['effective_user'], 'alice')

    def test_output_is_valid_json(self):
        with patch.object(audit_mod.audit_logger, 'info') as mock_info:
            audit_log('test_event', user='alice')
            line = mock_info.call_args[0][0]
            parsed = json.loads(line)
            self.assertIsInstance(parsed, dict)

    def test_none_optional_fields_not_in_output(self):
        record = self._capture_log('session_created', user='alice')
        self.assertNotIn('effective_user', record)
        self.assertNotIn('action', record)
        self.assertNotIn('resource_type', record)
        self.assertNotIn('details', record)

    def test_non_serializable_details_does_not_raise(self):
        # If details somehow contains a non-serializable object, audit_log must not raise
        audit_log('test_event', user='alice', details={'bad': object()})
        # No exception = pass

    def test_non_serializable_extra_does_not_raise(self):
        audit_log('test_event', user='alice', weird_field=object())
        # No exception = pass


class TestAuditLogApiAction(unittest.TestCase):

    def _run(self, method, path, body, status=200, user='alice', effective_user=None):
        captured = []
        with patch.object(audit_mod.audit_logger, 'info', side_effect=lambda msg: captured.append(msg)):
            audit_log_api_action(
                user=user,
                effective_user=effective_user,
                method=method,
                path=path,
                status=status,
                body=body,
            )
        self.assertEqual(len(captured), 1)
        return json.loads(captured[0])

    def test_start_service(self):
        body = {'spec': {'provider': {'parameterValues': {
            'start_timestamp': '2024-01-01T10:00:00Z',
            'stop_timestamp': '2024-01-01T18:00:00Z',
        }}}}
        record = self._run('PATCH', '/apis/poolboy.gpte.redhat.com/v1/namespaces/user-alice/resourceclaims/my-claim', body)
        self.assertEqual(record['action'], 'start_service')
        self.assertEqual(record['resource_type'], 'ResourceClaim')
        self.assertEqual(record['resource_name'], 'my-claim')
        self.assertEqual(record['namespace'], 'user-alice')
        self.assertEqual(record['status'], 200)
        self.assertEqual(record['details']['start_timestamp'], '2024-01-01T10:00:00Z')

    def test_delete_workshop(self):
        record = self._run('DELETE', '/apis/babylon.gpte.redhat.com/v1/namespaces/user-alice/workshops/my-workshop', None)
        self.assertEqual(record['action'], 'delete_workshop')
        self.assertEqual(record['resource_type'], 'Workshop')
        self.assertEqual(record['resource_name'], 'my-workshop')

    def test_order_service(self):
        body = {'metadata': {'name': 'my-service-abc12', 'annotations': {}}, 'spec': {}}
        record = self._run('POST', '/apis/poolboy.gpte.redhat.com/v1/namespaces/user-alice/resourceclaims', body)
        self.assertEqual(record['action'], 'order_service')
        self.assertEqual(record['resource_type'], 'ResourceClaim')

    def test_effective_user_logged(self):
        record = self._run('DELETE', '/apis/babylon.gpte.redhat.com/v1/namespaces/user-alice/workshops/w1', None,
                           user='admin', effective_user='alice')
        self.assertEqual(record['user'], 'admin')
        self.assertEqual(record['effective_user'], 'alice')

    def test_non_k8s_path_fallback(self):
        record = self._run('POST', '/api/some-custom-endpoint', {})
        self.assertIn('path', record.get('details', {}))
        self.assertIn('event', record)

    def test_json_is_always_emitted_on_error(self):
        # Even with a completely broken path, a JSON line must be emitted
        record = self._run('PATCH', '/totally/invalid', 'not-a-dict')
        self.assertIn('event', record)
        self.assertIn('user', record)

    def test_no_raw_body_in_output(self):
        # Body contains a password — it must not appear anywhere in the output
        body = {'spec': {'accessPassword': 'supersecret', 'displayName': 'Test'}}
        record = self._run('PATCH', '/apis/babylon.gpte.redhat.com/v1/namespaces/x/workshops/w1', body)
        dumped = json.dumps(record)
        self.assertNotIn('supersecret', dumped)

    def test_scale_workshop(self):
        body = {'spec': {'count': 50}}
        record = self._run('PATCH', '/apis/babylon.gpte.redhat.com/v1/namespaces/x/workshopprovisions/wp1', body)
        self.assertEqual(record['action'], 'scale_workshop')
        self.assertEqual(record['details']['count'], 50)

    def test_assign_user_json_patch(self):
        body = [{'op': 'add', 'path': '/spec/assignment', 'value': {'email': 'user@example.com'}}]
        record = self._run('PATCH', '/apis/babylon.gpte.redhat.com/v1/namespaces/x/workshopuserassignments/wa1', body)
        self.assertEqual(record['action'], 'assign_user')
        self.assertEqual(record['details']['email'], 'user@example.com')

    def test_error_status_logged(self):
        record = self._run('DELETE', '/apis/poolboy.gpte.redhat.com/v1/namespaces/x/resourceclaims/c1', None, status=403)
        self.assertEqual(record['status'], 403)

    # --- Malformed body end-to-end: must always emit JSON, never raise ---
    def test_body_is_integer(self):
        record = self._run('PATCH', '/apis/poolboy.gpte.redhat.com/v1/namespaces/x/resourceclaims/c1', 42)
        self.assertIn('event', record)
        self.assertIn('user', record)

    def test_body_is_boolean(self):
        record = self._run('PATCH', '/apis/babylon.gpte.redhat.com/v1/namespaces/x/workshops/w1', True)
        self.assertIn('event', record)

    def test_body_nested_values_wrong_types(self):
        body = {'spec': {'provider': {'parameterValues': 'not-a-dict'}, 'resources': 99, 'lifespan': 'bad'}}
        record = self._run('PATCH', '/apis/poolboy.gpte.redhat.com/v1/namespaces/x/resourceclaims/c1', body)
        self.assertIn('event', record)
        self.assertIn('action', record)

    def test_workshop_body_all_wrong_types(self):
        body = {'spec': {'actionSchedule': 123, 'lifespan': True}, 'metadata': {'labels': 'not-a-dict'}}
        record = self._run('PATCH', '/apis/babylon.gpte.redhat.com/v1/namespaces/x/workshops/w1', body)
        self.assertIn('event', record)

    def test_json_patch_with_non_dict_operations(self):
        body = ['not-a-dict', 42, None, True]
        record = self._run('PATCH', '/apis/babylon.gpte.redhat.com/v1/namespaces/x/workshopuserassignments/wa1', body)
        self.assertIn('event', record)

    def test_none_user_does_not_crash(self):
        # Even if user is None (shouldn't happen, but defensive)
        record = self._run('DELETE', '/apis/poolboy.gpte.redhat.com/v1/namespaces/x/resourceclaims/c1', None, user=None)
        self.assertIn('event', record)

    def test_none_method_does_not_crash(self):
        captured = []
        with patch.object(audit_mod.audit_logger, 'info', side_effect=lambda msg: captured.append(msg)):
            audit_log_api_action(user='alice', effective_user=None, method=None, path='/apis/x/v1/y/z', status=200, body=None)
        self.assertGreaterEqual(len(captured), 1)
        record = json.loads(captured[0])
        self.assertIn('event', record)


if __name__ == '__main__':
    unittest.main()
