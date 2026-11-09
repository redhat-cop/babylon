import React from 'react';
import type { ResourceClaim } from '@app/types';
import StatusProgress from '@app/components/StatusProgress';
import type { StatusProgressPhase, StatusSegment, StatusSegmentVariant } from '@app/components/StatusProgress';
import ServiceStatus, { getResourceClaimStatus } from './ServiceStatus';
import type { phaseProps } from './ServiceStatus';

const VARIANT_BY_PHASE: Record<phaseProps, StatusSegmentVariant> = {
  running: 'success',
  available: 'info',
  'in-progress': 'info',
  waiting: 'info',
  queued: 'info',
  scheduled: 'info',
  unknown: 'info',
  stopped: 'neutral',
  failed: 'danger',
};
const VARIANT_ORDER: StatusSegmentVariant[] = ['success', 'info', 'pending', 'neutral', 'danger'];

export function getWorkshopAggregateStatus(
  resourceClaims: ResourceClaim[],
  expectedCount = 0,
): { phase: StatusProgressPhase; label: string; count: number; total: number; segments: StatusSegment[] } {
  const groups = new Map<string, StatusSegment & { phase: phaseProps }>();
  for (const resourceClaim of resourceClaims) {
    const { phase, state } = getResourceClaimStatus(resourceClaim);
    const label = phase === 'running' ? 'running' : state.toLowerCase();
    const group = groups.get(label);
    if (group) {
      group.count++;
    } else {
      groups.set(label, { key: label, label, count: 1, variant: VARIANT_BY_PHASE[phase] ?? 'info', phase });
    }
  }
  // Provisions ordered by the workshop whose ResourceClaims don't exist yet
  const notCreated = Math.max(expectedCount - resourceClaims.length, 0);
  if (notCreated > 0) {
    groups.set('pending', { key: 'pending', label: 'pending', count: notCreated, variant: 'pending', phase: 'waiting' });
  }

  const segments = [...groups.values()].sort(
    (a, b) => VARIANT_ORDER.indexOf(a.variant) - VARIANT_ORDER.indexOf(b.variant) || b.count - a.count,
  );
  const total = resourceClaims.length + notCreated;
  const countOf = (variants: StatusSegmentVariant[]) =>
    segments.filter((s) => variants.includes(s.variant)).reduce((n, s) => n + s.count, 0);
  const running = countOf(['success']);
  const inProgress = countOf(['info', 'pending']);
  const failed = countOf(['danger']);

  // Single state for every instance: reuse that state as headline
  if (segments.length === 1) {
    const [only] = segments;
    return { phase: only.phase, label: only.phase === 'running' ? 'Running' : only.label, count: total, total, segments };
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
    segments.filter((s) => s.variant === 'info' || s.variant === 'pending').sort((a, b) => b.count - a.count)[0] ??
    [...segments].sort((a, b) => b.count - a.count)[0];
  lead.hideInLegend = true;
  return { phase, label: lead.label, count: lead.count, total, segments };
}

const WorkshopStatus: React.FC<{
  resourceClaims: ResourceClaim[];
  expectedCount?: number;
}> = ({ resourceClaims, expectedCount = 0 }) => {
  if (resourceClaims.length === 1 && expectedCount <= 1) {
    return <ServiceStatus resourceClaim={resourceClaims[0]} />;
  }
  const { phase, label, count, total, segments } = getWorkshopAggregateStatus(resourceClaims, expectedCount);
  return <StatusProgress phase={phase} label={label} count={count} total={total} segments={segments} />;
};

export default WorkshopStatus;
