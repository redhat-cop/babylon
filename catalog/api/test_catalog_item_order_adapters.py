import copy
import unittest
from datetime import timedelta

from catalog_item_order import Requester, build_order, format_time, resolve_schedule
from catalog_item_order_adapters import (
    AUTO_DETACH_WHEN,
    UnsupportedOrderTypeError,
    assess_resources,
    build_resource as _build_resource,
    owned_by_attempt,
    plan_resources as _plan_resources,
)
from order_test_support import NOW, USER_NAMESPACE, make_catalog_item, submission

BASE_URL = 'https://catalog.example.com'


def created_order(body, catalog_item):
    order = build_order(
        body, catalog_item=catalog_item,
        requester=Requester(user='alice', uid='uid-alice', email='alice@example.com'),
        groups=['rhpds-users'], now=NOW,
    )
    order['metadata'].update({'uid': 'order-uid', 'generation': 1})
    return order


SUFFIX = 'a1b2c3d4'


def plan_resources(order, suffix=SUFFIX):
    return _plan_resources(order, suffix)


def build_resource(order, ref, **kwargs):
    kwargs.setdefault('schedule', resolve_schedule(order['spec']['request']['schedule'], NOW))
    return _build_resource(order, ref, **kwargs)


def catalog():
    item = make_catalog_item(
        bookbag={'image': 'x'}, supportLink='https://help', userData={'k': 'v'}, workshopUserMode='single',
    )
    item['metadata']['uid'] = 'catalog-uid'
    item['spec']['messageTemplates']['user'] = {'template': 'user', 'templateFormat': 'asciidoc'}
    return item


class TestServiceAdapter(unittest.TestCase):
    def test_resource_claim_matches_ui_construction(self):
        catalog_item = catalog()
        start = NOW + timedelta(hours=1)
        order = created_order(submission(
            schedule={'start': format_time(start)},
            salesforceItems=[{'id': '701xx', 'type': 'campaign'}],
            service={'resourcePool': 'pool-a', 'autoDetach': True},
            parameters={'num_users': 7},
        ), catalog_item)
        refs = plan_resources(order)
        self.assertEqual(len(refs), 1)
        ref = refs[0]
        body = build_resource(order, ref, catalog_item=catalog_item, attempt=1, created={}, now=NOW, base_url=BASE_URL)
        name = ref['name']
        self.assertEqual(body['apiVersion'], 'poolboy.gpte.redhat.com/v1')
        self.assertEqual(body['kind'], 'ResourceClaim')
        self.assertEqual(body['metadata']['name'], name)
        self.assertEqual(body['metadata']['namespace'], USER_NAMESPACE)
        self.assertEqual(body['metadata']['annotations'], {
            'babylon.gpte.redhat.com/catalogDisplayName': 'babylon-catalog-prod',
            'babylon.gpte.redhat.com/catalogItemDisplayName': 'Test Item',
            'demo.redhat.com/requester': 'alice@example.com',
            'demo.redhat.com/orderedBy': 'alice',
            'babylon.gpte.redhat.com/category': 'Labs',
            'babylon.gpte.redhat.com/url': f'{BASE_URL}/services/{USER_NAMESPACE}/{name}',
            'poolboy.gpte.redhat.com/resource-pool-name': 'pool-a',
            'babylon.gpte.redhat.com/userData': '{"k":"v"}',
            'demo.redhat.com/info-message-template': '{"template":"info","templateFormat":"asciidoc"}',
            'demo.redhat.com/user-message-template': '{"template":"user","templateFormat":"asciidoc"}',
            'demo.redhat.com/scheduled': 'true',
            'babylon.gpte.redhat.com/support-link': 'https://help',
            'babylon.gpte.redhat.com/displayNameComponent0': 'Cluster',
            'demo.redhat.com/purpose': 'Training - Internal',
            'demo.redhat.com/purpose-activity': 'Internal',
            'demo.redhat.com/salesforce-items': '[{"id":"701xx","type":"campaign"}]',
            'demo.redhat.com/provide_salesforce-id_later': 'false',
        })
        self.assertEqual(body['metadata']['labels'], {
            'babylon.gpte.redhat.com/catalogItemName': 'tests.test-item.prod',
            'babylon.gpte.redhat.com/catalogItemNamespace': 'babylon-catalog-prod',
            'gpte.redhat.com/asset-uuid': 'asset-123',
            'babylon.gpte.redhat.com/labUserInterface': 'bookbag',
            'demo.redhat.com/white-glove': 'false',
            'babylon.gpte.redhat.com/catalog-item-order': order['metadata']['name'],
            'babylon.gpte.redhat.com/catalog-item-order-uid': 'order-uid',
            'babylon.gpte.redhat.com/catalog-item-order-attempt': '1',
        })
        self.assertNotIn('ownerReferences', body['metadata'])
        self.assertEqual(body['spec'], {
            'provider': {
                'name': 'tests.test-item.prod',
                'parameterValues': {
                    'purpose': 'Training - Internal',
                    'stop_timestamp': format_time(start + timedelta(hours=4)),
                    'num_users': 7, 'gpu_enabled': False, 'region': 'na', 'worker_count': 3,
                },
            },
            'lifespan': {'start': format_time(start), 'end': format_time(start + timedelta(days=3))},
            'autoDetach': {'when': AUTO_DETACH_WHEN},
        })

    def test_optional_annotations_omitted_like_ui(self):
        catalog_item = make_catalog_item(workshopUserMode='none')
        catalog_item['metadata']['uid'] = 'catalog-uid'
        catalog_item['spec']['messageTemplates']['user'] = {'template': 'user'}
        order = created_order(submission(service={'autoDetach': False}, skipSalesforceId=True), catalog_item)
        ref = plan_resources(order)[0]
        body = build_resource(order, ref, catalog_item=catalog_item, attempt=1, created={}, now=NOW)
        annotations = body['metadata']['annotations']
        self.assertNotIn('babylon.gpte.redhat.com/url', annotations)
        self.assertNotIn('demo.redhat.com/user-message-template', annotations)
        self.assertEqual(annotations['demo.redhat.com/scheduled'], 'false')
        self.assertEqual(annotations['demo.redhat.com/provide_salesforce-id_later'], 'true')
        self.assertNotIn('demo.redhat.com/salesforce-items', annotations)
        self.assertNotIn('autoDetach', body['spec'])
        self.assertNotIn('start', body['spec']['lifespan'])

    def test_names_follow_recorded_plan(self):
        catalog_item = catalog()
        order = created_order(submission(), catalog_item)
        self.assertEqual(plan_resources(order), plan_resources(copy.deepcopy(order)))
        self.assertNotEqual(plan_resources(order)[0]['name'], plan_resources(order, 'ffff0000')[0]['name'])


