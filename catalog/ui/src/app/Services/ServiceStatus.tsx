import React from 'react';
import { Spinner } from '@patternfly/react-core';
import QuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/question-circle-icon';
import StopCircleIcon from '@patternfly/react-icons/dist/js/icons/stop-circle-icon';
import CheckCircleIcon from '@patternfly/react-icons/dist/js/icons/check-circle-icon';
import ExclamationCircleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-circle-icon';
import ClockIcon from '@patternfly/react-icons/dist/js/icons/clock-icon';
import { AnarchySubject, ResourceClaim, ResourceClaimSpecResourceTemplate } from '@app/types';
import { getAutoTimes, getMostRelevantResourceAndTemplate } from './service-utils';

import './service-status.css';

export type phaseProps = 'unknown' | 'scheduled' | 'available' | 'running' | 'in-progress' | 'failed' | 'stopped' | 'waiting';

// Helper function to get scheduled start timestamp from resourceClaim
function getScheduledStartTimestamp(resourceClaim: ResourceClaim, resource?: AnarchySubject, resourceTemplate?: ResourceClaimSpecResourceTemplate): number | null {
  // Check new format first (provider parameterValues)
  if (resourceClaim.spec?.provider?.parameterValues?.start_timestamp) {
    return Date.parse(resourceClaim.spec.provider.parameterValues.start_timestamp);
  }
  return null;
}

// Helper function to get scheduled stop timestamp from resourceClaim  
function getScheduledStopTimestamp(resourceClaim: ResourceClaim, resource?: AnarchySubject, resourceTemplate?: ResourceClaimSpecResourceTemplate): number | null {
  // Check new format only (provider parameterValues)
  if (resourceClaim.spec?.provider?.parameterValues?.stop_timestamp) {
    return Date.parse(resourceClaim.spec.provider.parameterValues.stop_timestamp);
  }
  return null;
}

export function getStatus(
  currentState: string,
  desiredState: string,
  creationTime: number,
  startTime: number,
  stopTime: number,
  resourceClaim?: ResourceClaim,
  resource?: AnarchySubject,
  resourceTemplate?: ResourceClaimSpecResourceTemplate
): { statusName: string; phase: phaseProps } {
  // Check for waiting states first if we have resourceClaim context
  if (resourceClaim) {
    const scheduledStartTime = getScheduledStartTimestamp(resourceClaim, resource, resourceTemplate);
    const scheduledStopTime = getScheduledStopTimestamp(resourceClaim, resource, resourceTemplate);
    const now = Date.now();
    
    // Waiting to Provision: resourceClaim exists but no resource state yet and not scheduled for future
    const lifespanStartTime = resourceClaim.spec?.lifespan?.start ? Date.parse(resourceClaim.spec.lifespan.start) : null;
    const isScheduledForFuture = lifespanStartTime && lifespanStartTime > now;
    
    if (!currentState && !isScheduledForFuture && !resource) {
      return { statusName: 'Waiting to Provision', phase: 'waiting' };
    }
    
    // Waiting to Stop: scheduled stop time is in the PAST but service still running
    if (scheduledStopTime && scheduledStopTime < now && (currentState === 'started' || currentState === 'running')) {
      return { statusName: 'Waiting to Stop', phase: 'waiting' };
    }
    
    // Waiting to Start: Only if start is in past, service is stopped, AND (no stop scheduled OR stop is in future)
    // Important: If stop is in the past, the service lifecycle is complete - don't show "Waiting to Start"
    if (scheduledStartTime && scheduledStartTime < now && (currentState === 'stopped' || !currentState)) {
      if (!scheduledStopTime || scheduledStopTime > now) {
        return { statusName: 'Waiting to Start', phase: 'waiting' };
      }
    }
    
  }

  if (!currentState) {
    if (creationTime && creationTime - Date.now() < 60 * 1000) {
      return { statusName: 'Requested', phase: 'unknown' };
    } else {
      return { statusName: 'Unknown', phase: 'unknown' };
    }
  } else if (currentState === 'available') {
    return { statusName: 'Available', phase: 'in-progress' };
  } else if (currentState === 'new') {
    return { statusName: 'New', phase: 'in-progress' };
  } else if (currentState === 'provision-pending') {
    return { statusName: 'Provision Pending', phase: 'in-progress' };
  } else if (currentState === 'provisioning') {
    return { statusName: 'Provisioning', phase: 'in-progress' };
  } else if (currentState === 'start-pending') {
    return { statusName: 'Start Pending', phase: 'in-progress' };
  } else if (currentState === 'started' && desiredState === 'stopped') {
    return { statusName: 'Stop Requested', phase: 'in-progress' };
  } else if (currentState === 'started' && stopTime && startTime && (stopTime < Date.now() || startTime > Date.now())) {
    return { statusName: 'Stop Scheduled', phase: 'in-progress' };
  } else if (currentState === 'started') {
    return { statusName: 'Running', phase: 'running' };
  } else if (currentState === 'starting') {
    return { statusName: 'Starting', phase: 'in-progress' };
  } else if (currentState === 'stop-pending') {
    return { statusName: 'Stop Pending', phase: 'in-progress' };
  } else if (currentState === 'stopped' && desiredState === 'started') {
    return { statusName: 'Start Requested', phase: 'in-progress' };
  } else if (currentState === 'stopped' && stopTime && startTime && stopTime > Date.now() && startTime <= Date.now()) {
    return { statusName: 'Start Scheduled', phase: 'in-progress' };
  } else if (currentState === 'stopped') {
    return { statusName: 'Stopped', phase: 'stopped' };
  } else if (currentState === 'stopping') {
    return { statusName: 'Stopping', phase: 'in-progress' };
  } else if (currentState.endsWith('-failed')) {
    return { statusName: currentState.replace(/-/g, ' '), phase: 'failed' };
  } else {
    return { statusName: currentState, phase: 'unknown' };
  }
}

