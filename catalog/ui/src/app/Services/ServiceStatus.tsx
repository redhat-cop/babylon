import React from 'react';
import { Spinner } from '@patternfly/react-core';
import { CheckCircleIcon, ExclamationCircleIcon, StopCircleIcon, QuestionCircleIcon } from '@patternfly/react-icons';

import './service-status.css';

const ServiceStatus: React.FC<{
  creationTime: number;
  resource?: any;
  resourceTemplate?: any;
}> = ({ creationTime, resource, resourceTemplate }) => {
  const currentState: string = resource?.kind === 'AnarchySubject' ? resource?.spec?.vars?.current_state : 'available';
  const desiredState: string | null = resourceTemplate?.spec?.vars?.desired_state;
  const startTimestamp: string | null =
    resourceTemplate?.spec?.vars?.action_schedule?.start || resource?.spec?.vars?.action_schedule?.start;
  const startTime: number | null = startTimestamp ? Date.parse(startTimestamp) : null;
  const stopTimestamp: string | null =
    resourceTemplate?.spec?.vars?.action_schedule?.stop || resource?.spec?.vars?.action_schedule?.stop;
  const stopTime: number | null = stopTimestamp ? Date.parse(stopTimestamp) : null;

  if (resource === undefined) {
    return (
      <span className="rhpds-status-unknown">
        <Spinner isSVG size="md" /> Requested
      </span>
    );
  }
  if (!currentState) {
    if (creationTime && creationTime - Date.now() < 60 * 1000) {
      return (
        <span className="rhpds-status-unknown">
          <Spinner isSVG size="md" /> Requested
        </span>
      );
    } else {
      return (
        <span className="rhpds-status-unknown">
          <QuestionCircleIcon /> Unknown
        </span>
      );
    }
  } else if (currentState === 'available') {
    return (
      <span className="rhpds-status-available">
        <CheckCircleIcon /> Available
      </span>
    );
  } else if (currentState === 'new') {
    return (
      <span className="rhpds-status-in-progress">
        <Spinner isSVG size="md" /> New
      </span>
    );
  } else if (currentState === 'provision-failed') {
    return (
      <span className="rhpds-status-failed">
        <ExclamationCircleIcon /> Provision Failed
      </span>
    );
  } else if (currentState === 'provision-pending') {
    return (
      <span className="rhpds-status-in-progress">
        <Spinner isSVG size="md" /> Provision Pending
      </span>
    );
  } else if (currentState === 'provisioning') {
    return (
      <span className="rhpds-status-in-progress">
        <Spinner isSVG size="md" /> Provisioning
      </span>
    );
  } else if (currentState === 'start-pending') {
    return (
      <span className="rhpds-status-in-progress">
        <Spinner isSVG size="md" /> Start Pending
      </span>
    );
  } else if (currentState === 'started' && desiredState === 'stopped') {
    return (
      <span className="rhpds-status-in-progress">
        <Spinner isSVG size="md" /> Stop Requested
      </span>
    );
  } else if (currentState === 'started' && stopTime && startTime && (stopTime < Date.now() || startTime > Date.now())) {
    return (
      <span className="rhpds-status-in-progress">
        <Spinner isSVG size="md" /> Stop Scheduled
      </span>
    );
  } else if (currentState === 'started') {
    return (
      <span className="rhpds-status-running">
        <CheckCircleIcon /> Running
      </span>
    );
  } else if (currentState === 'starting') {
    return (
      <span className="rhpds-status-in-progress">
        <Spinner isSVG size="md" /> Starting
      </span>
    );
  } else if (currentState === 'stop-pending') {
    return (
      <span className="rhpds-status-in-progress">
        <Spinner isSVG size="md" /> Stop Pending
      </span>
    );
  } else if (currentState === 'stopped' && desiredState === 'started') {
    return (
      <span className="rhpds-status-in-progress">
        <Spinner isSVG size="md" /> Start Requested
      </span>
    );
  } else if (currentState === 'stopped' && stopTime && startTime && stopTime > Date.now() && startTime <= Date.now()) {
    return (
      <span className="rhpds-status-in-progress">
        <Spinner isSVG size="md" /> Start Scheduled
      </span>
    );
  } else if (currentState === 'stopped') {
    return (
      <span className="rhpds-status-stopped">
        <StopCircleIcon /> Stopped
      </span>
    );
  } else if (currentState === 'stopping') {
    return (
      <span className="rhpds-status-in-progress">
        <Spinner isSVG size="md" /> Stopping
      </span>
    );
  } else if (currentState.endsWith('-failed')) {
    return (
      <span className="rhpds-status-failed">
        <ExclamationCircleIcon /> {currentState}
      </span>
    );
  } else {
    return (
      <span className="rhpds-status-unknown">
        <QuestionCircleIcon /> {currentState}
      </span>
    );
  }
};

export default ServiceStatus;
