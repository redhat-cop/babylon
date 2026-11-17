import type { CatalogItem } from '@app/types';
import {
  PENDING_APPROVAL_MESSAGE,
  approvedBy,
  buildOrderSubmission,
  getOrderStatus,
  getReviewStatus,
  isOrderActive,
  newOrderPath,
  orderResourceLinks,
  safeParameters,
  usesOrderApi,
} from './order-utils';
import type { OrderFormInput } from './order-utils';
import type { CatalogItemOrder } from './types';

const NOW = Date.parse('2026-11-17T12:00:00Z');

const catalogItem = {
  apiVersion: 'babylon.gpte.redhat.com/v1',
  kind: 'CatalogItem',
  metadata: { namespace: 'babylon-catalog-test', name: 'tests.item.prod' },
  spec: {},
} as unknown as CatalogItem;

function input(overrides: Partial<OrderFormInput> = {}): OrderFormInput {
  return {
    catalogItem,
    namespace: 'user-test',
    parameterValues: {
      num_users: 3,
      purpose: 'Training - Internal',
      purpose_activity: 'Enablement',
      purpose_explanation: 'Partner',
      salesforce_id: 'x',
    },
    purpose: 'Training - Internal',
    activity: 'Enablement',
    explanation: 'Partner',
    startDate: undefined,
    stopDate: new Date('2026-11-18T00:00:00Z'),
    endDate: new Date('2026-11-20T00:00:00Z'),
    useAutoDetach: true,
    ...overrides,
  };
}

function order(overrides: Partial<CatalogItemOrder> = {}): CatalogItemOrder {
  return {
    id: 'user-test/order-1',
    name: 'order-1',
    namespace: 'user-test',
    uid: 'uid-1',
    phase: 'Submitted',
    orderType: 'service',
    catalogItem: { namespace: 'babylon-catalog-test', name: 'tests.item.prod' },
    request: {},
    approval: {},
    attempts: [],
    ...overrides,
  };
}

describe('buildOrderSubmission', () => {
  test('service orders strip reserved parameters and keep purpose fields as dedicated fields', () => {
    const body = buildOrderSubmission(input({ salesforceItems: [{ id: '701', type: 'campaign' }] }));
    expect(body).toMatchObject({
      catalogItem: { namespace: 'babylon-catalog-test', name: 'tests.item.prod' },
      namespace: 'user-test',
      orderType: 'service',
      purpose: 'Training - Internal',
      activity: 'Enablement',
      explanation: 'Partner',
      parameters: { num_users: 3 },
      salesforceItems: [{ id: '701', type: 'campaign' }],
      service: { autoDetach: true },
      schedule: { stop: '2026-11-18T00:00:00.000Z', end: '2026-11-20T00:00:00.000Z' },
    });
    expect(body).not.toHaveProperty('idempotencyKey');
    expect(Object.keys(body.parameters)).toEqual(['num_users']);
  });

  test('kept defaults without a start time are left to the API so approval waiting does not shorten them', () => {
    const body = buildOrderSubmission(input({ usesDefaultSchedule: true }));
    expect(body).not.toHaveProperty('schedule');
  });

  test('an explicit start keeps absolute times even with defaults', () => {
    const startDate = new Date('2026-11-19T09:00:00Z');
    const body = buildOrderSubmission(input({ usesDefaultSchedule: true, startDate }));
    expect(body.schedule).toEqual({
      start: '2026-11-19T09:00:00.000Z',
      stop: '2026-11-18T00:00:00.000Z',
      end: '2026-11-20T00:00:00.000Z',
    });
  });

  test('workshop orders carry the workshop options and ready-by time', () => {
    const body = buildOrderSubmission(
      input({
        readyByDate: new Date('2026-11-19T17:00:00Z'),
        selectedResourcePool: 'pool-a',
        workshop: {
          userRegistration: 'open',
          accessPassword: 'secret12',
          displayName: 'My workshop',
          description: '',
          provisionCount: 4,
          provisionConcurrency: 10,
          provisionStartDelay: 30,
        },
      }),
    );
    expect(body.orderType).toBe('workshop');
    expect(body.schedule.readyBy).toBe('2026-11-19T17:00:00.000Z');
    expect(body.workshop).toEqual({
      accessPassword: 'secret12',
      autoDetach: true,
      concurrency: 10,
      count: 4,
      displayName: 'My workshop',
      openRegistration: true,
      resourcePool: 'pool-a',
      startDelay: 30,
    });
    expect(body).not.toHaveProperty('service');
  });

  test('self-paced lab orders never send an auto-stop or ready-by time', () => {
    const body = buildOrderSubmission(
      input({
        readyByDate: new Date('2026-11-19T17:00:00Z'),
        workshop: { userRegistration: 'pre', displayName: 'Lab', provisionCount: 1 },
        selfPacedLab: { poolSize: 5, assignedLifespan: '4h', unassignedLifespan: '1d', concurrency: 2, startDelay: 10 },
      }),
    );
    expect(body.orderType).toBe('selfPacedLab');
    expect(body.schedule).toEqual({ end: '2026-11-20T00:00:00.000Z' });
    expect(body.selfPacedLab).toMatchObject({ poolSize: 5, assignedLifespan: '4h', openRegistration: false });
  });
});

