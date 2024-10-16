import React from 'react';
import { Spinner } from '@patternfly/react-core';
import QuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/question-circle-icon';
import StopCircleIcon from '@patternfly/react-icons/dist/js/icons/stop-circle-icon';
import CheckCircleIcon from '@patternfly/react-icons/dist/js/icons/check-circle-icon';
import ExclamationCircleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-circle-icon';
import { AnarchySubject, ResourceClaim, ResourceClaimSpecResourceTemplate } from '@app/types';
import { getAutoTimes } from './service-utils';

import './service-status.css';

export type phaseProps = 'unknown' | 'available' | 'running' | 'in-progress' | 'failed' | 'stopped';

export function getStatus(
  currentState: string,
  desiredState: string,
  creationTime: number,
  startTime: number,
  stopTime: number
): { statusName: string; phase: phaseProps } {
  if (!currentState) {
    if (creationTime && creationTime - Date.now() < 60 * 1000) {
      return { statusName: 'Requested', phase: 'unknown' };
    } else {
      return { statusName: 'Unknown', phase: 'unknown' };
    }
  } else if (currentState === 'available') {
    return { statusName: 'Available', phase: 'available' };
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
    case 'in-progress':
      return <Spinner size="md" />;
    case 'available':
    case 'running':
      return <CheckCircleIcon />;
    case 'stopped':
      return <StopCircleIcon />;
    case 'failed':
      return <ExclamationCircleIcon />;
    default:
      return <QuestionCircleIcon />;
  }
};

export function getPhaseState(__state: string) {
  let _phase: phaseProps = 'unknown';
  const state = __state.toLowerCase();
  let _state = state.replace('-', ' ');
  switch (true) {
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
  creationTime: number;
  resource?: AnarchySubject;
  resourceTemplate?: ResourceClaimSpecResourceTemplate;
  resourceClaim: ResourceClaim;
  summary?: { state: string };
}> = ({ creationTime, resource, resourceTemplate, resourceClaim, summary }) => {
  if (summary) {
    const { phase: _phase, state: _state } = getPhaseState(summary.state);
    return <InnerStatus phase={_phase} state={_state} />;
  }
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
    return (
      <span className="service-status--unknown">
        <Spinner size="md" /> Requested
      </span>
    );
  }
  const { statusName, phase } = getStatus(currentState, desiredState, creationTime, _startTime, _stopTime);

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
