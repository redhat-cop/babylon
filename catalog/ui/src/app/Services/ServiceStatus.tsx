import React, { useEffect, useState } from 'react';
import { Button, Spinner } from '@patternfly/react-core';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  StopCircleIcon,
  QuestionCircleIcon,
  RedoIcon,
} from '@patternfly/react-icons';
import { AnarchySubject, Nullable } from '@app/types';
import { apiPaths, patchK8sObjectByPath } from '@app/api';
import useMatchMutate from '@app/utils/useMatchMutate';
import { selectUserIsAdmin } from '@app/store';
import { useSelector } from 'react-redux';

import './service-status.css';

const ServiceStatus: React.FC<{
  creationTime: number;
  resource?: AnarchySubject;
  resourceTemplate?: AnarchySubject;
  isValidating?: boolean;
}> = ({ creationTime, resource, resourceTemplate, isValidating = false }) => {
  const currentState: string = resource?.kind === 'AnarchySubject' ? resource?.spec?.vars?.current_state : 'available';
  const desiredState: Nullable<string> = resourceTemplate?.spec?.vars?.desired_state;
  const startTimestamp: Nullable<string> =
    resourceTemplate?.spec?.vars?.action_schedule?.start || resource?.spec?.vars?.action_schedule?.start;
  const startTime: Nullable<number> = startTimestamp ? Date.parse(startTimestamp) : null;
  const stopTimestamp: Nullable<string> =
    resourceTemplate?.spec?.vars?.action_schedule?.stop || resource?.spec?.vars?.action_schedule?.stop;
  const stopTime: Nullable<number> = stopTimestamp ? Date.parse(stopTimestamp) : null;
  const matchMutate = useMatchMutate();
  const userIsAdmin: boolean = useSelector(selectUserIsAdmin);
  const [retryingState, setRetryingState] = useState<Nullable<'init' | 'mutating' | 'completed'>>(null);

  async function retryHandle() {
    if (resource?.kind === 'AnarchySubject') {
      let currentStateUpdated = '';
      switch (currentState) {
        case 'start-failed':
          currentStateUpdated = 'stopped';
          break;
        case 'stop-failed':
        case 'destroy-failed':
          currentStateUpdated = 'started';
          break;
        default:
          throw new Error("Can't perform a retry on this state: " + currentState);
      }
      setRetryingState('init');
      const patch = {
        spec: {
          vars: {
            current_state: currentStateUpdated,
          },
        },
      };
      await patchK8sObjectByPath({
        path: apiPaths.ANARCHY_SUBJECT({
          namespace: resource.metadata.namespace,
          anarchySubjectName: resource.metadata.name,
        }),
        patch,
      });
      await matchMutate(/^\/apis\//);
      setRetryingState('mutating');
    } else {
      throw new Error("Can't perform a retry on this resource");
    }
  }

  useEffect(() => {
    if (retryingState === 'mutating' && !isValidating) {
      setRetryingState('completed');
    }
  }, [retryingState, isValidating]);

  if (typeof resource === 'undefined') {
    return (
      <span className="service-status--unknown">
        <Spinner isSVG size="md" /> Requested
      </span>
    );
  }
  if (!currentState) {
    if (creationTime && creationTime - Date.now() < 60 * 1000) {
      return (
        <span className="service-status--unknown">
          <Spinner isSVG size="md" /> Requested
        </span>
      );
    } else {
      return (
        <span className="service-status--unknown">
          <QuestionCircleIcon /> Unknown
        </span>
      );
    }
  } else if (currentState === 'available') {
    return (
      <span className="service-status--available">
        <CheckCircleIcon /> Available
      </span>
    );
  } else if (currentState === 'new') {
    return (
      <span className="service-status--in-progress">
        <Spinner isSVG size="md" /> New
      </span>
    );
  } else if (currentState === 'provision-pending') {
    return (
      <span className="service-status--in-progress">
        <Spinner isSVG size="md" /> Provision Pending
      </span>
    );
  } else if (currentState === 'provisioning') {
    return (
      <span className="service-status--in-progress">
        <Spinner isSVG size="md" /> Provisioning
      </span>
    );
  } else if (currentState === 'start-pending') {
    return (
      <span className="service-status--in-progress">
        <Spinner isSVG size="md" /> Start Pending
      </span>
    );
  } else if (currentState === 'started' && desiredState === 'stopped') {
    return (
      <span className="service-status--in-progress">
        <Spinner isSVG size="md" /> Stop Requested
      </span>
    );
  } else if (currentState === 'started' && stopTime && startTime && (stopTime < Date.now() || startTime > Date.now())) {
    return (
      <span className="service-status--in-progress">
        <Spinner isSVG size="md" /> Stop Scheduled
      </span>
    );
  } else if (currentState === 'started') {
    return (
      <span className="service-status--running">
        <CheckCircleIcon /> Running
      </span>
    );
  } else if (currentState === 'starting') {
    return (
      <span className="service-status--in-progress">
        <Spinner isSVG size="md" /> Starting
      </span>
    );
  } else if (currentState === 'stop-pending') {
    return (
      <span className="service-status--in-progress">
        <Spinner isSVG size="md" /> Stop Pending
      </span>
    );
  } else if (currentState === 'stopped' && desiredState === 'started') {
    return (
      <span className="service-status--in-progress">
        <Spinner isSVG size="md" /> Start Requested
      </span>
    );
  } else if (currentState === 'stopped' && stopTime && startTime && stopTime > Date.now() && startTime <= Date.now()) {
    return (
      <span className="service-status--in-progress">
        <Spinner isSVG size="md" /> Start Scheduled
      </span>
    );
  } else if (currentState === 'stopped') {
    return (
      <span className="service-status--stopped">
        <StopCircleIcon /> Stopped
      </span>
    );
  } else if (currentState === 'stopping') {
    return (
      <span className="service-status--in-progress">
        <Spinner isSVG size="md" /> Stopping
      </span>
    );
  } else if (currentState.endsWith('-failed')) {
    return (
      <span className="service-status--failed">
        <ExclamationCircleIcon /> {currentState.replace(/-/g, ' ')}
        {userIsAdmin && currentState !== 'provision-failed' ? (
          <Button
            onClick={retryHandle}
            variant="link"
            isInline
            icon={<RedoIcon />}
            style={{ marginLeft: 'var(--pf-global--spacer--sm)' }}
            isDisabled={retryingState === 'init' || retryingState === 'mutating'}
          >
            Retry
          </Button>
        ) : null}
      </span>
    );
  } else {
    return (
      <span className="service-status--unknown">
        <QuestionCircleIcon /> {currentState}
      </span>
    );
  }
};

export default ServiceStatus;