describe('usesOrderApi', () => {
  test('orders go through the order API except external URL and white glove orders', () => {
    expect(usesOrderApi({ catalogItem })).toBe(true);
    expect(usesOrderApi({ catalogItem: { ...catalogItem, spec: { externalUrl: 'https://x' } } as CatalogItem })).toBe(false);
    expect(usesOrderApi({ catalogItem, whiteGloved: true })).toBe(false);
  });
});

describe('getOrderStatus', () => {
  test('pending approval shows the required message', () => {
    const status = getOrderStatus(order({ phase: 'PendingApproval', approval: { state: 'Pending' } }));
    expect(status.kind).toBe('pendingApproval');
    expect(status.description).toBe(PENDING_APPROVAL_MESSAGE);
  });

  test('an approved order says who approved it, without tracking provisioning', () => {
    const approval = { state: 'Approved' as const, decision: { outcome: 'Approved' as const, decidedBy: 'dana', decidedByEmail: 'dana@example.com' } };
    const fulfilled = getOrderStatus(order({ phase: 'Fulfilled', approval }));
    expect(fulfilled).toMatchObject({ kind: 'approved', label: 'Approved' });
    expect(fulfilled.description).toMatch(/^Approved by dana@example.com\./);
    expect(fulfilled.description).not.toMatch(/provisioned/i);
    const creating = getOrderStatus(order({ phase: 'Creating', approval }));
    expect(creating).toMatchObject({ kind: 'creating', label: 'Approved' });
    expect(creating.description).toMatch(/being created/);
    expect(approvedBy(order({ approval }))).toBe('dana@example.com');
  });

  test('maps every terminal and blocked state', () => {
    const cases: [Partial<CatalogItemOrder>, string][] = [
      [{ phase: 'Fulfilled', approval: { state: 'NotRequired' } }, 'created'],
      [{ phase: 'Denied', approval: { state: 'Denied', decision: { outcome: 'Denied', decidedBy: 'mgr' } } }, 'denied'],
      [{ phase: 'Expired' }, 'expired'],
      [{ phase: 'Cancelled' }, 'cancelled'],
      [{ phase: 'Blocked', blocked: { reason: 'OrderingBlocked', message: 'Ordering is paused', recoverable: true } }, 'onHold'],
      [{ phase: 'Blocked', blocked: { reason: 'PolicyChanged', message: 'Policy changed', recoverable: false } }, 'blocked'],
    ];
    for (const [overrides, kind] of cases) {
      expect(getOrderStatus(order(overrides)).kind).toBe(kind);
    }
  });
});

describe('isOrderActive', () => {
  test('refreshes orders until they are finished', () => {
    expect(isOrderActive(order({ phase: 'PendingApproval' }))).toBe(true);
    expect(isOrderActive(order({ phase: 'Creating' }))).toBe(true);
    expect(isOrderActive(order({ phase: 'Fulfilled' }))).toBe(false);
    expect(isOrderActive(order({ phase: 'Denied' }))).toBe(false);
  });
});

describe('orderResourceLinks', () => {
  test('links to the existing service, workshop or lab pages once resources exist', () => {
    expect(orderResourceLinks(order())).toEqual([]);
    const links = orderResourceLinks(
      order({
        attempts: [
          { number: 1, state: 'Created', resources: [{ kind: 'ResourceClaim', namespace: 'user-test', name: 'old', uid: 'u0' }] },
          {
            number: 2,
            state: 'Created',
            resources: [
              { kind: 'Workshop', namespace: 'user-test', name: 'item-abc', uid: 'u1' },
              { kind: 'WorkshopProvision', namespace: 'user-test', name: 'item-abc', uid: 'u2' },
            ],
          },
        ],
      }),
    );
    expect(links).toEqual([{ to: '/workshops/user-test/item-abc', label: 'View workshop' }]);
  });
});

describe('safeParameters', () => {
  test('drops parameters whose names look sensitive', () => {
    expect(safeParameters({ num_users: 2, db_password: 'x', api_token: 'y', Region: 'eu' })).toEqual([
      ['num_users', 2],
      ['Region', 'eu'],
    ]);
  });
});

describe('getReviewStatus', () => {
  test('treats an expired pending request as expired', () => {
    expect(getReviewStatus({ phase: 'PendingApproval', approval: { state: 'Pending', expiresAt: '2026-11-17T11:00:00Z' }, canDecide: false }, NOW).label).toBe('Expired');
    expect(getReviewStatus({ phase: 'PendingApproval', approval: { state: 'Pending', expiresAt: '2026-11-18T11:00:00Z' }, canDecide: true }, NOW).label).toBe('Pending');
  });
});

test('newOrderPath opens the order form for the same catalog item', () => {
  expect(newOrderPath(catalogItem)).toBe('/catalog/babylon-catalog-test/order/tests.item.prod');
});

describe('visibleOrders', () => {
  test('lists only orders that needed approval, newest first', () => {
    const { visibleOrders } = jest.requireActual('./OrdersList');
    const orders = [
      order({ uid: 'a', submittedAt: '2026-11-15T00:00:00Z', approval: { state: 'Approved' } }),
      order({ uid: 'b', submittedAt: '2026-11-17T00:00:00Z', approval: { state: 'NotRequired' } }),
      order({ uid: 'c', submittedAt: '2026-11-16T00:00:00Z', approval: { state: 'Pending' } }),
    ];
    expect(visibleOrders(orders).map((o: CatalogItemOrder) => o.uid)).toEqual(['c', 'a']);
  });
});
