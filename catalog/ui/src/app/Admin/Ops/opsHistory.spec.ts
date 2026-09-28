import {
  actionDisplayName,
  appendOpsHistory,
  formatOpsHistoryTime,
  loadOpsHistory,
  OPS_HISTORY_MAX,
  saveOpsHistory,
  statusFromCounts,
  summarizeWorkshopNames,
  type OpsHistoryEntry,
} from './opsHistory';

describe('opsHistory helpers', () => {
  const sample = (over: Partial<OpsHistoryEntry> = {}): OpsHistoryEntry => ({
    id: 'x1',
    ts: 1_700_000_000_000,
    action: 'lock',
    label: 'Lock',
    workshopCount: 2,
    workshopNames: ['a', 'b'],
    ok: 2,
    fail: 0,
    status: 'success',
    ...over,
  });

  it('derives status from ok/fail counts', () => {
    expect(statusFromCounts(3, 0)).toBe('success');
    expect(statusFromCounts(0, 2)).toBe('failed');
    expect(statusFromCounts(1, 1)).toBe('partial');
  });

  it('summarizes workshop names with overflow', () => {
    expect(summarizeWorkshopNames(['a', 'b'])).toBe('a, b');
    expect(summarizeWorkshopNames(['a', 'b', 'c', 'd'], 2)).toBe('a, b +2 more');
  });

  it('loads empty / invalid history safely', () => {
    expect(loadOpsHistory(null)).toEqual([]);
    expect(loadOpsHistory('not-json')).toEqual([]);
    expect(loadOpsHistory('{}')).toEqual([]);
  });

  it('loads valid entries and appends newest first capped', () => {
    const loaded = loadOpsHistory(JSON.stringify([sample({ id: 'old' })]));
    expect(loaded).toHaveLength(1);
    let cur = loaded;
    for (let i = 0; i < OPS_HISTORY_MAX + 5; i++) {
      cur = appendOpsHistory(cur, {
        action: 'extend-stop',
        label: 'Extend Stop',
        workshopCount: 1,
        workshopNames: [`ws-${i}`],
        ok: 1,
        fail: 0,
      });
    }
    expect(cur).toHaveLength(OPS_HISTORY_MAX);
    expect(cur[0].workshopNames[0]).toBe(`ws-${OPS_HISTORY_MAX + 4}`);
    expect(actionDisplayName('soundcheck')).toBe('Soundcheck');
    expect(formatOpsHistoryTime(1_700_000_000_000)).toMatch(/\d/);
  });

  it('persists via saveOpsHistory when localStorage is available', () => {
    const store: Record<string, string> = {};
    const ls = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    };
    Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true });
    const entries = [sample()];
    saveOpsHistory(entries);
    expect(loadOpsHistory()).toEqual(entries);
  });
});
