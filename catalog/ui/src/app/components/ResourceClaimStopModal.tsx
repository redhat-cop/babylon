import React from 'react';

import { Button, Modal, ModalVariant } from '@patternfly/react-core';
import { ResourceClaim } from '@app/types';
import { displayName } from '@app/util';

interface ResourceClaimStopModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  resourceClaims: ResourceClaim[];
}

const ResourceClaimStopModal: React.FunctionComponent<ResourceClaimStopModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  resourceClaims,
}) => {
  return (
    <Modal
      className="resourceClaim-stop-modal"
      variant={ModalVariant.medium}
      title={resourceClaims.length === 1 ? `Stop service ${displayName(resourceClaims[0])}?` : "Stop selected services?" }
      isOpen={isOpen}
      onClose={onClose}
      actions={[
        <Button key="confirm" variant="primary"
          onClick={onConfirm}
        >Confirm</Button>,
        <Button key="cancel" variant="link"
          onClick={onClose}
        >Cancel</Button>
      ]}
    >
      Cloud services will be stopped as supported by service deployer.
    </Modal>
  );
}

export default ResourceClaimStopModal;
