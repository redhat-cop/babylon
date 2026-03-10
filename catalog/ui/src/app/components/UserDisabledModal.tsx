import React from 'react';
import { Button, Icon, Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core';
import QuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/question-circle-icon';

const UserDisabledModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  return (
    <Modal
      variant="small"
      isOpen={isOpen}
      onClose={onClose}
      aria-label="Account access restricted"
    >
      <ModalHeader
        title="Account Access Restricted"
        titleIconVariant="warning"
      />
      <ModalBody>
        <p>Your account has been disabled and you cannot place new orders at this time.</p>
        <p style={{ marginTop: '16px' }}>
          If you believe this is an error or need assistance, please contact our support team using the{' '}
          <Icon isInline>
            <QuestionCircleIcon />
          </Icon>{' '}
          <strong>Help</strong> menu in the header.
        </p>
      </ModalBody>
      <ModalFooter>
        <Button key="close" variant="primary" onClick={onClose}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default UserDisabledModal;
