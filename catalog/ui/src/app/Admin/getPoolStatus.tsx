import { useCallback, useEffect, useRef, useState } from 'react';
import { getAnarchySubject } from '@app/api';
import { ResourceHandle } from '@app/types';

export function useIsMounted() {
  const isMounted = useRef(false);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  return useCallback(() => isMounted.current, []);
}

function getPoolStatus(resourceHandles: ResourceHandle[]): { available: number; total: number; taken: number } {
  const total = resourceHandles.length;
  let available = 0;
  let taken = 0;
  for (const resourceHandle of resourceHandles) {
    if (resourceHandle.spec.resourceClaim) {
      taken = taken + 1;
    } else if (resourceHandle.status) {
      if (resourceHandle.status.ready && resourceHandle.status.healthy) {
        available = available + 1;
      }
    }
  }

  return {
    available,
    total,
    taken,
  };
}

export default getPoolStatus;
