import React, { useEffect } from 'react';
import { ResourceClaim } from '@app/types';
import { displayName } from '@app/util';

const ResourceClaimStopModal: React.FC<{
  onConfirm: () => Promise<void>;
  resourceClaims: ResourceClaim[];
  setTitle?: React.Dispatch<React.SetStateAction<string>>;
  setOnConfirmCb?: (_: any) => Promise<void>;
}> = ({ onConfirm, resourceClaims, setTitle, setOnConfirmCb }) => {
  useEffect(() => {
    setOnConfirmCb(() => onConfirm);
  }, [onConfirm, setOnConfirmCb]);
  useEffect(() => {
    setTitle(
      resourceClaims.length === 1 ? `Stop service ${displayName(resourceClaims[0])}?` : 'Stop selected services?',
    );
  }, [resourceClaims, setTitle]);
  return <p>Cloud services will be stopped as supported by service deployer.</p>;
};

export default ResourceClaimStopModal;
