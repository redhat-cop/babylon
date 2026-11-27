import React from 'react';
import fetchMock from 'jest-fetch-mock';
import { createMemoryHistory } from 'history';
import { Route, Routes } from 'react-router-dom';
import { SWRConfig } from 'swr';
import { render, screen, waitFor, generateSession } from '@app/utils/test-utils';
import OrderPlacing from './OrderPlacing';
import type { CatalogItemOrder } from './types';

// Session promise read by apiFetch.
const testWindow = window as unknown as { sessionPromiseInstance?: Promise<{ token: string }> };

jest.mock('@app/utils/useSession', () => jest.fn(() => ({ getSession: () => generateSession({}) })));

const BASE = {
  id: 'user-test-redhat-com/order-1',
  name: 'order-1',
  namespace: 'user-test-redhat-com',
  uid: 'uid-1',
  orderType: 'service',
  catalogItem: { namespace: 'babylon-catalog-test', name: 'tests.item.prod' },
  request: {},
  attempts: [],
};

function order(overrides: Partial<CatalogItemOrder>): CatalogItemOrder {
  return { ...BASE, phase: 'Submitted', approval: {}, ...overrides } as CatalogItemOrder;
}

let responses: CatalogItemOrder[];

async function renderPlacing() {
  const history = createMemoryHistory({ initialEntries: ['/orders/user-test-redhat-com/order-1/placing'] });
  await render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <Routes>
        <Route path="/orders/:namespace/:name/placing" element={<OrderPlacing />} />
        <Route path="/orders/:namespace/:name" element={<p>order page</p>} />
        <Route path="/services/:namespace/:name" element={<p>service page</p>} />
      </Routes>
    </SWRConfig>,
    { history },
  );
  return history;
}

describe('OrderPlacing', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
    testWindow.sessionPromiseInstance = Promise.resolve({ token: 'test-token' });
    fetchMock.mockResponse(async () => {
      const next = responses.length > 1 ? responses.shift() : responses[0];
      return { status: 200, body: JSON.stringify(next), headers: { 'Content-Type': 'application/json' } };
    });
  });

  afterEach(() => {
    delete testWindow.sessionPromiseInstance;
  });

  test('waits, then replaces itself with the created service when no approval is needed', async () => {
    responses = [
      order({ phase: 'Submitted' }),
      order({ phase: 'Approved', approval: { state: 'NotRequired' } }),
      order({
        phase: 'Approved',
        approval: { state: 'NotRequired' },
        attempts: [{ number: 1, state: 'Created', resources: [{ kind: 'ResourceClaim', namespace: 'user-test-redhat-com', name: 'tests.item.prod-1a2b', uid: 'rc' }] }],
      }),
    ];
    const history = await renderPlacing();
    expect(screen.getByText('Placing your order…')).toBeInTheDocument();
    expect(await screen.findByText('service page', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(history.location.pathname).toBe('/services/user-test-redhat-com/tests.item.prod-1a2b');
    expect(history.action).toBe('REPLACE');
  });

  test('opens the order page as soon as approval is needed', async () => {
    responses = [order({ phase: 'PendingApproval', approval: { state: 'Pending', requestedAt: '2026-11-17T10:00:00Z' } })];
    const history = await renderPlacing();
    expect(await screen.findByText('order page')).toBeInTheDocument();
    expect(history.location.pathname).toBe('/orders/user-test-redhat-com/order-1');
  });

  test('keeps waiting while the controller has not decided', async () => {
    responses = [order({ phase: 'Submitted' })];
    const history = await renderPlacing();
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1), { timeout: 3000 });
    expect(history.location.pathname).toBe('/orders/user-test-redhat-com/order-1/placing');
    expect(screen.getByText('Placing your order…')).toBeInTheDocument();
  });
});
