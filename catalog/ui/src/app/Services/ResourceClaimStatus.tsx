import React from 'react';
import type { ResourceClaim } from '@app/types';
import StatusProgress from '@app/components/StatusProgress';
import ScheduledStatus from '@app/components/ScheduledStatus';
import { getResourceClaimStatus } from './ServiceStatus';
import { VARIANT_BY_PHASE } from './aggregate-status';

/**
 * Status of a service (ResourceClaim) as a single entity, in the same visual style as
 * the workshop and self-paced lab statuses of the services list.
 */
const ResourceClaimStatus: React.FC<{ resourceClaim: ResourceClaim }> = ({ resourceClaim }) => {
  const { phase, state, errorMessage } = getResourceClaimStatus(resourceClaim);
  if (phase === 'scheduled') {
    return <ScheduledStatus startTime={Date.parse(resourceClaim.spec.lifespan?.start)} />;
  }
  return (
    <StatusProgress
      phase={phase}
      label={state}
      total={1}
      segments={[{ key: 'status', label: state.toLowerCase(), count: 1, variant: VARIANT_BY_PHASE[phase] ?? 'info', hideInLegend: true }]}
      errorMessage={errorMessage}
    />
  );
};

export default ResourceClaimStatus;
