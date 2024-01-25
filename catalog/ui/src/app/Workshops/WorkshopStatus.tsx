import React from 'react';
import { ResourceClaim } from '@app/types';
import ServiceStatus, { getStatus } from '@app/Services/ServiceStatus';
import { getAutoTimes, getMostRelevantResourceAndTemplate } from '@app/Services/service-utils';

const codeLevels = ['provision-failed', 'failed', 'stopped', 'stop-error', 'in-progress', 'provisioning', 'stop-scheduled', 'start-scheduled', 'available', 'requested', 'running'];
function cmp(a: { state: string }, b: { state: string }) {
  return codeLevels.indexOf(a.state.toLowerCase().replace(/ /g,"-")) > codeLevels.indexOf(b.state.toLowerCase().replace(/ /g,"-")) ? 1 : -1;
}

const WorkshopStatus: React.FC<{
  resourceClaims: ResourceClaim[];
}> = ({ resourceClaims }) => {
    const resourceClaimsStatus: {uid: string, state: string}[] = [];
    for (let resourceClaim of resourceClaims) {
        const creationTime= Date.parse(resourceClaims[0].metadata.creationTimestamp);
        const resource=getMostRelevantResourceAndTemplate(resourceClaims[0]).resource;
        const resourceTemplate=getMostRelevantResourceAndTemplate(resourceClaims[0]).template;
        const summary=resourceClaims[0].status?.summary;
        if (summary) {
            resourceClaimsStatus.push({uid: resourceClaim.metadata.uid, state: summary.state.replace('-', ' ')});
        } else {
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
                resourceClaimsStatus.push({uid: resourceClaim.metadata.uid, state: 'requested'});
            } else {
                resourceClaimsStatus.push({uid: resourceClaim.metadata.uid, state: getStatus(currentState, desiredState, creationTime, _startTime, _stopTime).statusName});
            }
        }
    }

    const rc = resourceClaimsStatus.sort(cmp)[0];
    const resourceClaim = resourceClaims.find(r => r.metadata.uid === rc.uid);

    return <ServiceStatus
        creationTime={Date.parse(resourceClaim.metadata.creationTimestamp)}
        resource={getMostRelevantResourceAndTemplate(resourceClaim).resource}
        resourceTemplate={getMostRelevantResourceAndTemplate(resourceClaim).template}
        resourceClaim={resourceClaim}
        summary={resourceClaim.status?.summary}
    />;
};

export default WorkshopStatus;