class TestWorkshopAdapter(unittest.TestCase):
    def test_workshop_and_provision_match_ui_construction(self):
        catalog_item = catalog()
        catalog_item['spec']['workshopLabUiRedirect'] = True
        start = NOW + timedelta(days=1)
        order = created_order(submission(
            order_type='workshop',
            schedule={'start': format_time(start), 'readyBy': format_time(start - timedelta(hours=2))},
            workshop={'count': 4, 'accessPassword': 'pass1234', 'displayName': 'My Workshop', 'resourcePool': 'pool-b'},
            salesforceItems=[{'id': '006xx', 'type': 'opportunity'}],
        ), catalog_item)
        workshop_ref, provision_ref = plan_resources(order)
        self.assertEqual(workshop_ref['name'], provision_ref['name'])
        workshop = build_resource(order, workshop_ref, catalog_item=catalog_item, attempt=1, created={}, now=NOW, base_url=BASE_URL)
        name = workshop_ref['name']
        self.assertEqual(workshop['kind'], 'Workshop')
        self.assertEqual(workshop['metadata']['annotations'], {
            'babylon.gpte.redhat.com/url': f'{BASE_URL}/workshops/{USER_NAMESPACE}/{name}',
            'demo.redhat.com/info-message-template': '{"template":"info","templateFormat":"asciidoc"}',
            'demo.redhat.com/user-message-template': '{"template":"user","templateFormat":"asciidoc"}',
            'demo.redhat.com/scheduled': 'true',
            'demo.redhat.com/requester': 'alice@example.com',
            'demo.redhat.com/orderedBy': 'alice',
            'babylon.gpte.redhat.com/category': 'Labs',
            'babylon.gpte.redhat.com/support-link': 'https://help',
            'demo.redhat.com/purpose': 'Training - Internal',
            'demo.redhat.com/purpose-activity': 'Internal',
            'demo.redhat.com/salesforce-items': '[{"id":"006xx","type":"opportunity"}]',
            'demo.redhat.com/provide_salesforce-id_later': 'false',
        })
        self.assertEqual(workshop['spec'], {
            'multiuserServices': True,
            'openRegistration': True,
            'lifespan': {
                'start': format_time(start),
                'end': format_time(start + timedelta(days=3)),
                'readyBy': format_time(start - timedelta(hours=2)),
                'maximum': '14d',
                'relativeMaximum': '5d',
            },
            'actionSchedule': {'start': format_time(start), 'stop': format_time(start + timedelta(hours=4))},
            'labUserInterface': {'redirect': True},
            'accessPassword': 'pass1234',
            'description': '<p></p>',
            'displayName': 'My Workshop',
        })
        workshop['metadata']['uid'] = 'workshop-uid'
        provision = build_resource(
            order, provision_ref, catalog_item=catalog_item, attempt=1,
            created={'Workshop': workshop}, now=NOW,
        )
        self.assertEqual(provision['metadata']['ownerReferences'], [{
            'apiVersion': 'babylon.gpte.redhat.com/v1', 'controller': True, 'kind': 'Workshop',
            'name': name, 'uid': 'workshop-uid',
        }])
        self.assertEqual(provision['metadata']['labels']['babylon.gpte.redhat.com/workshop'], name)
        self.assertEqual(provision['metadata']['annotations'], {'babylon.gpte.redhat.com/category': 'Labs'})
        self.assertEqual(provision['spec'], {
            'catalogItem': {'name': 'tests.test-item.prod', 'namespace': 'babylon-catalog-prod'},
            'concurrency': 10,
            'count': 4,
            'parameters': {
                'num_users': 5, 'gpu_enabled': False, 'region': 'na', 'worker_count': 3,
                'purpose': 'Training - Internal', 'purpose_activity': 'Internal',
                'salesforce_items': '[{"id":"006xx","type":"opportunity"}]',
            },
            'startDelay': 30,
            'workshopName': name,
            'resourcePool': 'pool-b',
            'autoDetach': {'when': AUTO_DETACH_WHEN},
        })

    def test_workshop_without_users_is_not_multiuser(self):
        catalog_item = make_catalog_item(workshopUserMode='none')
        catalog_item['metadata']['uid'] = 'catalog-uid'
        order = created_order(submission(order_type='workshop'), catalog_item)
        workshop = build_resource(order, plan_resources(order)[0], catalog_item=catalog_item, attempt=1, created={}, now=NOW)
        self.assertFalse(workshop['spec']['multiuserServices'])


