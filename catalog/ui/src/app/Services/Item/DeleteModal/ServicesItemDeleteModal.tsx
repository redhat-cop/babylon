import * as React from 'react';

const parseDuration = require('parse-duration');

import {
  Button,
  Modal,
  ModalVariant,
} from '@patternfly/react-core';

import { TimeInterval } from '@app/components/TimeInterval';

import './services-item-delete-modal.css';

export interface ServicesItemDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  resourceClaim: any;
}

const ServicesItemDeleteModal: React.FunctionComponent<ServicesItemDeleteModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  resourceClaim,
}) => {

  const catalogItemDisplayName = (
    resourceClaim.metadata?.annotations?.["babylon.gpte.redhat.com/catalogItemDisplayName"] ||
    resourceClaim.metadata?.labels?.["babylon.gpte.redhat.com/catalogItemName"] ||
    "Service"
  );

  const hasMultipleResources = (resourceClaim?.spec?.resources || []).length > 1;

  return (
    <Modal
      className="rhpds-services-item-delete-modal"
      variant={ModalVariant.small}
      title={`Delete ${catalogItemDisplayName}?`}
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
    />
  );
}

export { ServicesItemDeleteModal };
