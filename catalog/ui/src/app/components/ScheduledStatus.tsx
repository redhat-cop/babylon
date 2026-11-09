import React from 'react';
import StatusProgress from './StatusProgress';
import TimeInterval from './TimeInterval';

/**
 * Status for a service, workshop or lab whose start is scheduled in the future,
 * styled like the rest of the aggregated statuses.
 */
const ScheduledStatus: React.FC<{ startTime?: number | null; total?: number }> = ({ startTime, total = 1 }) => (
  <StatusProgress
    phase="scheduled"
    label="Scheduled"
    total={total}
    segments={[{ key: 'scheduled', label: 'scheduled', count: total, variant: 'pending', hideInLegend: true }]}
    caption={
      startTime && startTime > Date.now() ? (
        <span>
          Starts <TimeInterval toEpochMilliseconds={startTime} />
        </span>
      ) : null
    }
  />
);

export default ScheduledStatus;
