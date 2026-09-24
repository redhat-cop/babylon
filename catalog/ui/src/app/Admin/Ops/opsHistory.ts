/** Session-persisted Admin Ops action history (browser localStorage). */

export const OPS_HISTORY_STORAGE_KEY = 'babylon.admin.ops.history.v1';
export const OPS_HISTORY_MAX = 50;

export type OpsHistoryAction =
  | 'lock'
  | 'unlock'
  | 'extend-stop'
  | 'extend-destroy'
  | 'disable-autostop'
  | 'scale'
  | 'redeploy'
  | 'soundcheck';

export type OpsHistoryStatus = 'success' | 'partial' | 'failed' | 'info';

export type OpsHistoryEntry = {
  id: string;
  ts: number;
  action: OpsHistoryAction;
  label: string;
  workshopCount: number;
  workshopNames: string[];
  ok: number;
  fail: number;
  skipped?: number;
  detail?: string;
  status: OpsHistoryStatus;
};

export function statusFromCounts(ok: number, fail: number): OpsHistoryStatus {
  if (fail === 0) return 'success';
  if (ok === 0) return 'failed';
  return 'partial';
}

export function summarizeWorkshopNames(names: string[], max = 3): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return '';
  if (clean.length <= max) return clean.join(', ');
  return `${clean.slice(0, max).join(', ')} +${clean.length - max} more`;
}

export function loadOpsHistory(raw?: string | null): OpsHistoryEntry[] {
  try {
    const text = raw ?? (typeof localStorage !== 'undefined' ? localStorage.getItem(OPS_HISTORY_STORAGE_KEY) : null);
    if (!text) return [];
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e === 'object' && typeof e.ts === 'number' && typeof e.action === 'string')
      .slice(0, OPS_HISTORY_MAX) as OpsHistoryEntry[];
  } catch {
    return [];
  }
}

export function saveOpsHistory(entries: OpsHistoryEntry[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(OPS_HISTORY_STORAGE_KEY, JSON.stringify(entries.slice(0, OPS_HISTORY_MAX)));
  } catch {
    /* quota / private mode */
  }
}

export function appendOpsHistory(
  prev: OpsHistoryEntry[],
  entry: Omit<OpsHistoryEntry, 'id' | 'ts' | 'status'> & { status?: OpsHistoryStatus; ts?: number; id?: string },
): OpsHistoryEntry[] {
  const ok = entry.ok ?? 0;
  const fail = entry.fail ?? 0;
  const full: OpsHistoryEntry = {
    id: entry.id || `ops-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: entry.ts ?? Date.now(),
    action: entry.action,
    label: entry.label,
    workshopCount: entry.workshopCount,
    workshopNames: entry.workshopNames.slice(0, 20),
    ok,
    fail,
    skipped: entry.skipped,
    detail: entry.detail,
    status: entry.status ?? statusFromCounts(ok, fail),
  };
  return [full, ...prev].slice(0, OPS_HISTORY_MAX);
}

export function formatOpsHistoryTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return String(ts);
  }
}

export function actionDisplayName(action: OpsHistoryAction): string {
  switch (action) {
    case 'lock':
      return 'Lock';
    case 'unlock':
      return 'Unlock';
    case 'extend-stop':
      return 'Extend Stop';
    case 'extend-destroy':
      return 'Extend Destroy';
    case 'disable-autostop':
      return 'Disable Auto-Stop';
    case 'scale':
      return 'Scale';
    case 'redeploy':
      return 'Redeploy Failed';
    case 'soundcheck':
      return 'Soundcheck';
    default:
      return action;
  }
}
