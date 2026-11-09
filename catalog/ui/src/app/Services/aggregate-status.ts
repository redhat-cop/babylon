import type { StatusProgressPhase, StatusSegment, StatusSegmentVariant } from '@app/components/StatusProgress';
import type { phaseProps } from './ServiceStatus';

export const VARIANT_BY_PHASE: Record<phaseProps, StatusSegmentVariant> = {
  running: 'success',
  available: 'info',
  'in-progress': 'info',
  waiting: 'info',
  queued: 'queued',
  scheduled: 'info',
  unknown: 'info',
  stopped: 'neutral',
  failed: 'danger',
};
const VARIANT_ORDER: StatusSegmentVariant[] = ['success', 'info', 'queued', 'pending', 'neutral', 'danger'];

export interface AggregateStatus {
  phase: StatusProgressPhase;
  label: string;
  count: number;
  total: number;
  segments: StatusSegment[];
}

/**
 * Combine the statuses of several instances (workshop seats, service components) into one headline.
 * `expectedCount` accounts for instances that are expected but don't exist yet (shown as pending).
 */
export function getAggregateStatus(statuses: { phase: phaseProps; state: string }[], expectedCount = 0): AggregateStatus {
  const groups = new Map<string, StatusSegment & { phase: phaseProps }>();
  for (const { phase, state } of statuses) {
    const label = phase === 'running' ? 'running' : state.toLowerCase();
    const group = groups.get(label);
    if (group) {
      group.count++;
    } else {
      groups.set(label, { key: label, label, count: 1, variant: VARIANT_BY_PHASE[phase] ?? 'info', phase });
    }
  }
  const notCreated = Math.max(expectedCount - statuses.length, 0);
  if (notCreated > 0) {
    groups.set('pending', { key: 'pending', label: 'pending', count: notCreated, variant: 'pending', phase: 'waiting' });
  }

  const segments = [...groups.values()].sort(
    (a, b) => VARIANT_ORDER.indexOf(a.variant) - VARIANT_ORDER.indexOf(b.variant) || b.count - a.count,
  );
  const total = statuses.length + notCreated;
  const countOf = (variants: StatusSegmentVariant[]) =>
    segments.filter((s) => variants.includes(s.variant)).reduce((n, s) => n + s.count, 0);
  const running = countOf(['success']);
  const inProgress = countOf(['info', 'queued', 'pending']);
  const failed = countOf(['danger']);

  // The count is always "running out of total"; the headline names the state
  // Single state for every instance: reuse that state as headline
  if (segments.length === 1) {
    const [only] = segments;
    if (only.phase === 'running') {
      only.hideInLegend = true;
      return { phase: 'running', label: 'Running', count: total, total, segments };
    }
    return { phase: only.phase, label: only.label, count: 0, total, segments };
  }

  const runningSegment = segments.find((s) => s.variant === 'success');
  if (runningSegment) runningSegment.hideInLegend = true;

  let phase: StatusProgressPhase;
  if (inProgress > 0) phase = 'in-progress';
  else if (failed > 0) phase = 'degraded';
  else phase = running > 0 ? 'partial' : 'stopped';

  if (running > 0) {
    return { phase, label: 'Running', count: running, total, segments };
  }
  // Nothing running yet: headline with the most common state that is still progressing, else most common overall
  const lead =
    segments.filter((s) => ['info', 'queued', 'pending'].includes(s.variant)).sort((a, b) => b.count - a.count)[0] ??
    [...segments].sort((a, b) => b.count - a.count)[0];
  return { phase: phase === 'in-progress' ? lead.phase : phase, label: lead.label, count: 0, total, segments };
}
