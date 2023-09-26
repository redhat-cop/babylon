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
  stopTime: number,
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
      return <Spinner isSVG size="md" />;
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

const ServiceStatus: React.FC<{
  creationTime: number;
  resource?: AnarchySubject;
  resourceTemplate?: ResourceClaimSpecResourceTemplate;
  resourceClaim: ResourceClaim;
  summary?: { state: string };
}> = ({ creationTime, resource, resourceTemplate, resourceClaim, summary }) => {
  if (summary) {
    let _phase: phaseProps = 'unknown';
    let _state = summary.state.replace('-', ' ');
    if (summary.state.endsWith('-pending')) {
      _phase = 'in-progress';
    } else if (summary.state.endsWith('-pending')) {
      _phase = 'failed';
    } else if (summary.state === 'started') {
      _phase = 'running';
      _state = 'Running';
    } else if (summary.state === 'stopped') {
      _phase = 'stopped';
    }
    return (
      <span className={`service-status--${_phase}`} style={{ textTransform: 'capitalize' }}>
        <Icon phase={_phase} /> {_state}
      </span>
    );
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
        <Spinner isSVG size="md" /> Requested
      </span>
    );
  }
  const { statusName, phase } = getStatus(currentState, desiredState, creationTime, _startTime, _stopTime);

  return (
    <span className={`service-status--${phase}`}>
      <Icon phase={phase} /> {statusName}
    </span>
  );
};

export default ServiceStatus;
