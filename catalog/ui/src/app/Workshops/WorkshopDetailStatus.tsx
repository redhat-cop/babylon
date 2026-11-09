import React from 'react';
import type { ResourceClaim } from '@app/types';
import ScheduledStatus from '@app/components/ScheduledStatus';
import WorkshopStatus from '@app/Services/WorkshopStatus';

import './workshop-detail-status.css';

const WorkshopDetailStatus: React.FC<{
  resourceClaims: ResourceClaim[];
  clusterResourceClaims?: ResourceClaim[];
  expectedCount?: number;
  autoStartTime?: number | null;
}> = ({ resourceClaims, clusterResourceClaims = [], expectedCount = 0, autoStartTime }) => {
  const isScheduled = autoStartTime && autoStartTime > Date.now();
  // Before the scheduled start, ordered instances are covered by the scheduled status
  const showInstances = resourceClaims.length > 0 || (!isScheduled && expectedCount > 0);
  if (!isScheduled && !showInstances && clusterResourceClaims.length === 0) {
    return <p>...</p>;
  }
  // Only label the groups when the workshop has both instances and clusters
  const showTitles = clusterResourceClaims.length > 0;
  return (
    <div className="workshop-detail-status">
      {isScheduled ? <ScheduledStatus startTime={autoStartTime} total={Math.max(expectedCount, 1)} /> : null}
      {showInstances ? (
        <div className="workshop-detail-status__group">
          {showTitles ? <span className="workshop-detail-status__title">Instances</span> : null}
          <WorkshopStatus resourceClaims={resourceClaims} expectedCount={expectedCount} />
        </div>
      ) : null}
      {clusterResourceClaims.length > 0 ? (
        <div className="workshop-detail-status__group">
          <span className="workshop-detail-status__title">Clusters</span>
          <WorkshopStatus resourceClaims={clusterResourceClaims} />
        </div>
      ) : null}
    </div>
  );
};

export default WorkshopDetailStatus;
