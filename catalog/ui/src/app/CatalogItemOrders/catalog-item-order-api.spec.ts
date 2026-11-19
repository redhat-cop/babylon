import fetchMock from 'jest-fetch-mock';
import {
  IdempotencyKeys,
  OrderApiError,
  decideCatalogItemOrder,
  submitCatalogItemOrder,
  toOrderApiError,
} from './catalog-item-order-api';
import type { CatalogItemOrderSubmission } from './types';

// Session promise read by apiFetch.
const testWindow = window as unknown as { sessionPromiseInstance?: Promise<{ token: string }> };

const BODY: Omit<CatalogItemOrderSubmission, 'idempotencyKey'> = {
  catalogItem: { namespace: 'babylon-catalog-test', name: 'tests.item.prod' },
  namespace: 'user-test-redhat-com',
  orderType: 'service',
  purpose: 'Training - Internal',
};

const ORDER = { id: 'user-test-redhat-com/order-abc', namespace: 'user-test-redhat-com', name: 'order-abc', phase: 'Submitted' };

function jsonResponse(status: number, body: unknown) {
  return { status, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } };
}

function requestBody(call: number) {
  return JSON.parse(fetchMock.mock.calls[call][1].body as string);
}

describe('catalog item order API', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
    testWindow.sessionPromiseInstance = Promise.resolve({ token: 'test-token' });
  });

  afterEach(() => {
    delete testWindow.sessionPromiseInstance;
  });

  describe('IdempotencyKeys', () => {
    test('reuses the key for the same logical request and changes it when the request changes', () => {
      const keys = new IdempotencyKeys();
      const first = keys.keyFor(BODY);
      expect(first).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
      expect(keys.keyFor({ ...BODY })).toBe(first);
      const changed = keys.keyFor({ ...BODY, purpose: 'Development' });
      expect(changed).not.toBe(first);
      expect(keys.keyFor({ ...BODY, purpose: 'Development' })).toBe(changed);
    });
  });

  describe('submitCatalogItemOrder', () => {
    test('posts the order as JSON with the session header and no identity fields', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(ORDER), { status: 202 });
      const order = await submitCatalogItemOrder({ ...BODY, idempotencyKey: 'key-00000001' });

      expect(order.name).toBe('order-abc');
      expect(fetchMock.mock.calls).toHaveLength(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/catalog-item-orders');
      expect(init.method).toBe('POST');
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(init.headers['Authentication']).toBe('Bearer test-token');
      const body = requestBody(0);
      expect(body.idempotencyKey).toBe('key-00000001');
      expect(body).not.toHaveProperty('requester');
    });

    test('retries transport failures with the same idempotency key, producing one logical order', async () => {
      fetchMock
        .mockRejectOnce(new TypeError('Failed to fetch'))
        .mockResponseOnce(JSON.stringify({ error: 'order_backend_unavailable', message: 'Unable to process order' }), {
          status: 503,
        })
        // The first request reached the server: the replay returns the same order with 200.
        .mockResponseOnce(JSON.stringify(ORDER), { status: 200 });

      const order = await submitCatalogItemOrder({ ...BODY, idempotencyKey: 'key-00000002' }, { retryDelayMs: 0 });

      expect(order.name).toBe('order-abc');
      expect(fetchMock.mock.calls).toHaveLength(3);
      expect(new Set([0, 1, 2].map((call) => requestBody(call).idempotencyKey))).toEqual(new Set(['key-00000002']));
    });

    test('does not retry validation or authorization errors and surfaces the backend message', async () => {
      fetchMock.mockResponseOnce(
        JSON.stringify({ error: 'namespace_forbidden', message: 'You cannot create orders in user-other' }),
        { status: 403 },
      );
      await expect(submitCatalogItemOrder({ ...BODY, idempotencyKey: 'key-00000003' }, { retryDelayMs: 0 })).rejects.toMatchObject({
        status: 403,
        code: 'namespace_forbidden',
        message: 'You cannot create orders in user-other',
      });
      expect(fetchMock.mock.calls).toHaveLength(1);
    });

    test('gives up after the retry budget and reports a transient error', async () => {
      fetchMock.mockReject(new TypeError('Failed to fetch'));
      const error = await submitCatalogItemOrder({ ...BODY, idempotencyKey: 'key-00000004' }, { retries: 2, retryDelayMs: 0 }).catch(
        (e) => e,
      );
      expect(error).toBeInstanceOf(OrderApiError);
      expect(error.isTransient).toBe(true);
      expect(fetchMock.mock.calls).toHaveLength(3);
    });
  });

  describe('decideCatalogItemOrder', () => {
    test('sends an explicit decision once and never replays it after a conflict', async () => {
      fetchMock.mockResponseOnce(
        JSON.stringify({ error: 'already_decided', message: 'A decision has already been recorded for this order' }),
        { status: 409 },
      );
      await expect(decideCatalogItemOrder('uid-1', 'approve', '  looks good  ')).rejects.toMatchObject({
        status: 409,
        code: 'already_decided',
      });
      expect(fetchMock.mock.calls).toHaveLength(1);
      expect(fetchMock.mock.calls[0][0]).toBe('/api/catalog-item-order-approvals/uid-1/approve');
      expect(requestBody(0)).toEqual({ comment: 'looks good' });
    });

    test('sends an empty JSON body without a comment', async () => {
      fetchMock.mockResponseOnce(JSON.stringify({ uid: 'uid-1' }), { status: 200 });
      await decideCatalogItemOrder('uid-1', 'deny');
      expect(fetchMock.mock.calls[0][0]).toBe('/api/catalog-item-order-approvals/uid-1/deny');
      expect(requestBody(0)).toEqual({});
    });
  });

  describe('toOrderApiError', () => {
    test('keeps specific 403 codes instead of treating every 403 as a disabled account', async () => {
      const error = await toOrderApiError(
        new Response(JSON.stringify({ error: 'self_decision', message: 'Requesters cannot review their own orders' }), jsonResponse(403, {})),
      );
      expect(error.code).toBe('self_decision');
      expect(error.message).toBe('Requesters cannot review their own orders');
    });

    test('falls back to a generic message for non-JSON errors', async () => {
      const error = await toOrderApiError(new Response('Bad gateway', { status: 502 }));
      expect(error.code).toBe('http_502');
      expect(error.isTransient).toBe(true);
    });
  });
});
