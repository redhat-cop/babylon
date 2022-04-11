import React from 'react';

import { Button, Modal, ModalVariant } from '@patternfly/react-core';
import { ResourceClaim } from '@app/types';
import { displayName } from '@app/util';

interface ResourceClaimDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  resourceClaims: ResourceClaim[];
}

const ResourceClaimDeleteModal: React.FunctionComponent<ResourceClaimDeleteModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  resourceClaims,
}) => {
  return (
    <Modal
      className="resourceClaim-delete-modal"
      variant={ModalVariant.medium}
      title={
        resourceClaims.length === 1 ? `Delete service ${displayName(resourceClaims[0])}?` : 'Delete selected services?'
      }
      isOpen={isOpen}
      onClose={onClose}
      actions={[
        <Button key="confirm" variant="primary" onClick={onConfirm}>
          Confirm
        </Button>,
        <Button key="cancel" variant="link" onClick={onClose}>
          Cancel
        </Button>,
      ]}
    >
      Cloud resources will be deleted. Restore for deleted resources is not available.
    </Modal>
  );
};

export default ResourceClaimDeleteModal;