class TestSelfPacedLabAdapter(unittest.TestCase):
    def test_lab_and_provision_item_match_ui_construction(self):
        catalog_item = catalog()
        order = created_order(submission(order_type='selfPacedLab', selfPacedLab={'poolSize': 3, 'accessPassword': 'pw123456'}), catalog_item)
        lab_ref, item_ref = plan_resources(order)
        lab = build_resource(order, lab_ref, catalog_item=catalog_item, attempt=1, created={}, now=NOW)
        self.assertEqual(lab['kind'], 'SelfPacedLab')
        self.assertEqual(lab['spec'], {
            'openRegistration': True,
            'lifespan': {'end': format_time(NOW + timedelta(days=3))},
            'accessPassword': 'pw123456',
            'description': '<p></p>',
            'displayName': 'Test Item',
        })
        self.assertEqual(lab['metadata']['annotations']['demo.redhat.com/requester'], 'alice@example.com')
        lab['metadata']['uid'] = 'lab-uid'
        item = build_resource(order, item_ref, catalog_item=catalog_item, attempt=1, created={'SelfPacedLab': lab}, now=NOW)
        self.assertEqual(item['metadata']['ownerReferences'][0]['kind'], 'SelfPacedLab')
        self.assertEqual(item['spec']['poolSize'], 3)
        self.assertEqual(item['spec']['selfPacedLabName'], lab_ref['name'])
        self.assertEqual(item['spec']['concurrency'], 5)
        self.assertEqual(item['spec']['startDelay'], 10)
        self.assertEqual(item['spec']['parameters']['salesforce_items'], '[]')


class TestUnsupported(unittest.TestCase):
    def test_unknown_order_type_fails_before_planning(self):
        order = {'metadata': {'uid': 'u', 'namespace': 'n', 'name': 'o'},
                 'spec': {'orderType': 'multiWorkshop', 'catalogItem': {'name': 'x'}}}
        with self.assertRaises(UnsupportedOrderTypeError):
            plan_resources(order)
        with self.assertRaises(UnsupportedOrderTypeError):
            assess_resources('multiWorkshop', {})


def claim(states):
    return {'metadata': {}, 'status': {'resources': [{'state': state} for state in states]}}


