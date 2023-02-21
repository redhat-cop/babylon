import React from 'react';
import { Button } from '@patternfly/react-core';
import { BABYLON_DOMAIN, checkResourceClaimCanStop } from '@app/util';
import { ResourceClaim } from '@app/types';
import OutlinedClockIcon from '@patternfly/react-icons/dist/js/icons/outlined-clock-icon';
import LocalTimestamp from './LocalTimestamp';
import TimeInterval from './TimeInterval';

const AutoStopDestroy: React.FC<{
  time: string | number;
  onClick: () => void;
  className?: string;
  type: 'auto-stop' | 'auto-destroy' | 'auto-start';
  variant?: 'extended';
  children?: React.ReactNode;
  isDisabled?: boolean;
  notDefinedMessage?: string;
  destroyTimestamp?: number;
  resourceClaim?: ResourceClaim;
}> = ({
  time: _time,
  onClick,
  resourceClaim,
  destroyTimestamp,
  className,
  type,
  children,
  variant,
  isDisabled: _isDisabled,
  notDefinedMessage,
}) => {
  let time = _time;
  let isDisabled = _isDisabled;

  if (!time) {
    return notDefinedMessage ? (
      <span>
        <Button
          variant="control"
          isDisabled={isDisabled}
          onClick={onClick}
          icon={<OutlinedClockIcon />}
          iconPosition="right"
          className={className}
          isSmall
        >
          <span style={{ marginRight: 'var(--pf-global--spacer--sm)' }}>{notDefinedMessage}</span>
        </Button>
        {children}
      </span>
    ) : (
      <span>-</span>
    );
  }

  const workshopProvisionName = resourceClaim?.metadata?.labels?.[`${BABYLON_DOMAIN}/workshop-provision`];
  const isPartOfWorkshop = !!workshopProvisionName;
  if (typeof time !== 'number') {
    time = new Date(_time).getTime();
  }

  if (!!resourceClaim) {
    if (isDisabled === null || typeof isDisabled === 'undefined') {
      if (type === 'auto-stop') {
        isDisabled = !checkResourceClaimCanStop(resourceClaim) || isPartOfWorkshop;
      }
      if (type === 'auto-destroy') {
        isDisabled = !resourceClaim?.status?.lifespan || isPartOfWorkshop;
      }
    }
  }

  let showNoAutoStop = false;
  if (type === 'auto-stop') {
    if (time > Date.now() + 15778800000) {
      // If is more than 6months show no auto-stop
      showNoAutoStop = true;
    } else if (!!resourceClaim?.status?.lifespan?.end) {
      // if Auto-Stop is greater than Auto-Destroy, show no auto-stop
      const autoDestroyTime = new Date(resourceClaim.status.lifespan.end).getTime();
      if (time >= autoDestroyTime) {
        showNoAutoStop = true;
      }
    } else if (!!destroyTimestamp) {
      // if Auto-Stop is greater than Auto-Destroy, show no auto-stop
      if (time >= destroyTimestamp) {
        showNoAutoStop = true;
      }
    }
  }

  return (
    <span>
      <Button
        variant="control"
        isDisabled={isDisabled}
        onClick={onClick}
        icon={<OutlinedClockIcon />}
        iconPosition="right"
        className={className}
        isSmall
      >
        {showNoAutoStop ? (
          <span style={{ marginRight: 'var(--pf-global--spacer--sm)' }}>No auto-stop</span>
        ) : (
          <>
            <LocalTimestamp variant="short" time={time} />
            {variant === 'extended' ? (
              <span style={{ padding: '0 6px' }}>
                (
                <TimeInterval toEpochMilliseconds={time} />)
              </span>
            ) : null}
          </>
        )}
      </Button>
      {children}
    </span>
  );
};

export default AutoStopDestroy;
