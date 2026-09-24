import {
  buildSoundcheckCheckUrl,
  buildSoundcheckSessionUrl,
  buildSoundcheckWorkshopUrl,
  DEFAULT_SOUNDCHECK_URL,
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
