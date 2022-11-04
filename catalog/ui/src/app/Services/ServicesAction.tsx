import React, { useEffect } from 'react';
import parseDuration from 'parse-duration';
import { ResourceClaim } from '@app/types';
import TimeInterval from '@app/components/TimeInterval';
import { displayName } from '@app/util';

const ServicesAction: React.FC<{
  action: string;
  resourceClaim?: ResourceClaim;
  setTitle?: React.Dispatch<React.SetStateAction<string>>;
}> = ({ action, resourceClaim, setTitle }) => {
  const resourceClaimHasMultipleResources: boolean | null = resourceClaim?.spec?.resources
    ? resourceClaim.spec.resources.length > 1
    : null;
  const targetDisplay: string = resourceClaim ? displayName(resourceClaim) : 'Selected Services';
  const actionDisplay: string = action.charAt(0).toUpperCase() + action.slice(1);
  useEffect(() => setTitle(`${actionDisplay} ${targetDisplay}`), [actionDisplay, setTitle, targetDisplay]);

  // Show default runtime of resource with minimum value
  const defaultRuntime: number | null = resourceClaim?.status?.resources
    ? Math.min(
        ...resourceClaim.status.resources
          .filter((r) => (r.state?.spec?.vars?.action_schedule?.default_runtime ? true : false))
          .map((r) => parseDuration(r.state.spec.vars.action_schedule.default_runtime) / 1000)
      )
    : null;

  return (
    <>
      {action === 'delete' ? (
        <>Cloud resources will be deleted. Restore for deleted resources is not available.</>
      ) : action === 'start' ? (
        defaultRuntime ? (
          <>
            {resourceClaimHasMultipleResources ? 'Services' : 'Service'}
            {' will stop in '}
            <TimeInterval interval={defaultRuntime} />.
          </>
        ) : (
          <>Services will automatically stop according to their configured schedules.</>
        )
      ) : action == 'stop' ? (
        <>Cloud services will be stopped.</>
      ) : null}
    </>
  );
};

export default ServicesAction;
