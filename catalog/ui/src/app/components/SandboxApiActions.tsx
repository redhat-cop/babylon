import React, { useState } from 'react';
import { Alert, Button, Modal, ModalBody, ModalFooter, ModalHeader, Spinner } from '@patternfly/react-core';
import { SandboxApiStatus } from '@app/utils/useSandboxApi';

const actionLabels: Record<string, string> = {
  onboard: 'Onboarding...',
  offboard: 'Offboarding...',
  enable: 'Enabling...',
  disable: 'Disabling...',
};

const SandboxApiActions: React.FC<{
  status: SandboxApiStatus;
  updating: boolean;
  pendingAction?: string | null;
  performAction: (action: string) => Promise<void>;
  isDisabled?: boolean;
  size?: 'sm' | 'lg';
  placementCount?: number;
  clusterName?: string;
}> = ({ status, updating, pendingAction, performAction, isDisabled = false, size, placementCount = 0, clusterName }) => {
  const [showOffboardConfirm, setShowOffboardConfirm] = useState(false);

  if (pendingAction) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
        <Spinner size="sm" />
        {actionLabels[pendingAction] || 'Processing...'}
      </span>
    );
  }

  if (updating) {
    return <Spinner size="sm" />;
  }

  function handleOffboard() {
    if (placementCount > 0) {
      setShowOffboardConfirm(true);
    } else {
      performAction('offboard');
    }
  }

  if (status === 'not onboarded') {
    return (
      <Button style={{ alignSelf: 'flex-start' }} variant="primary" size={size} isDisabled={isDisabled} onClick={() => performAction('onboard')}>
        Onboard
      </Button>
    );
  }

  if (status === 'available') {
    return (
      <Button style={{ alignSelf: 'flex-start' }} variant="secondary" size={size} isDanger onClick={() => performAction('disable')}>
        Disable
      </Button>
    );
  }

  if (status === 'disabled') {
    return (
      <>
        <span style={{ display: 'inline-flex', gap: '8px', alignSelf: 'flex-start' }}>
          <Button variant="primary" size={size} onClick={() => performAction('enable')}>
            Enable
          </Button>
          <Button variant="secondary" size={size} isDanger onClick={handleOffboard}>
            Offboard
          </Button>
        </span>

        <Modal variant="small" isOpen={showOffboardConfirm} onClose={() => setShowOffboardConfirm(false)} aria-labelledby="offboard-confirm">
          <ModalHeader title="Confirm Force Offboard" labelId="offboard-confirm" titleIconVariant="warning" />
          <ModalBody>
            <Alert
              variant="danger"
              isInline
              title={`This cluster has ${placementCount} active placement${placementCount !== 1 ? 's' : ''}`}
              style={{ marginBottom: 12 }}
            >
              Offboarding {clusterName ? <strong>{clusterName}</strong> : 'this cluster'} will leave tenant services in an invalid or unavailable state.
              Affected tenants will lose access to their placements on this cluster.
            </Alert>
            <p style={{ marginTop: 8, color: 'var(--pf-t--global--text--color--subtle)', fontSize: '0.88rem' }}>
              This action cannot be undone. Ensure all tenants have been migrated before proceeding.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="danger" onClick={() => { setShowOffboardConfirm(false); performAction('offboard'); }}>
              Force Offboard
            </Button>
            <Button variant="link" onClick={() => setShowOffboardConfirm(false)}>
              Cancel
            </Button>
          </ModalFooter>
        </Modal>
      </>
    );
  }

  return null;
};

export default SandboxApiActions;
