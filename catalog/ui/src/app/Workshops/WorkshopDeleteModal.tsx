import React from 'react';

import { Button, Modal, ModalVariant } from '@patternfly/react-core';
import { Workshop } from '@app/types';
import { displayName } from '@app/util';

interface WorkshopDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  workshop?: Workshop;
}

const WorkshopDeleteModal: React.FunctionComponent<WorkshopDeleteModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  workshop,
}) => {
  return (
    <Modal
      className="workshop-delete-modal"
      variant={ModalVariant.medium}
      title={workshop ? `Delete workshop ${displayName(workshop)}?` : "Delete selected workshops?" }
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
      Provisioned services will be deleted.
    </Modal>
  );
}

export default WorkshopDeleteModal;
