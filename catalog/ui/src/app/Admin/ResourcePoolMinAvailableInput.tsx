import React, { useState } from 'react';
import { NumberInput, Spinner } from '@patternfly/react-core';
import { patchResourcePool } from '@app/api';
import { ResourcePool } from '@app/types';

const ResourcePoolMinAvailableInput: React.FC<{
  resourcePoolName: string;
  minAvailable: number;
  mutateFn?: (resourcePool: ResourcePool) => void;
}> = ({ resourcePoolName, minAvailable: defaultMinAvailable, mutateFn }) => {
  const [minAvailable, setMinAvailable] = useState(defaultMinAvailable);
  const [minAvailableInputTimeout, setMinAvailableInputTimeout] = useState(null);
  const [minAvailableUpdating, setMinAvailableUpdating] = useState(false);

  function handleInputChange(event: React.FormEvent<HTMLInputElement>) {
    const n = parseInt(event.currentTarget.value);
    if (isNaN(n)) return;
    return queueMinAvailableUpdate(n);
  }

  function queueMinAvailableUpdate(n: number) {
    setMinAvailable(n);
    if (minAvailableInputTimeout) {
      clearTimeout(minAvailableInputTimeout);
    }
    setMinAvailableInputTimeout(
      setTimeout(
        (n: number) => {
          updateMinAvailable(n);
        },
        1000,
        n,
      ),
    );
  }

  async function updateMinAvailable(n: number) {
    setMinAvailableUpdating(true);
    const updatedResourcePool = await patchResourcePool(resourcePoolName, { spec: { minAvailable: n } });
    setMinAvailable(n);
    setMinAvailableUpdating(false);
    if (mutateFn) {
      mutateFn(updatedResourcePool);
    }
  }

  return (
    <>
      <NumberInput
        min={0}
        max={99}
        onChange={handleInputChange}
        onMinus={() => queueMinAvailableUpdate(minAvailable - 1)}
        onPlus={() => queueMinAvailableUpdate(minAvailable + 1)}
        value={minAvailable}
      />
      {minAvailableUpdating ? [' ', <Spinner key="spinner" size="md" />] : null}
    </>
  );
};

export default ResourcePoolMinAvailableInput;
