import React from 'react';
import { Spinner } from '@patternfly/react-core';
import { CheckCircleIcon, ExclamationCircleIcon, StopCircleIcon, QuestionCircleIcon } from '@patternfly/react-icons';
import { AnarchySubject, ResourceClaimSpecResourceTemplate } from '@app/types';

import './service-status.css';

export type codeProps = 'unknown' | 'available' | 'running' | 'in-progress' | 'failed' | 'stopped';

export function getStatus(
  currentState: string,
  desiredState: string,
  creationTime: number,
  startTime: number,
  stopTime: number
): { status: string; code: codeProps } {
  if (!currentState) {
    if (creationTime && creationTime - Date.now() < 60 * 1000) {
      return { status: 'Requested', code: 'unknown' };
    } else {
      return { status: 'Unknown', code: 'unknown' };
    }
  } else if (currentState === 'available') {
    return { status: 'Available', code: 'available' };
  } else if (currentState === 'new') {
    return { status: 'New', code: 'in-progress' };
  } else if (currentState === 'provision-pending') {
    return { status: 'Provision Pending', code: 'in-progress' };
  } else if (currentState === 'provisioning') {
    return { status: 'Provisioning', code: 'in-progress' };
  } else if (currentState === 'start-pending') {
    return { status: 'Start Pending', code: 'in-progress' };
  } else if (currentState === 'started' && desiredState === 'stopped') {
    return { status: 'Stop Requested', code: 'in-progress' };
  } else if (currentState === 'started' && stopTime && startTime && (stopTime < Date.now() || startTime > Date.now())) {
    return { status: 'Stop Scheduled', code: 'in-progress' };
  } else if (currentState === 'started') {
    return { status: 'Running', code: 'running' };
  } else if (currentState === 'starting') {
    return { status: 'Starting', code: 'in-progress' };
  } else if (currentState === 'stop-pending') {
    return { status: 'Stop Pending', code: 'in-progress' };
  } else if (currentState === 'stopped' && desiredState === 'started') {
    return { status: 'Start Requested', code: 'in-progress' };
  } else if (currentState === 'stopped' && stopTime && startTime && stopTime > Date.now() && startTime <= Date.now()) {
    return { status: 'Start Scheduled', code: 'in-progress' };
  } else if (currentState === 'stopped') {
    return { status: 'Stopped', code: 'stopped' };
  } else if (currentState === 'stopping') {
    return { status: 'Stopping', code: 'in-progress' };
  } else if (currentState.endsWith('-failed')) {
    return { status: currentState.replace(/-/g, ' '), code: 'failed' };
  } else {
    return { status: currentState, code: 'unknown' };
  }
}

const Icon: React.FC<{ code: codeProps }> = ({ code }) => {
  switch (code) {
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
}> = ({ creationTime, resource, resourceTemplate }) => {
  const currentState = resource?.kind === 'AnarchySubject' ? resource?.spec?.vars?.current_state : 'available';
  const desiredState = resourceTemplate?.spec?.vars?.desired_state;
  const startTimestamp =
    resourceTemplate?.spec?.vars?.action_schedule?.start || resource?.spec?.vars?.action_schedule?.start;
  const startTime = startTimestamp ? Date.parse(startTimestamp) : null;
  const stopTimestamp =
    resourceTemplate?.spec?.vars?.action_schedule?.stop || resource?.spec?.vars?.action_schedule?.stop;
  const stopTime = stopTimestamp ? Date.parse(stopTimestamp) : null;

  if (typeof resource === 'undefined') {
    return (
      <span className="service-status--unknown">
        <Spinner isSVG size="md" /> Requested
      </span>
    );
  }
  const { status, code } = getStatus(currentState, desiredState, creationTime, startTime, stopTime);

  return (
    <span className={`service-status--${code}`}>
      <Icon code={code} /> {status}
    </span>
  );
};

export default ServiceStatus;
