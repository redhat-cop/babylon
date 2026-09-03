import { useMemo, useState, useCallback } from 'react';
import useSWR from 'swr';
import { apiPaths, silentFetcher, setTenantClusterAction } from '@app/api';
import { ResourceClaim } from '@app/types';
import { BABYLON_DOMAIN } from '@app/util';

export type SandboxApiStatus = 'loading' | 'not onboarded' | 'available' | 'disabled';

interface UseSandboxApiResult {
  status: SandboxApiStatus;
  placementCount: number;
  maxPlacements: number | null;
  updating: boolean;
  pendingAction: string | null;
  performAction: (action: string) => Promise<void>;
  resourceClaimCreationTimestamp: string | null;
  isRunning: boolean;
}

export default function useSandboxApi(
  clusterName: string,
  namespace: string,
  resourceClaimName: string,
): UseSandboxApiResult {
  const { data: placementsData, isLoading, mutate: mutatePlacements } = useSWR(
    clusterName ? apiPaths.SANDBOX_CLUSTER_PLACEMENTS({ clusterName }) : null,
    silentFetcher,
    { shouldRetryOnError: false, refreshInterval: 8000, suspense: false },
  );
  const { data: configData, mutate: mutateConfig } = useSWR(
    clusterName && placementsData?.placements
      ? apiPaths.SANDBOX_CLUSTER_CONFIG({ clusterName })
      : null,
    silentFetcher,
    { shouldRetryOnError: false, refreshInterval: 8000, suspense: false },
  );
  const { data: resourceClaim } = useSWR<ResourceClaim>(
    resourceClaimName ? apiPaths.RESOURCE_CLAIM({ namespace, resourceClaimName }) : null,
    silentFetcher,
    { shouldRetryOnError: false, refreshInterval: 8000, suspense: false },
  );

  const pendingAction = useMemo(() => {
    const raw = resourceClaim?.metadata?.annotations?.[`${BABYLON_DOMAIN}/tenant-cluster-action`];
    if (!raw) return null;
    try {
      return JSON.parse(raw)?.action || null;
    } catch {
      return null;
    }
  }, [resourceClaim?.metadata?.annotations]);

  const status: SandboxApiStatus = useMemo(() => {
    if (isLoading) return 'loading';
    if (placementsData?.placements) {
      return configData?.valid === true ? 'available' : 'disabled';
    }
    return 'not onboarded';
  }, [isLoading, placementsData, configData]);

  const placementCount = placementsData?.placements?.length ?? 0;
  const maxPlacements: number | null = configData?.max_placements ?? null;
  const [updating, setUpdating] = useState(false);

  const performAction = useCallback(async (action: string) => {
    setUpdating(true);
    try {
      await setTenantClusterAction(namespace, resourceClaimName, action);
      mutatePlacements();
      mutateConfig();
    } finally {
      setUpdating(false);
    }
  }, [namespace, resourceClaimName, mutatePlacements, mutateConfig]);

  const resourceClaimCreationTimestamp = resourceClaim?.metadata?.creationTimestamp ?? null;

  const isRunning = useMemo(() => {
    const summaryState = resourceClaim?.status?.summary?.state;
    if (summaryState) {
      return summaryState === 'started' || summaryState === 'running';
    }
    const resource = resourceClaim?.status?.resources?.[0]?.state;
    return resource?.kind === 'AnarchySubject' && resource.spec?.vars?.current_state === 'started';
  }, [resourceClaim?.status?.summary?.state, resourceClaim?.status?.resources]);

  return { status, placementCount, maxPlacements, updating, pendingAction, performAction, resourceClaimCreationTimestamp, isRunning };
}
