import React from 'react';

import { Button, Modal, ModalVariant } from '@patternfly/react-core';
import { ResourceClaim } from '@app/types';
import { displayName } from '@app/util';

const parseDuration = require('parse-duration');
import TimeInterval from '@app/components/TimeInterval';

interface ResourceClaimStartModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  resourceClaims: ResourceClaim[];
}

const ResourceClaimStartModal: React.FunctionComponent<ResourceClaimStartModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  resourceClaims,
}) => {
  if (resourceClaims.length === 1) {
    const resourceClaim: ResourceClaim = resourceClaims[0];
    const defaultRuntime: number | null = resourceClaim.status?.resources
      ? Math.min(
          ...resourceClaim.status.resources
            .filter((r) => (r.state?.spec?.vars?.action_schedule?.default_runtime ? true : false))
            .map((r) => parseDuration(r.state.spec.vars.action_schedule.default_runtime) / 1000)
        )
      : null;
    return (
      <Modal
        className="resourceClaim-start-modal"
        variant={ModalVariant.small}
        title={`Start ${displayName(resourceClaim)}`}
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
        {defaultRuntime ? (
          <>
            {(resourceClaim.spec.resources || []).length === 1 ? 'Service' : 'Services'}
            {' will stop in '}
            <TimeInterval interval={defaultRuntime} />.
          </>
        ) : (
          <>Services will automatically stop according to their configured schedules.</>
        )}
      </Modal>
    );
  } else {
    return (
      <Modal
        className="resourceClaim-delete-modal"
        variant={ModalVariant.medium}
        title="Start selected services?"
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
        Services may automatically stop according to their configured schedules.
      </Modal>
    );
  }
};

export default ResourceClaimStartModal;
