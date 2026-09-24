/** Showroom Soundcheck helpers for Babylon Admin Ops (batch kickoff + light status). */

export const DEFAULT_SOUNDCHECK_URL =
  'https://showroom-soundcheck-dev.apps.ocpv-infra01.dal12.infra.demo.redhat.com';

/** Terminal statuses — stop light polling once reached. */
export const SOUNDCHECK_TERMINAL = new Set(['completed', 'failed']);

export type SoundcheckSessionStatus = 'pending' | 'running' | 'completed' | 'failed' | string;

export type SoundcheckKickoffResult = {
  sessionId: string;
  sessionUrl: string;
  /** How the session was started */
  mode: 'api' | 'deeplink';
};

export type SoundcheckSessionSnapshot = {
  sessionId: string;
  status: SoundcheckSessionStatus;
  name?: string;
  completedAt?: string | null;
};

export type WorkshopCheckStatusEntry = {
  status: SoundcheckSessionStatus;
  session_id: string;
  created_at: string;
} | null;

export function normalizeSoundcheckBase(url: string | undefined | null): string {
  const raw = (url || DEFAULT_SOUNDCHECK_URL).trim().replace(/\/+$/, '');
  return raw || DEFAULT_SOUNDCHECK_URL;
}

export function soundcheckApiRoot(baseUrl: string | undefined | null): string {
  return `${normalizeSoundcheckBase(baseUrl)}/api`;
}

export function buildSoundcheckSessionUrl(
  baseUrl: string | undefined | null,
  sessionId: string,
): string {
  return `${normalizeSoundcheckBase(baseUrl)}/session/${encodeURIComponent(sessionId)}`;
}

/**
 * Soundcheck accepts workshop GUIDs via ?workshop=id1,id2 (frontend deep-link).
 * Prefer babylon.gpte.redhat.com/workshop-id label; fall back to metadata.name.
 */
export function buildSoundcheckCheckUrl(
  baseUrl: string | undefined | null,
  workshopIds: string[],
  opts?: { name?: string; cluster?: string },
): string {
  const ids = normalizeWorkshopIds(workshopIds);
  if (ids.length === 0) {
    throw new Error('At least one workshop id is required');
  }
  const base = normalizeSoundcheckBase(baseUrl);
  const params = new URLSearchParams();
  params.set('workshop', ids.join(','));
  if (opts?.name?.trim()) params.set('name', opts.name.trim());
  if (opts?.cluster?.trim()) params.set('cluster', opts.cluster.trim());
  return `${base}/check?${params.toString()}`;
}

export function normalizeWorkshopIds(workshopIds: string[]): string[] {
  return [...new Set(workshopIds.map((id) => id.trim()).filter(Boolean))];
}

/**
 * One batched kickoff: GET /api/check?workshop=id1,id2 creates a single session
 * and enqueues checks for all workshops. Prefer this over N parallel POSTs.
 *
 * Falls back to opening the frontend deep-link when CORS / network blocks the API
 * (catalog UI origin may not be on Soundcheck CORS_ORIGINS).
 */
export async function kickoffSoundcheck(
  baseUrl: string | undefined | null,
  workshopIds: string[],
  opts?: { name?: string; cluster?: string; signal?: AbortSignal; openWindow?: boolean },
): Promise<SoundcheckKickoffResult> {
  const ids = normalizeWorkshopIds(workshopIds);
  if (ids.length === 0) {
    throw new Error('At least one workshop id is required');
  }
  const openWindow = opts?.openWindow !== false;
  const params = new URLSearchParams();
  params.set('workshop', ids.join(','));
  if (opts?.name?.trim()) params.set('name', opts.name.trim());
  if (opts?.cluster?.trim()) params.set('cluster', opts.cluster.trim());

  try {
    const resp = await fetch(`${soundcheckApiRoot(baseUrl)}/check?${params.toString()}`, {
      method: 'GET',
      signal: opts?.signal,
      credentials: 'omit',
    });
    if (!resp.ok) {
      throw new Error(`Soundcheck API ${resp.status}`);
    }
    const body = (await resp.json()) as { session_id?: string };
    if (!body?.session_id) {
      throw new Error('Soundcheck API returned no session_id');
    }
    const sessionUrl = buildSoundcheckSessionUrl(baseUrl, body.session_id);
    if (openWindow) {
      window.open(sessionUrl, '_blank', 'noopener,noreferrer');
    }
    return { sessionId: body.session_id, sessionUrl, mode: 'api' };
  } catch (err) {
    // CORS, offline, or API unavailable — deep-link still creates one batch session
    // in the Soundcheck UI (same workshop= comma list; no N parallel checks).
    const deepUrl = buildSoundcheckCheckUrl(baseUrl, ids, {
      name: opts?.name,
      cluster: opts?.cluster,
    });
    if (openWindow) {
      window.open(deepUrl, '_blank', 'noopener,noreferrer');
    }
    // Synthetic id so callers can still record history; status poll will no-op
    return {
      sessionId: '',
      sessionUrl: deepUrl,
      mode: 'deeplink',
    };
  }
}

