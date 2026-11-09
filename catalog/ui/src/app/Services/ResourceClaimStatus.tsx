import React from 'react';
import type { ResourceClaim } from '@app/types';
import StatusProgress from '@app/components/StatusProgress';
import ServiceStatus, { getResourceClaimStatus } from './ServiceStatus';
import { getResourceClaimComponentStatuses } from './service-utils';
import { getAggregateStatus } from './aggregate-status';

/**
 * Status of a service. Multi-component services whose components are in different states
 * (e.g. cluster running while tenants are still provisioning) show the per-component progress,
 * aligned with the workshop and self-paced lab status in the services list.
 */
const ResourceClaimStatus: React.FC<{ resourceClaim: ResourceClaim }> = ({ resourceClaim }) => {
  const overall = getResourceClaimStatus(resourceClaim);
  const components = getResourceClaimComponentStatuses(resourceClaim);
  const expectedCount = resourceClaim.spec.resources?.length ?? 0;
  // Schedules apply to the whole service, keep the service level state for them
  const isScheduleState =
    overall.phase === 'scheduled' || overall.state === 'Waiting to Start' || overall.state === 'Waiting to Stop';
  if (Math.max(components.length, expectedCount) <= 1 || isScheduleState) {
    return <ServiceStatus resourceClaim={resourceClaim} />;
  }
  const { phase, label, count, total, segments } = getAggregateStatus(components, expectedCount);
  if (segments.length === 1) {
    return <ServiceStatus resourceClaim={resourceClaim} />;
  }
  return (
    <StatusProgress
      phase={phase}
      label={label}
      count={count}
      total={total}
      segments={segments}
      unit="components"
      errorMessage={overall.errorMessage}
    />
  );
};

export default ResourceClaimStatus;
