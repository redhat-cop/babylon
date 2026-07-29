import React from 'react';
import { Button, Spinner } from '@patternfly/react-core';
import { SandboxApiStatus } from '@app/utils/useSandboxApi';

const SandboxApiActions: React.FC<{
  status: SandboxApiStatus;
  updating: boolean;
  performAction: (action: string) => Promise<void>;
  isDisabled?: boolean;
  size?: 'sm' | 'lg';
}> = ({ status, updating, performAction, isDisabled = false, size }) => {
  if (updating) {
    return <Spinner size="sm" />;
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
      <span style={{ display: 'inline-flex', gap: '8px', alignSelf: 'flex-start' }}>
        <Button variant="primary" size={size} onClick={() => performAction('enable')}>
          Enable
        </Button>
        <Button variant="secondary" size={size} isDanger onClick={() => performAction('offboard')}>
          Offboard
        </Button>
      </span>
    );
  }

  return null;
};

export default SandboxApiActions;