/** Single GET /api/sessions/{id} — use for light status after a kickoff. */
export async function fetchSoundcheckSession(
  baseUrl: string | undefined | null,
  sessionId: string,
  opts?: { signal?: AbortSignal },
): Promise<SoundcheckSessionSnapshot> {
  if (!sessionId) {
    throw new Error('sessionId is required');
  }
  const resp = await fetch(`${soundcheckApiRoot(baseUrl)}/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'GET',
    signal: opts?.signal,
    credentials: 'omit',
  });
  if (!resp.ok) {
    throw new Error(`Soundcheck session ${resp.status}`);
  }
  const body = (await resp.json()) as {
    session?: { session_id?: string; status?: string; name?: string; completed_at?: string | null };
  };
  const session = body.session;
  if (!session?.session_id) {
    throw new Error('Invalid session response');
  }
  return {
    sessionId: session.session_id,
    status: (session.status || 'pending') as SoundcheckSessionStatus,
    name: session.name,
    completedAt: session.completed_at,
  };
}

/**
 * Light poll of ONE shared session (not N workshops). Stops on terminal status,
 * abort, or maxAttempts. Default: ~6 attempts / 2.5s ≈ 15s of status updates.
 */
export async function pollSoundcheckSession(
  baseUrl: string | undefined | null,
  sessionId: string,
  opts?: {
    intervalMs?: number;
    maxAttempts?: number;
    signal?: AbortSignal;
    onUpdate?: (snap: SoundcheckSessionSnapshot) => void;
  },
): Promise<SoundcheckSessionSnapshot | null> {
  if (!sessionId) return null;
  const intervalMs = opts?.intervalMs ?? 2500;
  const maxAttempts = opts?.maxAttempts ?? 6;
  let last: SoundcheckSessionSnapshot | null = null;

  for (let i = 0; i < maxAttempts; i++) {
    if (opts?.signal?.aborted) break;
    try {
      last = await fetchSoundcheckSession(baseUrl, sessionId, { signal: opts?.signal });
      opts?.onUpdate?.(last);
      if (SOUNDCHECK_TERMINAL.has(last.status)) return last;
    } catch {
      // transient — keep trying until maxAttempts
    }
    if (i < maxAttempts - 1) {
      await sleep(intervalMs, opts?.signal);
    }
  }
  return last;
}

/**
 * Optional on-demand lookup of last check per workshop (DB only, no new checks).
 * Prefer calling only after an Actions run or row expand — not on every table refresh.
 * TTL caching is left to the caller.
 */
export async function fetchWorkshopCheckStatuses(
  baseUrl: string | undefined | null,
  workshopIds: string[],
  opts?: { signal?: AbortSignal },
): Promise<Record<string, WorkshopCheckStatusEntry>> {
  const ids = normalizeWorkshopIds(workshopIds);
  if (ids.length === 0) return {};
  const resp = await fetch(`${soundcheckApiRoot(baseUrl)}/workshops/check-status`, {
    method: 'POST',
    signal: opts?.signal,
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workshop_ids: ids }),
  });
  if (!resp.ok) {
    throw new Error(`Soundcheck check-status ${resp.status}`);
  }
  const body = (await resp.json()) as { statuses?: Record<string, WorkshopCheckStatusEntry> };
  return body.statuses || {};
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}
