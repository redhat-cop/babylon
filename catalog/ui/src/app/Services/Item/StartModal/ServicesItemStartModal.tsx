import * as React from 'react';

const parseDuration = require('parse-duration');

import {
  Button,
  Modal,
  ModalVariant,
} from '@patternfly/react-core';

import { TimeInterval } from '@app/components/TimeInterval';

import './services-item-start-modal.css';

export interface ServicesItemStartModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  resourceClaim: any;
}

const ServicesItemStartModal: React.FunctionComponent<ServicesItemStartModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  resourceClaim,
}) => {

  const catalogItemDisplayName = (
    resourceClaim === 'selected' ? 'selected services' :
    resourceClaim.metadata?.annotations?.["babylon.gpte.redhat.com/catalogItemDisplayName"] ||
    resourceClaim.metadata?.labels?.["babylon.gpte.redhat.com/catalogItemName"] ||
    "Service"
  );

  const hasMultipleResources = resourceClaim === 'selected' || (resourceClaim.spec?.resources || []).length > 1;
  const defaultRuntime = (resourceClaim !== 'selected' && resourceClaim.status?.resources) ? Math.min(
    ...resourceClaim.status.resources.map(r => {
      const resourceDefaultRuntime = r?.state?.spec?.vars?.action_schedule?.default_runtime;
      if (resourceDefaultRuntime) {
        return parseDuration(resourceDefaultRuntime) / 1000;
      } else {
        return null;
      }
    }).filter(runtime => runtime !== null)
  ) : null;

  return (
    <Modal
      className="rhpds-services-item-start-modal"
      variant={ModalVariant.small}
      title={`Start ${catalogItemDisplayName}?`}
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
      { defaultRuntime ? (
        <>
          { hasMultipleResources ? "Services" : "Service" } will stop in <TimeInterval interval={defaultRuntime} />.
        </>
      ) : null }
    </Modal>
  );
}

export { ServicesItemStartModal };
