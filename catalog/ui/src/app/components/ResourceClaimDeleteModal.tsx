import React, { useEffect } from 'react';
import { ResourceClaim } from '@app/types';
import { displayName } from '@app/util';

const ResourceClaimDeleteModal: React.FC<{
  onConfirm: () => Promise<void>;
  resourceClaims: ResourceClaim[];
  setTitle?: React.Dispatch<React.SetStateAction<string>>;
  setOnConfirmCb?: (_: any) => Promise<void>;
  restart?: boolean;
}> = ({ onConfirm, resourceClaims, setTitle, setOnConfirmCb, restart }) => {
  useEffect(() => {
    setOnConfirmCb(() => onConfirm);
  }, [onConfirm, setOnConfirmCb]);
  useEffect(() => {
    if (restart === true) {
      setTitle(
        resourceClaims.length === 1
          ? `Redeploy service ${displayName(resourceClaims[0])}?`
          : 'Redeploy selected services?'
      );
    } else {
      setTitle(
        resourceClaims.length === 1 ? `Delete service ${displayName(resourceClaims[0])}?` : 'Delete selected services?'
      );
    }
  }, [resourceClaims, setTitle]);
  return <p>Cloud resources will be deleted. Restore for deleted resources is not available.</p>;
};

export default ResourceClaimDeleteModal;