def subject(current_state, complete=False):
    state = {'kind': 'AnarchySubject', 'spec': {'vars': {'current_state': current_state}}}
    if complete:
        state['status'] = {'towerJobs': {'provision': {'completeTimestamp': '2026-10-26T12:00:00Z'}}}
    return state


class TestAssessment(unittest.TestCase):
    def test_service_outcomes_match_workshop_manager_logic(self):
        cases = (
            ({'metadata': {}}, 'provisioning'),
            (claim([None]), 'provisioning'),
            (claim([subject('provisioning')]), 'provisioning'),
            (claim([subject('started', complete=True)]), 'provisioned'),
            (claim([subject('started', complete=True), subject('provisioning')]), 'provisioning'),
            (claim([subject('provision-failed')]), 'failed'),
            (claim([subject('provision-error')]), 'failed'),
            (claim([subject('started', complete=True), subject('provision-cancelled')]), 'failed'),
        )
        for resource_claim, expected in cases:
            with self.subTest(resource_claim=resource_claim):
                outcome, _ = assess_resources('service', {'ResourceClaim': resource_claim})
                self.assertEqual(outcome, expected)

    def test_missing_or_deleting_resources(self):
        self.assertEqual(assess_resources('service', {'ResourceClaim': None})[0], 'missing')
        self.assertEqual(
            assess_resources('service', {'ResourceClaim': {'metadata': {'deletionTimestamp': 'x'}}})[0], 'missing',
        )
        self.assertEqual(assess_resources('workshop', {'Workshop': {'metadata': {}}, 'WorkshopProvision': None})[0], 'missing')

    def test_workshop_outcomes(self):
        def objects(**status):
            return {'Workshop': {'metadata': {}}, 'WorkshopProvision': {'metadata': {}, 'spec': {'count': 10}, 'status': status}}
        self.assertEqual(assess_resources('workshop', objects(activeCount=10))[0], 'provisioned')
        self.assertEqual(assess_resources('workshop', objects(activeCount=3, provisioningCount=2))[0], 'provisioning')
        self.assertEqual(assess_resources('workshop', objects(failedCount=6, provisioningCount=1))[0], 'provisioning')
        self.assertEqual(assess_resources('workshop', objects(failedCount=6, activeCount=4))[0], 'failed')
        self.assertEqual(assess_resources('workshop', objects(failedCount=5, activeCount=5), workshop_fail_threshold=60)[0], 'provisioning')

    def test_self_paced_lab_outcomes(self):
        def objects(**status):
            return {'SelfPacedLab': {'metadata': {}}, 'SelfPacedLabProvisionItem': {'metadata': {}, 'spec': {'poolSize': 5}, 'status': status}}
        self.assertEqual(assess_resources('selfPacedLab', objects(readyCount=4, assignedCount=1))[0], 'provisioned')
        self.assertEqual(assess_resources('selfPacedLab', objects(readyCount=2, provisioningCount=3))[0], 'provisioning')
        self.assertEqual(assess_resources('selfPacedLab', objects(readyCount=1, failedCount=4))[0], 'failed')

    def test_recorded_uid_overrides_labels(self):
        order = {'metadata': {'uid': 'order-uid'}}
        relabelled = {'metadata': {'uid': 'claim-uid', 'labels': {}}}
        self.assertTrue(owned_by_attempt(relabelled, order, 1, {'uid': 'claim-uid'}))
        forged = {'metadata': {'uid': 'other', 'labels': {
            'babylon.gpte.redhat.com/catalog-item-order-uid': 'order-uid',
            'babylon.gpte.redhat.com/catalog-item-order-attempt': '1'}}}
        self.assertFalse(owned_by_attempt(forged, order, 1, {'uid': 'claim-uid'}))

    def test_owned_by_attempt(self):
        order = {'metadata': {'uid': 'order-uid'}}
        labels = {'babylon.gpte.redhat.com/catalog-item-order-uid': 'order-uid',
                  'babylon.gpte.redhat.com/catalog-item-order-attempt': '1'}
        self.assertTrue(owned_by_attempt({'metadata': {'labels': labels}}, order, 1))
        self.assertFalse(owned_by_attempt({'metadata': {'labels': labels}}, order, 2))
        self.assertFalse(owned_by_attempt({'metadata': {'labels': {**labels, 'babylon.gpte.redhat.com/catalog-item-order-uid': 'other'}}}, order, 1))
        self.assertFalse(owned_by_attempt({'metadata': {}}, order, 1))


if __name__ == '__main__':
    unittest.main()
