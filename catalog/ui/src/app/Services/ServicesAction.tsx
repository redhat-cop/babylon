import React, { useEffect } from 'react';
import parseDuration from 'parse-duration';
import { ResourceClaim, ServiceActionActions } from '@app/types';
import TimeInterval from '@app/components/TimeInterval';
import { displayName } from '@app/util';
import ServicesActionRating from './ServicesActionRating';
import { ErrorBoundary } from 'react-error-boundary';

const ServicesAction: React.FC<{
  setTitle?: React.Dispatch<React.SetStateAction<string>>;
  setActionState?: React.Dispatch<
    React.SetStateAction<{
      action: ServiceActionActions;
      resourceClaim?: ResourceClaim;
      rating?: { rate: number; comment: string };
    }>
  >;
  actionState: {
    action: ServiceActionActions;
    resourceClaim?: ResourceClaim;
    rating?: { rate: number; comment: string };
  };
}> = ({ actionState, setTitle, setActionState }) => {
  const action = actionState.action;
  const resourceClaim = actionState.resourceClaim;
  const resourceClaimHasMultipleResources = resourceClaim?.spec?.resources
    ? resourceClaim.spec.resources.length > 1
    : null;
  const targetDisplay = resourceClaim ? displayName(resourceClaim) : 'Selected Services';
  const actionDisplay = action.charAt(0).toUpperCase() + action.slice(1);
  useEffect(() => setTitle(`${actionDisplay} ${targetDisplay}`), [actionDisplay, setTitle, targetDisplay]);

  // Show default runtime of resource with minimum value
  const defaultRuntimes = resourceClaim?.status?.resources
    ? resourceClaim.status.resources
        .filter((r) => (r.state?.spec?.vars?.action_schedule?.default_runtime ? true : false))
        .map((r) => parseDuration(r.state.spec.vars.action_schedule.default_runtime) / 1000)
    : [];
  const defaultRuntime = defaultRuntimes.length > 0 ? Math.min(...defaultRuntimes) : null;

  return (
    <>
      {action === 'delete' ? (
        <p style={{ paddingBottom: 'var(--pf-global--spacer--md)' }}>
          Cloud resources will be deleted. Restore for deleted resources is not available.
        </p>
      ) : action === 'start' ? (
        defaultRuntime ? (
          <p>
            {resourceClaimHasMultipleResources ? 'Services' : 'Service'}
            {' will stop in '}
            <TimeInterval interval={defaultRuntime} />.
          </p>
        ) : (
          <p>Services will automatically stop according to their configured schedules.</p>
        )
      ) : action === 'stop' ? (
        <p>Cloud services will be stopped.</p>
      ) : null}
      {action === 'rate' || action === 'delete' ? (
        <ErrorBoundary
          fallbackRender={() => (
            <ServicesActionRating actionState={actionState} setActionState={setActionState} hasError />
          )}
        >
          <ServicesActionRating actionState={actionState} setActionState={setActionState} />
        </ErrorBoundary>
      ) : null}
    </>
  );
};

export default ServicesAction;
