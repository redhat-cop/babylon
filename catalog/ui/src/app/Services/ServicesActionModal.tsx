import React from 'react';
const parseDuration = require('parse-duration');
import { Button, Modal, ModalVariant } from '@patternfly/react-core';
import { ResourceClaim } from '@app/types';
import { displayName } from '@app/util';
import TimeInterval from '@app/components/TimeInterval';

import './services-delete-modal.css';

export interface ServicesActionModalProps {
  action: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  resourceClaim?: ResourceClaim;
}

const ServicesActionModal: React.FunctionComponent<ServicesActionModalProps> = ({
  action,
  isOpen,
  onClose,
  onConfirm,
  resourceClaim,
}) => {
  const targetDisplay:string = resourceClaim ? displayName(resourceClaim) : 'Selected Services';
  const actionDisplay:string = action.charAt(0).toUpperCase() + action.slice(1);
  const title:string = `${actionDisplay} ${targetDisplay}`;

  const resourceClaimHasMultipleResources:boolean|null = resourceClaim?.spec?.resources ? resourceClaim.spec.resources.length > 1 : null;
  // Show default runtime of resource with minimum value
  const defaultRuntime:number|null = resourceClaim?.status?.resources ? Math.min(
    ...resourceClaim.status.resources.filter(r =>
      r.state?.spec?.vars?.action_schedule?.default_runtime ? true : false
    ).map(r =>
      parseDuration(r.state.spec.vars.action_schedule.default_runtime) / 1000
    )
  ) : null;

  return (
    <Modal
      className="services-delete-modal"
      variant={ModalVariant.small}
      title={title}
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
    { action === 'delete' ? (<>
      Cloud resources will be deleted. Restore for deleted resources is not available.
    </>) : action === 'start' ? (
        defaultRuntime ? (<>
          { resourceClaimHasMultipleResources ? "Services" : "Service" }
          {' will stop in '}
          <TimeInterval interval={defaultRuntime} />.
        </>) : (<>
          Services will automatically stop according to their configured schedules.
        </>)
    ) : action == 'stop' ? (<>
      Cloud services will be stopped.
    </>) : null }
    </Modal>
  );
}

export default ServicesActionModal;
