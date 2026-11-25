import { useCallback, useEffect, useRef } from 'react';
import type { ResourceHandle } from '@app/types';

export function useIsMounted() {
  const isMountedRef = useRef(false);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return useCallback(() => isMountedRef.current, []);
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
