import React from 'react';
import fetchMock from 'jest-fetch-mock';
import { createMemoryHistory } from 'history';
import { Route, Routes } from 'react-router-dom';
import { SWRConfig } from 'swr';
import { render, screen, waitFor, fireEvent, generateSession, within } from '@app/utils/test-utils';
import ManagerApprovals from './ApprovalsPage';
import AdminApprovals from './AdminApprovals';
import type { ApprovalReview } from './types';

// Session promise read by apiFetch.
const testWindow = window as unknown as { sessionPromiseInstance?: Promise<{ token: string }> };

jest.mock('@app/utils/useSession', () =>
  jest.fn(() => ({ getSession: () => ({ ...generateSession({}), authUser: 'dana@example.com' }) })),
);

function makeReview(overrides: Partial<ApprovalReview> = {}): ApprovalReview {
  return {
    uid: 'uid-1',
    orderId: 'user-alice/order-1',
    phase: 'PendingApproval',
    requester: { user: 'alice@example.com', email: 'alice@example.com' },
    catalogItem: { name: 'tests.item.prod', namespace: 'babylon-catalog-test', displayName: 'Test Item' },
    submittedAt: '2026-11-17T10:00:00Z',
    request: { orderType: 'workshop', quantity: 12, purpose: 'Training - Internal', schedule: { endAfter: '3d' } },
    parameters: { num_users: 25 },
    reasons: ['Large workshops need approval.'],
    approval: { state: 'Pending', requestedAt: '2026-11-17T10:00:00Z', expiresAt: '2099-11-20T10:00:00Z' },
    authority: { basis: 'direct_manager', source: 'reporting-api' },
    canDecide: true,
    ...overrides,
  };
}

type Handler = (url: URL, init: RequestInit) => { status: number; body: unknown };
let handler: Handler;

function json(status: number, body: unknown) {
  return { status, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } };
}

async function renderAt(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] });
  await render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <Routes>
        <Route path="/approvals/:orderUid" element={<ManagerApprovals />} />
        <Route path="/approvals" element={<ManagerApprovals />} />
        <Route path="/admin/approvals" element={<AdminApprovals />} />
      </Routes>
    </SWRConfig>,
    { history },
  );
  return history;
}

function calls(method: string) {
  return fetchMock.mock.calls.filter(([, init]) => (init?.method || 'GET') === method);
}

