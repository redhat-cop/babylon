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

function usePoolStatus(resourceHandles: ResourceHandle[]): { available: number; total: number; taken: number } {
  const [available, setAvailable] = useState(-1);
  const [taken, setTaken] = useState(0);
  const isMounted = useIsMounted();
  const total = resourceHandles.length;
  useEffect(() => {
    let _taken = 0;
    const resourceHandlePromises = [];
    for (const resourceHandle of resourceHandles) {
      if (resourceHandle.spec.resourceClaim) {
        _taken = _taken + 1;
      } else if (resourceHandle.spec.resources) {
        const resourcePromises = [];
        for (const resource of resourceHandle.spec.resources) {
          if (resource.reference?.kind === 'AnarchySubject') {
            resourcePromises.push(
              getAnarchySubject(resource.reference.namespace, resource.reference.name).then((anarchySubject) => {
                if (
                  anarchySubject.spec.vars?.desired_state === anarchySubject.spec.vars?.current_state &&
                  anarchySubject.spec.vars?.healthy
                ) {
                  return true;
                }
                return false;
              })
            );
          }
        }
        resourceHandlePromises.push(
          new Promise((resolve) => {
            Promise.all(resourcePromises).then((resourcesCompletedStatus) => {
              if (resourceHandle.spec.resources.length === resourcesCompletedStatus.filter(Boolean).length) {
                resolve(1);
              }
              resolve(0);
            });
          })
        );
      }
    }
    Promise.all(resourceHandlePromises).then((values) => {
      if (isMounted) {
        setAvailable(values.reduce((a, b) => a + b, 0));
        setTaken(_taken);
      }
    });
  }, []);

  return {
    available,
    total,
    taken,
  };
}

export default usePoolStatus;
