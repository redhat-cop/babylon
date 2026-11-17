import { apiFetch, apiPaths } from '@app/api';
import { orderResourceLinks } from './order-utils';
import type {
  ApprovalReview,
  CatalogItemOrder,
  CatalogItemOrderSubmission,
} from './types';

/** Error from the order or approval API: `{"error": "<code>", "message": "..."}`. */
export class OrderApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'OrderApiError';
    this.status = status;
    this.code = code;
  }

  /** The request may not have reached the server, or the server was briefly unavailable. */
  get isTransient(): boolean {
    return this.status === 0 || this.status === 502 || this.status === 504 || this.code === 'order_backend_unavailable';
  }
}

const DEFAULT_MESSAGES: Record<number, string> = {
  0: 'The catalog could not be reached. Check your connection and try again.',
  400: 'The request was not valid.',
  401: 'Your session has expired. Reload the page to sign in again.',
  403: 'You are not allowed to perform this action.',
  404: 'Not found.',
  409: 'The request conflicts with the current state. Reload and try again.',
  503: 'The service is temporarily unavailable. Try again later.',
};

/** Normalize anything thrown by apiFetch (a Response, or a network TypeError). */
export async function toOrderApiError(error: unknown): Promise<OrderApiError> {
  if (error instanceof OrderApiError) return error;
  if (typeof Response !== 'undefined' && error instanceof Response) {
    let code = `http_${error.status}`;
    let message = DEFAULT_MESSAGES[error.status] || `Request failed with HTTP ${error.status}.`;
    try {
      const body = await error.clone().json();
      if (body && typeof body === 'object') {
        if (typeof body.error === 'string' && body.error) code = body.error;
        if (typeof body.message === 'string' && body.message) message = body.message;
      }
    } catch {
      // Not a JSON error body; keep the defaults.
    }
    return new OrderApiError(error.status, code, message);
  }
  return new OrderApiError(0, 'network_error', DEFAULT_MESSAGES[0]);
}

async function requestJson<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  try {
    const response = await apiFetch(path, {
      method: init?.method || 'GET',
      headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    return (await response.json()) as T;
  } catch (error) {
    throw await toOrderApiError(error);
  }
}

/** SWR fetcher for order and approval endpoints that throws OrderApiError. */
export function orderFetcher<T>(path: string): Promise<T> {
  return requestJson<T>(path);
}

function randomHex(bytes: number): string {
  const values = new Uint8Array(bytes);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(values);
  } else {
    for (let i = 0; i < bytes; i++) values[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
}

/** A new idempotency key (the API accepts 8-128 of [A-Za-z0-9._:-]). */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `order-${randomHex(16)}`;
}

/**
 * One idempotency key per logical request: the same request body reuses its key
 * (repeated clicks, retries after an ambiguous failure), and a changed body gets
 * a new key, because the API rejects a reused key with a different body.
 */
export class IdempotencyKeys {
  private fingerprint: string | null = null;
  private key: string | null = null;

  keyFor(body: Omit<CatalogItemOrderSubmission, 'idempotencyKey'>): string {
    const fingerprint = JSON.stringify(body);
    if (fingerprint !== this.fingerprint || !this.key) {
      this.fingerprint = fingerprint;
      this.key = newIdempotencyKey();
    }
    return this.key;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Submit an order. Transport failures are retried with the same idempotency key,
 * so a request that reached the server before the connection failed is replayed
 * (HTTP 200) instead of creating a second order.
 */
export async function submitCatalogItemOrder(
  submission: CatalogItemOrderSubmission,
  { retries = 2, retryDelayMs = 1000 }: { retries?: number; retryDelayMs?: number } = {},
): Promise<CatalogItemOrder> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await requestJson<CatalogItemOrder>(apiPaths.CATALOG_ITEM_ORDERS(), {
        method: 'POST',
        body: submission,
      });
    } catch (error) {
      const orderError = await toOrderApiError(error);
      if (!orderError.isTransient || attempt >= retries) throw orderError;
      await sleep(retryDelayMs * (attempt + 1));
    }
  }
}

export function cancelCatalogItemOrder(order: { namespace: string; name: string }): Promise<CatalogItemOrder> {
  return requestJson<CatalogItemOrder>(`${apiPaths.CATALOG_ITEM_ORDER(order)}/cancel`, { method: 'POST', body: {} });
}

/**
 * Record an approval decision. Never retried automatically: on a conflict the
 * caller reloads the request and the user decides again if it is still pending.
 */
export function decideCatalogItemOrder(
  uid: string,
  outcome: 'approve' | 'deny',
  comment?: string,
): Promise<ApprovalReview> {
  const trimmed = comment?.trim();
  return requestJson<ApprovalReview>(`${apiPaths.CATALOG_ITEM_ORDER_APPROVAL({ uid })}/${outcome}`, {
    method: 'POST',
    body: trimmed ? { comment: trimmed } : {},
  });
}

/**
 * Where to send the requester after submitting. Orders that need no approval
 * have no order page for the user: once the controller creates the service,
 * workshop or lab, go straight to it. Orders that need approval (or end up
 * blocked, denied, ...) open their order page. If the controller has not
 * decided within the wait, fall back to the order page, which keeps updating.
 */
export async function resolveOrderDestination(
  order: CatalogItemOrder,
  { timeoutMs = 20000, intervalMs = 1000 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<string> {
  const orderPage = `/orders/${encodeURIComponent(order.namespace)}/${encodeURIComponent(order.name)}`;
  const deadline = Date.now() + timeoutMs;
  let current = order;
  for (;;) {
    const destination = destinationFor(current, orderPage);
    if (destination) return destination;
    if (Date.now() >= deadline) return orderPage;
    await sleep(intervalMs);
    try {
      current = await orderFetcher<CatalogItemOrder>(apiPaths.CATALOG_ITEM_ORDER(order));
    } catch {
      // Keep waiting; the order page is the fallback.
    }
  }
}

function destinationFor(order: CatalogItemOrder, orderPage: string): string | null {
  const resource = orderResourceLinks(order)[0];
  if (order.approval?.state === 'NotRequired') {
    return resource ? resource.to : order.phase === 'Blocked' ? orderPage : null;
  }
  if (order.approval?.requestedAt || order.phase === 'PendingApproval' || order.phase === 'Blocked') return orderPage;
  if (['Denied', 'Expired', 'Cancelled', 'Fulfilled'].includes(order.phase)) return orderPage;
  return null;
}
