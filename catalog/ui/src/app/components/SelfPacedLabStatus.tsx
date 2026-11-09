import React, { useMemo } from 'react';
import type { ResourceClaim } from '@app/types';
import { BABYLON_DOMAIN } from '@app/util';
import { InnerStatus } from '@app/Services/ServiceStatus';
import StatusProgress from './StatusProgress';

const SelfPacedLabStatus: React.FC<{
  resourceClaims?: ResourceClaim[];
  poolCount?: { ready?: number; assigned?: number; provisioning?: number };
  assignmentLabel?: string;
}> = ({ resourceClaims, poolCount, assignmentLabel = `${BABYLON_DOMAIN}/assigned` }) => {
  const status = useMemo(() => {
    if (poolCount) {
      return {
        ready: poolCount.ready ?? 0,
        assigned: poolCount.assigned ?? 0,
        provisioning: poolCount.provisioning ?? 0,
      };
    }
    if (!resourceClaims) return { ready: 0, assigned: 0, provisioning: 0 };
    let ready = 0;
    let assigned = 0;
    let provisioning = 0;
    for (const rc of resourceClaims) {
      if (rc.metadata.labels?.[assignmentLabel]) {
        assigned++;
      } else if (rc.status?.summary?.state === 'started' || rc.status?.summary?.state === 'stopped') {
        ready++;
      } else {
        provisioning++;
      }
    }
    return { ready, assigned, provisioning };
  }, [resourceClaims, poolCount, assignmentLabel]);

  const total = status.ready + status.assigned + status.provisioning;
  if (total === 0) {
    return <InnerStatus phase="in-progress" state="Initializing" />;
  }
  return (
    <StatusProgress
      phase={status.provisioning > 0 ? 'in-progress' : 'running'}
      label="Running"
      count={status.ready + status.assigned}
      total={total}
      segments={[
        { key: 'assigned', label: 'assigned', count: status.assigned, variant: 'success' },
        { key: 'ready', label: 'ready', count: status.ready, variant: 'success-subtle' },
        { key: 'provisioning', label: 'provisioning', count: status.provisioning, variant: 'queued' },
      ]}
    />
  );
};

export default SelfPacedLabStatus;
