import React, { useState } from 'react';
import { NumberInput, Spinner } from '@patternfly/react-core';
import { ResourcePool } from '@app/types';
import { patchResourcePool } from '@app/api';

const ResourcePoolMinAvailableInput: React.FC<{
  onChange?: (resourcePool: ResourcePool) => void;
  resourcePool: ResourcePool;
}> = ({ onChange, resourcePool }) => {
  const [minAvailable, setMinAvailable] = useState(resourcePool.spec.minAvailable);
  const [minAvailableInputTimeout, setMinAvailableInputTimeout] = useState(null);
  const [minAvailableUpdating, setMinAvailableUpdating] = useState(false);

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
        n
      )
    );
  }

  async function updateMinAvailable(n: number) {
    setMinAvailableUpdating(true);
    await patchResourcePool(resourcePool.metadata.name, { spec: { minAvailable: n } });
    resourcePool.spec.minAvailable = n;
    setMinAvailable(n);
    setMinAvailableUpdating(false);
    if (onChange) {
      onChange(resourcePool);
    }
  }

  return (
    <>
      <NumberInput
        min={0}
        max={99}
        onChange={(event: any) => queueMinAvailableUpdate(parseInt(event.target.value))}
        onMinus={() => queueMinAvailableUpdate(minAvailable - 1)}
        onPlus={() => queueMinAvailableUpdate(minAvailable + 1)}
        value={minAvailable}
      />
      {minAvailableUpdating ? [' ', <Spinner key="spinner" isSVG size="md" />] : null}
    </>
  );
};

export default ResourcePoolMinAvailableInput;