const Icon: React.FC<{ phase: phaseProps }> = ({ phase }) => {
  switch (phase) {
    case 'unknown':
      return <QuestionCircleIcon />;
    case 'available':
    case 'in-progress':
      return <Spinner size="md" />;
    case 'running':
    case 'scheduled':
      return <CheckCircleIcon />;
    case 'stopped':
      return <StopCircleIcon />;
    case 'failed':
      return <ExclamationCircleIcon />;
    case 'waiting':
      return <ClockIcon />;
    default:
      return <QuestionCircleIcon />;
  }
};

export function getPhaseState(__state: string) {
  let _phase: phaseProps = 'unknown';
  const state = __state.toLowerCase();
  let _state = state.replace('-', ' ');
  switch (true) {
    case state.startsWith('waiting'):
    case state.includes('waiting to provision'):
      _phase = 'waiting';
      break;
    case state.endsWith('-pending'):
    case state.endsWith('-scheduled'):
    case state.endsWith('-requested'):
    case state === 'new':
    case state === 'available':
    case state === 'provisioning':
    case state === 'requesting':
    case state === 'initializing':
    case state === 'stopping':
    case state === 'starting':
      _phase = 'in-progress';
      break;
    case state.endsWith('-failed'):
    case state.endsWith('-error'):
      _phase = 'failed';
      break;
    case state === 'started':
    case state === 'running':
      _phase = 'running';
      _state = 'Running';
      break;
    case state === 'stopped':
      _phase = 'stopped';
      break;
  }
  return { phase: _phase, state: _state };
}
const ServiceStatus: React.FC<{
  resourceClaim: ResourceClaim;
}> = ({ resourceClaim }) => {
  // Calculate all needed values from resourceClaim
  const creationTime = Date.parse(resourceClaim.metadata.creationTimestamp);
  const { resource, template: resourceTemplate } = getMostRelevantResourceAndTemplate(resourceClaim);
  const summary = resourceClaim.status?.summary;
  const currentState = resource?.kind === 'AnarchySubject' ? resource?.spec?.vars?.current_state : 'available';

  // Check for waiting states BEFORE checking summary
  const scheduledStartTime = getScheduledStartTimestamp(resourceClaim, resource, resourceTemplate);
  const scheduledStopTime = getScheduledStopTimestamp(resourceClaim, resource, resourceTemplate);
  const now = Date.now();
  
  // Waiting to Stop: scheduled stop time is in the PAST but service still running
  if (scheduledStopTime && scheduledStopTime < now && (currentState === 'started' || currentState === 'running')) {
    return <InnerStatus phase="waiting" state="Waiting to Stop" />;
  }
  
  // Waiting to Start: scheduled start time is in the PAST but service still stopped
  // BUT only if stop timestamp is not in the past (service lifecycle not complete)
  if (scheduledStartTime && scheduledStartTime < now && (currentState === 'stopped' || !currentState)) {
    if (!scheduledStopTime || scheduledStopTime > now) {
      return <InnerStatus phase="waiting" state="Waiting to Start" />;
    }
  }

  if (summary) {
    const { phase: _phase, state: _state } = getPhaseState(summary.state);
    return <InnerStatus phase={_phase} state={_state} />;
  }
  if (new Date(resourceClaim.spec.lifespan?.start).getTime() > new Date().getTime()) {
    return <InnerStatus phase="scheduled" state="scheduled" />;
  }
  const desiredState = resourceTemplate?.spec?.vars?.desired_state;

  if (typeof resource === 'undefined') {
    return <InnerStatus phase="waiting" state="Waiting to Provision" />;
  }
  const { statusName, phase } = getStatus(currentState, desiredState, creationTime, null, null, resourceClaim, resource, resourceTemplate);

  return <InnerStatus phase={phase} state={statusName} />;
};

export const InnerStatus: React.FC<{
  phase: phaseProps;
  state: string;
}> = ({ phase, state }) => {
  return (
    <span className={`service-status--${phase}`} style={{ textTransform: 'capitalize' }}>
      <Icon phase={phase} /> {state}
    </span>
  );
};

export default ServiceStatus;
