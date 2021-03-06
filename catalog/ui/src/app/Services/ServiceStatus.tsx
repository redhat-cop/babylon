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
  TrashIcon,
} from '@patternfly/react-icons';

export interface ServiceStatusProps {
  currentState?: string,
  desiredState?: string,
}

const ServiceStatus: React.FunctionComponent<ServiceStatusProps> = ({
  currentState,
  desiredState,
}) => {
  if (currentState === 'new') {
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
  } else if (currentState === 'started') {
    return (<span className="rhpds-status-running"><CheckCircleIcon/> Running</span>);
  } else if (currentState === 'starting') {
    return (<span className="rhpds-status-in-progress"><Spinner isSVG size="md" /> Starting</span>);
  } else if (currentState === 'stop-pending') {
    return (<span className="rhpds-status-in-progress"><Spinner isSVG size="md" /> Stop Pending</span>);
  } else if (currentState === 'stopped' && desiredState === 'started') {
    return (<span className="rhpds-status-in-progress"><Spinner isSVG size="md" /> Start Requested</span>);
  } else if (currentState === 'stopped') {
    return (<span className="rhpds-status-stopped"><PauseCircleIcon/> Stopped</span>);
  } else if (currentState === 'stopping') {
    return (<span className="rhpds-status-in-progress"><Spinner isSVG size="md" /> Stopping</span>);
  } else {
    return (<span className="rhpds-status-unknown"><QuestionCircleIcon/>{currentState}</span>);
  }
}

export { ServiceStatus };
