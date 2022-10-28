import React from 'react';
import { Spinner } from '@patternfly/react-core';
import QuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/question-circle-icon';
import StopCircleIcon from '@patternfly/react-icons/dist/js/icons/stop-circle-icon';
import CheckCircleIcon from '@patternfly/react-icons/dist/js/icons/check-circle-icon';
import ExclamationCircleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-circle-icon';
import { AnarchySubject, ResourceClaimSpecResourceTemplate } from '@app/types';

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
  const { statusName, phase } = getStatus(currentState, desiredState, creationTime, startTime, stopTime);

  return (
    <span className={`service-status--${phase}`}>
      <Icon phase={phase} /> {statusName}
    </span>
  );
};

export default ServiceStatus;
