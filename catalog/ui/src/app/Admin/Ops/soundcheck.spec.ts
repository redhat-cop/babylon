import {
  buildSoundcheckCheckUrl,
  buildSoundcheckSessionUrl,
  buildSoundcheckWorkshopUrl,
  cloneSoundcheckSession,
  connectSoundcheckSSE,
  DEFAULT_SOUNDCHECK_URL,
  fetchSoundcheckSession,
  idsNeedingStatusFetch,
  invalidateStatusCache,
  kickoffSoundcheck,
  mergeStatusCache,
  normalizeSoundcheckBase,
  normalizeWorkshopIds,
  soundcheckApiRoot,
  soundcheckStatusLabelColor,
  worstSoundcheckStatus,
} from './soundcheck';

describe('soundcheck helpers', () => {
  it('normalizes trailing slashes and empty input', () => {
    expect(normalizeSoundcheckBase('https://example.com/')).toBe('https://example.com');
    expect(normalizeSoundcheckBase('')).toBe(DEFAULT_SOUNDCHECK_URL);
    expect(normalizeSoundcheckBase(null)).toBe(DEFAULT_SOUNDCHECK_URL);
    expect(soundcheckApiRoot('https://example.com/')).toBe('https://example.com/api');
  });

  it('builds check URL with workshop ids and optional name', () => {
    const url = buildSoundcheckCheckUrl('https://soundcheck.example.com/', ['abc12', 'xyz99'], {
      name: 'Admin Ops — 2 workshops',
    });
    expect(url).toBe(
      'https://soundcheck.example.com/check?workshop=abc12%2Cxyz99&name=Admin+Ops+%E2%80%94+2+workshops',
    );
  });

  it('builds session URL and dedupes ids', () => {
    expect(buildSoundcheckSessionUrl('https://sc.example.com/', 'sess-1')).toBe(
      'https://sc.example.com/session/sess-1',
    );
    expect(buildSoundcheckWorkshopUrl('https://sc.example.com/', 'ws-guid-1')).toBe(
      'https://sc.example.com/session/workshop/ws-guid-1',
    );
    expect(() => buildSoundcheckWorkshopUrl('https://sc.example.com/', '  ')).toThrow(/workshop id/i);
    expect(normalizeWorkshopIds(['a', 'a', ' b '])).toEqual(['a', 'b']);
    expect(() => buildSoundcheckCheckUrl(DEFAULT_SOUNDCHECK_URL, [])).toThrow(/workshop id/i);
  });

  it('kickoff prefers API session then falls back to deep-link', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ session_id: 'abc-session' }),
    });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);

    const api = await kickoffSoundcheck('https://sc.example.com', ['w1', 'w2'], {
      name: 'Admin Ops',
      openWindow: true,
    });
    expect(api.mode).toBe('api');
    expect(api.sessionId).toBe('abc-session');
    expect(api.sessionUrl).toContain('/session/abc-session');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/check?workshop=w1%2Cw2');
    expect(openSpy).toHaveBeenCalledWith(api.sessionUrl, '_blank', 'noopener,noreferrer');

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const deep = await kickoffSoundcheck('https://sc.example.com', ['w1'], { openWindow: true });
    expect(deep.mode).toBe('deeplink');
    expect(deep.sessionUrl).toContain('/check?workshop=w1');
    expect(openSpy).toHaveBeenCalledWith(deep.sessionUrl, '_blank', 'noopener,noreferrer');

    openSpy.mockRestore();
  });

  it('TTL cache only re-fetches stale or missing ids', () => {
    const now = 1_000_000;
    const cache = mergeStatusCache(
      {},
      { a: { status: 'completed', session_id: 's1', created_at: 't' }, b: null },
      now,
    );
    expect(idsNeedingStatusFetch(['a', 'b', 'c'], cache, { now, ttlMs: 60_000 })).toEqual(['c']);
    expect(idsNeedingStatusFetch(['a', 'b'], cache, { now: now + 61_000, ttlMs: 60_000 })).toEqual([
      'a',
      'b',
    ]);
    expect(invalidateStatusCache(cache, ['a']).a).toBeUndefined();
  });

  it('fetchSoundcheckSession parses targets and extracts failed ones', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        session: { session_id: 'sess-abc', status: 'completed', name: 'test', completed_at: '2026-10-08T10:00:00Z' },
        targets: [
          { label: 'lab-ok', url: 'https://lab1.example.com', status: 'healthy', error_message: null },
          { label: 'lab-fail', url: 'https://lab2.example.com', status: 'unhealthy', error_message: 'tab error' },
          { label: 'lab-err', url: 'https://lab3.example.com', status: 'error', error_message: 'timeout' },
        ],
      }),
    });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const snap = await fetchSoundcheckSession('https://sc.example.com', 'sess-abc');
    expect(snap.sessionId).toBe('sess-abc');
    expect(snap.status).toBe('completed');
    expect(snap.totalTargets).toBe(3);
    expect(snap.failedTargets).toHaveLength(2);
    expect(snap.failedTargets?.[0].label).toBe('lab-fail');
    expect(snap.failedTargets?.[0].errorMessage).toBe('tab error');
    expect(snap.failedTargets?.[1].label).toBe('lab-err');
    expect(snap.failedTargets?.[0].sessionHref).toContain('/session/sess-abc');
  });

  it('fetchSoundcheckSession handles missing targets gracefully', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        session: { session_id: 'sess-xy', status: 'running' },
      }),
    });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const snap = await fetchSoundcheckSession('https://sc.example.com', 'sess-xy');
    expect(snap.totalTargets).toBeUndefined();
    expect(snap.failedTargets).toBeUndefined();
  });

  it('cloneSoundcheckSession calls POST /clone and returns new session_id', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ session_id: 'cloned-sess' }),
    });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const newId = await cloneSoundcheckSession('https://sc.example.com', 'orig-sess');
    expect(newId).toBe('cloned-sess');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/sessions/orig-sess/clone');
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
  });

  it('cloneSoundcheckSession throws on non-ok response', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
    await expect(cloneSoundcheckSession('https://sc.example.com', 'x')).rejects.toThrow('404');
  });

  it('connectSoundcheckSSE fires onComplete with parsed snapshot on session_complete event', () => {
    const events: Record<string, EventListener> = {};
    const mockES = {
      addEventListener: (type: string, cb: EventListener) => { events[type] = cb; },
      close: jest.fn(),
      onerror: null as ((e: Event) => void) | null,
    };
    (global as unknown as { EventSource: unknown }).EventSource = jest.fn(() => mockES);

    const onUpdate = jest.fn();
    const onComplete = jest.fn();
    connectSoundcheckSSE('https://sc.example.com', 'sess-sse', { onUpdate, onComplete });

    const payload = {
      session_id: 'sess-sse',
      status: 'completed',
      targets: [
        { label: 'lab-ok', url: 'https://lab1.example.com', status: 'healthy', error_message: null },
        { label: 'lab-fail', url: 'https://lab2.example.com', status: 'unhealthy', error_message: 'oops' },
      ],
      session: { completed_at: '2026-11-11T10:00:00Z', name: 'test' },
    };
    events['session_complete']?.({ data: JSON.stringify(payload) } as unknown as Event);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onUpdate).not.toHaveBeenCalled();
    const snap = onComplete.mock.calls[0][0];
    expect(snap.sessionId).toBe('sess-sse');
    expect(snap.status).toBe('completed');
    expect(snap.totalTargets).toBe(2);
    expect(snap.failedTargets).toHaveLength(1);
    expect(snap.failedTargets[0].label).toBe('lab-fail');
    expect(snap.failedTargets[0].errorMessage).toBe('oops');
    expect(mockES.close).toHaveBeenCalled();
  });

  it('connectSoundcheckSSE fires onUpdate (not onComplete) on session_update event', () => {
    const events: Record<string, EventListener> = {};
    const mockES = {
      addEventListener: (type: string, cb: EventListener) => { events[type] = cb; },
      close: jest.fn(),
      onerror: null as ((e: Event) => void) | null,
    };
    (global as unknown as { EventSource: unknown }).EventSource = jest.fn(() => mockES);

    const onUpdate = jest.fn();
    const onComplete = jest.fn();
    connectSoundcheckSSE('https://sc.example.com', 'sess-upd', { onUpdate, onComplete });

    events['session_update']?.({ data: JSON.stringify({ session_id: 'sess-upd', status: 'running', targets: [] }) } as unknown as Event);

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
    expect(mockES.close).not.toHaveBeenCalled();
  });

  it('connectSoundcheckSSE closes on abort signal', () => {
    const mockES = {
      addEventListener: jest.fn(),
      close: jest.fn(),
      onerror: null,
    };
    (global as unknown as { EventSource: unknown }).EventSource = jest.fn(() => mockES);

    const ac = new AbortController();
    connectSoundcheckSSE('https://sc.example.com', 'sess-abort', { signal: ac.signal });
    ac.abort();
    expect(mockES.close).toHaveBeenCalled();
  });

  it('connectSoundcheckSSE returns no-op for empty sessionId', () => {
    const cleanup = connectSoundcheckSSE('https://sc.example.com', '', {});
    expect(typeof cleanup).toBe('function');
    expect(() => cleanup()).not.toThrow();
  });

  it('picks worst status for group headers', () => {
    expect(
      worstSoundcheckStatus([
        { status: 'completed', session_id: '1', created_at: 't' },
        { status: 'failed', session_id: '2', created_at: 't' },
        null,
      ])?.status,
    ).toBe('failed');
    expect(soundcheckStatusLabelColor('completed')).toBe('green');
    expect(soundcheckStatusLabelColor(undefined)).toBe('grey');
  });
});
