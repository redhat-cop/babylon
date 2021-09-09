import * as React from 'react';

import {
  Spinner,
} from '@patternfly/react-core';

import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  PauseCircleIcon,
  PlayIcon,
  PowerOffIcon,
  QuestionCircleIcon,
  ExclamationCircleIcon,
  TrashIcon,
} from '@patternfly/react-icons';

export interface ServiceStatusProps {
  resource?: object;
  resourceTemplate?: object;
}

const ServiceStatus: React.FunctionComponent<ServiceStatusProps> = ({
  creationTime,
  resource,
  resourceTemplate,
}) => {
  const currentState = resource?.kind === 'AnarchySubject' ? resource?.spec?.vars?.current_state : 'available';
  const desiredState = resourceTemplate?.spec?.vars?.desired_state;
  const startTimestamp = resourceTemplate?.spec?.vars?.action_schedule?.start || resource?.spec?.vars?.action_schedule?.start;
  const startTime = startTimestamp ? Date.parse(startTimestamp) : null;
  const stopTimestamp = resourceTemplate?.spec?.vars?.action_schedule?.stop || resource?.spec?.vars?.action_schedule?.stop;
  const stopTime = stopTimestamp ? Date.parse(stopTimestamp) : null;

  if (!currentState) {
    if (creationTime && creationTime - Date.now() < 60 * 1000) {
      return (<span className="rhpds-status-unknown"><Spinner isSVG size="md" /> Requested</span>);
    } else {
      return (<span className="rhpds-status-unknown"><QuestionCircleIcon/> Unknown</span>);
    }
  } else if (currentState === 'available') {
    return (<span className="rhpds-status-available"><CheckCircleIcon/> Available</span>);
  } else if (currentState === 'new') {
    return (<span className="rhpds-status-in-progress"><Spinner isSVG size="md" /> New</span>);
  } else if (currentState === 'provision-failed') {
    return (<span className="rhpds-status-failed"><ExclamationCircleIcon/> Provision Failed</span>);
  } else if (currentState === 'provision-pending') {
    return (<span className="rhpds-status-in-progress"><Spinner isSVG size="md" /> Provision Pending</span>);
  } else if (currentState === 'provisioning') {
    return (<span className="rhpds-status-in-progress"><Spinner isSVG size="md" /> Provisioning</span>);
  } else if (currentState === 'start-pending') {
    return (<span className="rhpds-status-in-progress"><Spinner isSVG size="md" /> Start Pending</span>);
  } else if (currentState === 'started' && desiredState === 'stopped') {
    return (<span className="rhpds-status-in-progress"><Spinner isSVG size="md" /> Stop Requested</span>);
  } else if (currentState === 'started' && (stopTime < Date.now() || startTime > Date.now())) {
    return (<span className="rhpds-status-in-progress"><Spinner isSVG size="md" /> Stop Scheduled</span>);
  } else if (currentState === 'started') {
    return (<span className="rhpds-status-running"><CheckCircleIcon/> Running</span>);
  } else if (currentState === 'starting') {
    return (<span className="rhpds-status-in-progress"><Spinner isSVG size="md" /> Starting</span>);
  } else if (currentState === 'stop-pending') {
    return (<span className="rhpds-status-in-progress"><Spinner isSVG size="md" /> Stop Pending</span>);
  } else if (currentState === 'stopped' && desiredState === 'started') {
    return (<span className="rhpds-status-in-progress"><Spinner isSVG size="md" /> Start Requested</span>);
  } else if (currentState === 'stopped' && (stopTime > Date.now() && startTime <= Date.now())) {
    return (<span className="rhpds-status-in-progress"><Spinner isSVG size="md" /> Start Scheduled</span>);
  } else if (currentState === 'stopped') {
    return (<span className="rhpds-status-stopped"><PauseCircleIcon/> Stopped</span>);
  } else if (currentState === 'stopping') {
    return (<span className="rhpds-status-in-progress"><Spinner isSVG size="md" /> Stopping</span>);
  } else if (currentState.endsWith('-failed')) {
    return (<span className="rhpds-status-failed"><ExclamationCircleIcon/> {currentState}</span>);
  } else {
    return (<span className="rhpds-status-unknown"><QuestionCircleIcon/> {currentState}</span>);
  }
}

export { ServiceStatus };
