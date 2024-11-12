import React from 'react';
import { ResourceClaim } from '@app/types';
import { getPhaseState, getStatus, InnerStatus } from '@app/Services/ServiceStatus';
import { getAutoTimes, getMostRelevantResourceAndTemplate } from '@app/Services/service-utils';

import '@app/Services/service-status.css';

const codeLevels = [
  'provision-failed',
  'failed',
  'stopped',
  'stop-error',
  'in-progress',
  'provisioning',
  'stop-scheduled',
  'start-scheduled',
  'available',
  'requested',
  'running',
];
function cmp(a: { state: string }, b: { state: string }) {
  return codeLevels.indexOf(a.state.toLowerCase().replace(/ /g, '-')) >
    codeLevels.indexOf(b.state.toLowerCase().replace(/ /g, '-'))
    ? 1
    : -1;
}

const WorkshopStatus: React.FC<{
  resourceClaims: ResourceClaim[];
}> = ({ resourceClaims }) => {
  const resourceClaimsStatus: { uid: string; state: string }[] = [];
  for (let resourceClaim of resourceClaims) {
    const summary = resourceClaim.status?.summary;
    if (summary) {
      resourceClaimsStatus.push({ uid: resourceClaim.metadata.uid, state: summary.state });
    } else {
      const creationTime = Date.parse(resourceClaim.metadata.creationTimestamp);
      const resource = getMostRelevantResourceAndTemplate(resourceClaim).resource;
      const resourceTemplate = getMostRelevantResourceAndTemplate(resourceClaim).template;
      const currentState = resource?.kind === 'AnarchySubject' ? resource?.spec?.vars?.current_state : 'available';
      const desiredState = resourceTemplate?.spec?.vars?.desired_state;
      const { startTime, stopTime } = getAutoTimes(resourceClaim);
      const _startTime =
        resourceTemplate?.spec?.vars?.action_schedule?.start || resource?.spec?.vars?.action_schedule?.start
          ? startTime
          : null;
      const _stopTime =
        resourceTemplate?.spec?.vars?.action_schedule?.stop || resource?.spec?.vars?.action_schedule?.stop
          ? stopTime
          : null;

      if (typeof resource === 'undefined') {
        resourceClaimsStatus.push({ uid: resourceClaim.metadata.uid, state: 'requested' });
      } else {
        resourceClaimsStatus.push({
          uid: resourceClaim.metadata.uid,
          state: getStatus(currentState, desiredState, creationTime, _startTime, _stopTime).statusName,
        });
      }
    }
  }

  const statusCount = {};
  resourceClaimsStatus.sort(cmp).forEach((item) => {
    if (statusCount[item.state]) {
      statusCount[item.state]++;
    } else {
      statusCount[item.state] = 1;
    }
  });

  return (
    <>
      {Object.entries(statusCount).map(([status, count]: [string, unknown]) => {
        const { state, phase } = getPhaseState(status);
        return (
          <div key={state}>
            <span style={{ paddingRight: '12px' }}>{count as number} Instances</span>
            <InnerStatus phase={phase} state={state} />
          </div>
        );
      })}
    </>
  );
};

export default WorkshopStatus;