describe('approval review (email links)', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
    testWindow.sessionPromiseInstance = Promise.resolve({ token: 'test-token' });
    fetchMock.mockResponse(async (request) => {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname.startsWith('/apis/')) return json(404, {});
      const { status, body } = handler(url, { method: request.method, body: await request.text() });
      return json(status, body);
    });
  });

  afterEach(() => {
    delete testWindow.sessionPromiseInstance;
  });

  test('opening the link only displays the request; nothing is recorded without an explicit decision', async () => {
    handler = () => ({ status: 200, body: makeReview() });
    await renderAt('/approvals/uid-1');
    expect(await screen.findByText('Large workshops need approval.')).toBeInTheDocument();
    expect(screen.getByText('Direct manager')).toBeInTheDocument();
    expect(calls('POST')).toHaveLength(0);
    expect(calls('GET').map(([url]) => url)).toContain('/api/catalog-item-order-approvals/uid-1');

    // Approve needs a confirmation step; closing the dialog records nothing.
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(calls('POST')).toHaveLength(0);
  });

  test('approving with a comment posts once and confirms the service will be created', async () => {
    handler = (url, init) => {
      if (init.method === 'POST') {
        expect(url.pathname).toBe('/api/catalog-item-order-approvals/uid-1/approve');
        expect(JSON.parse(init.body as string)).toEqual({ comment: 'Approved for the partner event' });
        return {
          status: 200,
          body: makeReview({ canDecide: false, approval: { state: 'Pending', decision: { outcome: 'Approved', decidedBy: 'dana@example.com' } } }),
        };
      }
      return { status: 200, body: makeReview() };
    };
    await renderAt('/approvals/uid-1');
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Comment (optional)'), { target: { value: 'Approved for the partner event' } });
    // A double click on the confirm button sends a single decision.
    const confirm = within(dialog).getByRole('button', { name: 'Approve' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(await screen.findByText('Request approved')).toBeInTheDocument();
    expect(screen.getByText(/the service is created automatically/)).toBeInTheDocument();
    expect(calls('POST')).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument());
  });

  test('denying keeps an optional comment for the requester', async () => {
    handler = (url, init) => {
      if (init.method === 'POST') {
        expect(url.pathname).toBe('/api/catalog-item-order-approvals/uid-1/deny');
        expect(JSON.parse(init.body as string)).toEqual({ comment: 'Use the shared environment' });
        return { status: 200, body: makeReview({ canDecide: false, approval: { state: 'Pending', decision: { outcome: 'Denied' } } }) };
      }
      return { status: 200, body: makeReview() };
    };
    await renderAt('/approvals/uid-1');
    fireEvent.click(await screen.findByRole('button', { name: 'Deny' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Comment (optional)'), { target: { value: 'Use the shared environment' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Deny' }));
    expect(await screen.findByText('Request denied')).toBeInTheDocument();
    expect(calls('POST')).toHaveLength(1);
  });

  test('a conflicting decision reloads the request instead of replaying the decision', async () => {
    let decided = false;
    handler = (url, init) => {
      if (init.method === 'POST') {
        decided = true;
        return { status: 409, body: { error: 'already_decided', message: 'A decision has already been recorded for this order' } };
      }
      return {
        status: 200,
        body: decided
          ? makeReview({ canDecide: false, approval: { state: 'Denied', decision: { outcome: 'Denied', decidedBy: 'director@example.com', decidedByEmail: 'director@example.com' } } })
          : makeReview(),
      };
    };
    await renderAt('/approvals/uid-1');
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Approve' }));

    expect(await screen.findByText('Someone already decided this request')).toBeInTheDocument();
    expect(await screen.findByText('director@example.com', { exact: false })).toBeInTheDocument();
    expect(calls('POST')).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument());
  });

  test('requesters see why they cannot review their own order', async () => {
    handler = () => ({ status: 403, body: { error: 'self_decision', message: 'Requesters cannot review or decide their own orders' } });
    await renderAt('/approvals/uid-1');
    expect(await screen.findByText('You cannot review your own order')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  test('a Reporting API outage is shown as temporary with a retry', async () => {
    handler = () => ({
      status: 503,
      body: { error: 'manager_lookup_unavailable', message: 'Manager information is temporarily unavailable; try again later' },
    });
    await renderAt('/approvals/uid-1');
    expect(await screen.findByText('Manager information is temporarily unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('approvals list', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
    testWindow.sessionPromiseInstance = Promise.resolve({ token: 'test-token' });
    fetchMock.mockResponse(async (request) => {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname.startsWith('/apis/')) return json(404, {});
      const { status, body } = handler(url, { method: request.method });
      return json(status, body);
    });
  });

  afterEach(() => {
    delete testWindow.sessionPromiseInstance;
  });

  test('defaults to pending requests, pages with continue tokens and reports incomplete results', async () => {
    handler = (url) => {
      if (url.searchParams.get('continue') === 'next') {
        return { status: 200, body: { items: [makeReview({ uid: 'uid-2', requester: { email: 'bob@example.com' } })], incomplete: false } };
      }
      return { status: 200, body: { items: [makeReview()], continue: 'next', incomplete: true } };
    };
    await renderAt('/approvals');
    expect(await screen.findByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('Some requests may be missing')).toBeInTheDocument();
    const first = new URL(String(calls('GET').find(([u]) => String(u).includes('approvals'))[0]), 'http://localhost');
    expect(first.searchParams.get('state')).toBe('pending');
    expect(first.searchParams.get('limit')).toBe('50');
    expect(screen.getByRole('link', { name: /Test Item|tests.item.prod/ })).toHaveAttribute('href', '/approvals/uid-1');

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('bob@example.com')).toBeInTheDocument();
  });

  test('the admin view shares the list and links to admin review pages, with a status filter', async () => {
    handler = (url) => ({
      status: 200,
      body: { items: [makeReview({ authority: { basis: 'administrator' } })], incomplete: false, state: url.searchParams.get('state') },
    });
    const history = await renderAt('/admin/approvals');
    expect(await screen.findByText('Order approvals')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Test Item|tests.item.prod/ })).toHaveAttribute('href', '/admin/approvals/uid-1');

    fireEvent.click(screen.getByRole('button', { name: 'Decided' }));
    await waitFor(() => expect(history.location.search).toBe('?state=decided'));
    await waitFor(() =>
      expect(calls('GET').some(([u]) => new URL(String(u), 'http://localhost').searchParams.get('state') === 'decided')).toBe(true),
    );
  });
});
