import { getAnarchySubject } from '@app/api';
import { ResourceHandle } from '@app/types';
import { useEffect, useRef, useState } from 'react';

function usePoolStatus(resourceHandles: ResourceHandle[]): { available: number; total: number; taken: number } {
  const [available, setAvailable] = useState(-1);
  const isMounted = useRef(true);
  const total = resourceHandles.length;
  let taken = 0;
  const resourceHandlePromises = [];
  for (const resourceHandle of resourceHandles) {
    if (resourceHandle.spec.resourceClaim) {
      taken = taken + 1;
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
    if (isMounted.current) setAvailable(values.reduce((a, b) => a + b, 0));
  });

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  return {
    available,
    total,
    taken,
  };
}

export default usePoolStatus;
