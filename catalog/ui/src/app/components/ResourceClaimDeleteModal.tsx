import React, { useEffect } from 'react';
import { ResourceClaim } from '@app/types';
import { displayName } from '@app/util';

const ResourceClaimDeleteModal: React.FC<{
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
      resourceClaims.length === 1 ? `Delete service ${displayName(resourceClaims[0])}?` : 'Delete selected services?',
    );
  }, [resourceClaims, setTitle]);
  return <p>Cloud resources will be deleted. Restore for deleted resources is not available.</p>;
};

export default ResourceClaimDeleteModal;
