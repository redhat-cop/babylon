import { useEffect, useRef } from 'react';
import { apiPaths, apiFetch, patchWhiteGloveRequest } from '@app/api';
import { WhiteGloveRequest } from '@app/types';
import { DEMO_DOMAIN } from '@app/util';

async function fetchJson(path: string) {
  const resp = await apiFetch(path);
  return resp.json();
}

async function isServiceRunning(
  svcName: string,
  svcNamespace: string,
  svcType: string,
): Promise<boolean> {
  try {
    if (svcType === 'workshops') {
      const workshop = await fetchJson(
        apiPaths.WORKSHOP({ namespace: svcNamespace, workshopName: svcName }),
      );
      return (workshop.status?.provisionCount?.active || 0) >= 1;
    } else if (svcType === 'services') {
      const rc = await fetchJson(
        apiPaths.RESOURCE_CLAIM({ namespace: svcNamespace, resourceClaimName: svcName }),
      );
      const state = rc.status?.summary?.state;
      return state === 'started' || state === 'running';
    } else if (svcType === 'selfpacedlabs') {
      const spl = await fetchJson(
        apiPaths.SELF_PACED_LAB({ namespace: svcNamespace, selfPacedLabName: svcName }),
      );
      const poolCount = spl.status?.poolCount;
      return (poolCount?.ready || 0) + (poolCount?.assigned || 0) >= 1;
    }
  } catch {
    return false;
  }
  return false;
}

export default function useWhiteGloveRunningCheck(
  wgrItems: WhiteGloveRequest[],
  onUpdate?: () => void,
) {
  const checkingRef = useRef(false);

  useEffect(() => {
    if (checkingRef.current) return;

    const approvedItems = wgrItems.filter((wgr) => {
      const ann = wgr.metadata.annotations || {};
      const state = ann[`${DEMO_DOMAIN}/state`];
      const svcName = ann[`${DEMO_DOMAIN}/service-name`];
      return state === 'approved' && svcName;
    });

    if (approvedItems.length === 0) return;

    checkingRef.current = true;

    Promise.all(
      approvedItems.map(async (wgr) => {
        const ann = wgr.metadata.annotations || {};
        const svcName = ann[`${DEMO_DOMAIN}/service-name`];
        const svcNamespace = ann[`${DEMO_DOMAIN}/service-namespace`];
        const svcType = ann[`${DEMO_DOMAIN}/service-type`] || 'services';

        const running = await isServiceRunning(svcName, svcNamespace, svcType);
        if (running) {
          await patchWhiteGloveRequest({
            namespace: wgr.metadata.namespace,
            name: wgr.metadata.name,
            patch: {
              metadata: {
                annotations: { [`${DEMO_DOMAIN}/state`]: 'running' },
              },
            },
          });
          return true;
        }
        return false;
      }),
    ).then((results) => {
      checkingRef.current = false;
      if (results.some(Boolean) && onUpdate) {
        onUpdate();
      }
    });
  }, [wgrItems, onUpdate]);
}
