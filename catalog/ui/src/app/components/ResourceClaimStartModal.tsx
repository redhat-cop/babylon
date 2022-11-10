import React, { useEffect } from 'react';
import { ResourceClaim } from '@app/types';
import { displayName } from '@app/util';
import parseDuration from 'parse-duration';
import TimeInterval from '@app/components/TimeInterval';

const ResourceClaimStartModal: React.FC<{
  onConfirm: () => Promise<void>;
  resourceClaims: ResourceClaim[];
  setTitle?: React.Dispatch<React.SetStateAction<string>>;
  setOnConfirmCb?: (_: any) => Promise<void>;
}> = ({ onConfirm, resourceClaims, setTitle, setOnConfirmCb }) => {
  useEffect(() => {
    setOnConfirmCb(() => onConfirm);
  }, [onConfirm, setOnConfirmCb]);
  useEffect(() => {
    setTitle(resourceClaims.length === 1 ? `Start ${displayName(resourceClaims[0])}?` : 'Start selected services?');
  }, [resourceClaims, setTitle]);

  if (resourceClaims.length === 1) {
    const resourceClaim = resourceClaims[0];
    const defaultRuntimes = resourceClaim.status?.resources
      ? resourceClaim.status.resources
          .filter((r) => (r.state?.spec?.vars?.action_schedule?.default_runtime ? true : false))
          .map((r) => parseDuration(r.state.spec.vars.action_schedule.default_runtime) / 1000)
      : [];
    const defaultRuntime = defaultRuntimes.length > 0 ? Math.min(...defaultRuntimes) : null;
    return (
      <p>
        {defaultRuntime ? (
          <>
            {(resourceClaim.spec.resources || []).length === 1 ? 'Service' : 'Services'}
            {' will stop in '}
            <TimeInterval interval={defaultRuntime} />.
          </>
        ) : (
          <>Services will automatically stop according to their configured schedules.</>
        )}
      </p>
    );
  } else {
    return <p> Services may automatically stop according to their configured schedules.</p>;
  }
};

export default ResourceClaimStartModal;
