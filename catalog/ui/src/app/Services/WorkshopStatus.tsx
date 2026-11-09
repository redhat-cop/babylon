import React from 'react';
import type { ResourceClaim } from '@app/types';
import StatusProgress from '@app/components/StatusProgress';
import { getResourceClaimStatus } from './ServiceStatus';
import ResourceClaimStatus from './ResourceClaimStatus';
import { getAggregateStatus } from './aggregate-status';
import type { AggregateStatus } from './aggregate-status';

export function getWorkshopAggregateStatus(resourceClaims: ResourceClaim[], expectedCount = 0): AggregateStatus {
  // expectedCount: provisions ordered by the workshop, including those whose ResourceClaims don't exist yet
  return getAggregateStatus(resourceClaims.map(getResourceClaimStatus), expectedCount);
}

const WorkshopStatus: React.FC<{
  resourceClaims: ResourceClaim[];
  expectedCount?: number;
}> = ({ resourceClaims, expectedCount = 0 }) => {
  if (resourceClaims.length === 1 && expectedCount <= 1) {
    return <ResourceClaimStatus resourceClaim={resourceClaims[0]} />;
  }
  const { phase, label, count, total, segments } = getWorkshopAggregateStatus(resourceClaims, expectedCount);
  return <StatusProgress phase={phase} label={label} count={count} total={total} segments={segments} />;
};

export default WorkshopStatus;
