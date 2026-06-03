import React, { useMemo } from 'react';
import CheckCircleIcon from '@patternfly/react-icons/dist/js/icons/check-circle-icon';
import HourglassHalfIcon from '@patternfly/react-icons/dist/js/icons/hourglass-half-icon';
import UserIcon from '@patternfly/react-icons/dist/js/icons/user-icon';
import { ResourceClaim } from '@app/types';
import { BABYLON_DOMAIN } from '@app/util';

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--pf-t--global--spacer--xs)' }}>
      <span style={{ color: 'var(--pf-t--global--border--color--status--success--default)' }}>
        <CheckCircleIcon /> {status.ready} ready
      </span>
      <span style={{ color: 'var(--pf-t--global--border--color--status--success--default)' }}>
        <UserIcon /> {status.assigned} assigned
      </span>
      <span style={{ color: 'var(--pf-t--global--icon--color--status--info--default)' }}>
        <HourglassHalfIcon /> {status.provisioning} provisioning
      </span>
    </div>
  );
};

export default SelfPacedLabStatus;
