import React, { useEffect } from 'react';
import parseDuration from 'parse-duration';
import { ResourceClaim, ServiceActionActions, WorkshopWithResourceClaims } from '@app/types';
import TimeInterval from '@app/components/TimeInterval';
import { checkResourceClaimCanRate, displayName } from '@app/util';
import ServicesActionRating from './ServicesActionRating';
import { ErrorBoundary } from 'react-error-boundary';

const ServicesAction: React.FC<{
  setTitle?: React.Dispatch<React.SetStateAction<string>>;
  setActionState?: React.Dispatch<
    React.SetStateAction<{
      action: ServiceActionActions;
      resourceClaim?: ResourceClaim;
      rating?: { rate: number; comment: string };
      submitDisabled: boolean;
    }>
  >;
  actionState: {
    action: ServiceActionActions;
    resourceClaim?: ResourceClaim;
    workshop?: WorkshopWithResourceClaims;
    rating?: { rate: number; comment: string };
    submitDisabled: boolean;
  };
}> = ({ actionState, setTitle, setActionState }) => {
  const action = actionState.action;
  const resourceClaim = actionState.resourceClaim;
  const workshop = actionState.workshop;
  const canRate = resourceClaim ? checkResourceClaimCanRate(resourceClaim) : false;
  const targetDisplay = resourceClaim || workshop ? displayName(resourceClaim || workshop) : 'Selected Services';
  const actionDisplay = action.charAt(0).toUpperCase() + action.slice(1);
  useEffect(() => setTitle(`${actionDisplay} ${targetDisplay}`), [actionDisplay, setTitle, targetDisplay]);

  // Show default runtime of resource with minimum value
  let defaultRuntimes = [];
  if (resourceClaim) {
    defaultRuntimes = resourceClaim?.status?.resources
      ? resourceClaim.status.resources
          .filter((r) => (r.state?.spec?.vars?.action_schedule?.default_runtime ? true : false))
          .map((r) => parseDuration(r.state.spec.vars.action_schedule.default_runtime) / 1000)
      : [];
  } else if (workshop && workshop.resourceClaims) {
    for (const resourceClaim of workshop.resourceClaims) {
      defaultRuntimes.push(
        ...(resourceClaim.status?.resources
          ? resourceClaim.status.resources
              .filter((r) => (r.state?.spec?.vars?.action_schedule?.default_runtime ? true : false))
              .map((r) => parseDuration(r.state.spec.vars.action_schedule.default_runtime) / 1000)
          : [])
      );
    }
  }
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
            Service will stop in <TimeInterval interval={defaultRuntime} />.
          </p>
        ) : (
          <p>Services will automatically stop according to their configured schedules.</p>
        )
      ) : action === 'stop' ? (
        <p>Cloud services will be stopped.</p>
      ) : null}
      {(action === 'rate' || action === 'delete') && setActionState && canRate ? (
        <ErrorBoundary
          fallbackRender={() => (
            <ServicesActionRating actionState={actionState} setActionState={setActionState} hasError action={action} />
          )}
        >
          <ServicesActionRating actionState={actionState} setActionState={setActionState} action={action} />
        </ErrorBoundary>
      ) : null}
    </>
  );
};

export default ServicesAction;
