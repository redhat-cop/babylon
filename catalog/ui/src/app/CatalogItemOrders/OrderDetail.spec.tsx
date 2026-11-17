import React from 'react';
import fetchMock from 'jest-fetch-mock';
import { createMemoryHistory } from 'history';
import { Route, Routes } from 'react-router-dom';
import { SWRConfig } from 'swr';
import { render, screen, fireEvent, generateSession } from '@app/utils/test-utils';
import OrderDetail from './OrderDetail';
import { PENDING_APPROVAL_MESSAGE } from './order-utils';
import type { CatalogItemOrder } from './types';

// Session promise read by apiFetch.
const testWindow = window as unknown as { sessionPromiseInstance?: Promise<{ token: string }> };

let sessionOverrides: Parameters<typeof generateSession>[0] = {};
jest.mock('@app/utils/useSession', () =>
  jest.fn(() => ({ getSession: () => generateSession({ ...sessionOverrides }) })),
);

const ORDER_PATH = '/api/catalog-item-orders/user-test-redhat-com/order-1';

function makeOrder(overrides: Partial<CatalogItemOrder> = {}): CatalogItemOrder {
  return {
    id: 'user-test-redhat-com/order-1',
    name: 'order-1',
    namespace: 'user-test-redhat-com',
    uid: 'uid-1',
    phase: 'PendingApproval',
    orderType: 'service',
    catalogItem: { namespace: 'babylon-catalog-test', name: 'tests.item.prod' },
    submittedAt: '2026-11-17T10:00:00Z',
    request: { purpose: 'Training - Internal', parameters: { num_users: 2, admin_password: 'hunter2' } },
    approval: {
      state: 'Pending',
      expiresAt: '2099-11-20T10:00:00Z',
      reviewUrl: 'https://catalog.example.com/approvals/uid-1',
      manager: { state: 'Resolved', directManager: { email: 'dana@example.com', name: 'Dana Manager' } },
    },
    policy: { matchedRules: [{ id: 'large', reason: 'Large orders need approval.' }] },
    attempts: [],
    cancel: { allowed: true },
    ...overrides,
  };
}

let orderResponses: CatalogItemOrder[];
let postHandler: (url: string) => { status: number; body: unknown };

function setUpNetwork() {
  fetchMock.mockResponse(async (request) => {
    const url = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'POST') {
      const { status, body } = postHandler(url);
      return { status, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } };
    }
    if (url === ORDER_PATH) {
      const next = orderResponses.length > 1 ? orderResponses.shift() : orderResponses[0];
      return { status: 200, body: JSON.stringify(next), headers: { 'Content-Type': 'application/json' } };
    }
    // Catalog item lookups for the display name.
    return { status: 404, body: '{}' };
  });
}

async function renderOrder() {
  const history = createMemoryHistory({ initialEntries: ['/orders/user-test-redhat-com/order-1'] });
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <Routes>
        <Route path="/orders/:namespace/:name" element={<OrderDetail />} />
      </Routes>
    </SWRConfig>,
    { history },
  );
}

function posts() {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
}

describe('OrderDetail', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
    sessionOverrides = {};
    testWindow.sessionPromiseInstance = Promise.resolve({ token: 'test-token' });
    orderResponses = [makeOrder()];
    postHandler = () => ({ status: 500, body: {} });
    setUpNetwork();
  });

  afterEach(() => {
    delete testWindow.sessionPromiseInstance;
  });

  test('a pending order explains that provisioning has not started and links the approval request', async () => {
    await renderOrder();
    expect(await screen.findByText(PENDING_APPROVAL_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText('Large orders need approval.')).toBeInTheDocument();
    expect(screen.getByText(/Dana Manager/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://catalog.example.com/approvals/uid-1' })).toBeInTheDocument();
    expect(screen.getByText('num_users')).toBeInTheDocument();
    expect(screen.queryByText(/hunter2/)).not.toBeInTheDocument();
    expect(screen.queryByText('admin_password')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry provisioning' })).not.toBeInTheDocument();
  });

  test('cancel is only offered when the backend allows it', async () => {
    orderResponses = [makeOrder({ phase: 'Provisioning', cancel: { allowed: false, code: 'dispatch_started' } })];
    await renderOrder();
    await screen.findByText('Provisioning is in progress.');
    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument();
  });

  test('a cancellation that races with provisioning shows the current state instead of an error', async () => {
    const provisioning = makeOrder({
      phase: 'Provisioning',
      cancel: { allowed: false, code: 'dispatch_started' },
      attempts: [{ number: 1, state: 'Provisioning', resources: [{ kind: 'ResourceClaim', namespace: 'user-test-redhat-com', name: 'tests.item.prod-1a2b3c4d', uid: 'rc-1' }] }],
    });
    postHandler = (url) => {
      expect(url).toBe(`${ORDER_PATH}/cancel`);
      orderResponses = [provisioning];
      return { status: 409, body: { error: 'dispatch_started', message: 'Provisioning has started; manage or delete the provisioned resources instead' } };
    };
    await renderOrder();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel order' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel order', hidden: false }));

    expect(await screen.findByText('Provisioning has already started')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'View service' })).toHaveAttribute(
      'href',
      '/services/user-test-redhat-com/tests.item.prod-1a2b3c4d',
    );
    expect(posts()).toHaveLength(1);
  });

  test('a failed order shows the failure without retry or new-order actions', async () => {
    orderResponses = [
      makeOrder({
        phase: 'Failed',
        approval: { state: 'Approved' },
        cancel: { allowed: false, code: 'dispatch_started' },
        attempts: [{ number: 1, state: 'Failed', resources: [], failure: { message: 'Provisioning failed: no capacity', retryable: true } }],
      }),
    ];
    await renderOrder();
    expect(await screen.findAllByText('Provisioning failed: no capacity')).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Place a new order' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument();
  });

  test('approved but not provisioned never shows success', async () => {
    orderResponses = [makeOrder({ phase: 'Ready', approval: { state: 'Approved' }, cancel: { allowed: true } })];
    await renderOrder();
    expect(await screen.findByText(/Provisioning has not started yet/)).toBeInTheDocument();
    expect(screen.queryByText('Provisioned')).not.toBeInTheDocument();
  });

});
