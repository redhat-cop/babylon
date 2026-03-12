import { useMemo } from 'react';
import useSWR from 'swr';
import { apiPaths, fetcherItemsInAllPages } from '@app/api';
import { ResourceClaim, Workshop } from '@app/types';
import { compareK8sObjectsArr, FETCH_BATCH_LIMIT, isResourceClaimPartOfWorkshop } from '@app/util';

const SERVICE_QUOTA_LIMIT = 5;

interface UseServiceQuotaOptions {
  namespace: string | null | undefined;
  isAdmin?: boolean;
}

interface UseServiceQuotaResult {
  standaloneServicesCount: number;
  workshopsCount: number;
  currentServicesCount: number;
  isQuotaExceeded: boolean;
  quotaLimit: number;
  isLoading: boolean;
}

/**
 * Hook to check user's service quota.
 *
 * This hook fetches the user's ResourceClaims and Workshops to calculate:
 * - standaloneServicesCount: Number of services not part of a workshop
 * - workshopsCount: Number of workshops (each counts as 1 regardless of seats)
 * - currentServicesCount: Total services count (standalone + workshops)
 * - isQuotaExceeded: Whether the user has reached the quota limit
 *
 * Quota Policy:
 * - Each standalone service counts as 1
 * - Each workshop counts as 1 (regardless of how many ResourceClaims/seats it has)
 * - Admins bypass the quota check
 * - Quota limit is 5 services
 */
export default function useServiceQuota({
  namespace,
  isAdmin = false,
}: UseServiceQuotaOptions): UseServiceQuotaResult {
  // Fetch user's existing services
  const { data: userResourceClaims, isLoading: isLoadingResourceClaims } = useSWR<ResourceClaim[]>(
    namespace
      ? apiPaths.RESOURCE_CLAIMS({
          namespace,
          limit: 'ALL',
        })
      : null,
    () =>
      fetcherItemsInAllPages((continueId) =>
        apiPaths.RESOURCE_CLAIMS({
          namespace,
          limit: FETCH_BATCH_LIMIT,
          continueId,
        }),
      ),
    {
      refreshInterval: 8000,
      compare: compareK8sObjectsArr,
    },
  );

  // Fetch user's existing workshops
  const { data: userWorkshops, isLoading: isLoadingWorkshops } = useSWR<Workshop[]>(
    namespace
      ? apiPaths.WORKSHOPS({
          namespace,
          limit: 'ALL',
        })
      : null,
    () =>
      fetcherItemsInAllPages((continueId) =>
        apiPaths.WORKSHOPS({
          namespace,
          limit: FETCH_BATCH_LIMIT,
          continueId,
        }),
      ),
    {
      refreshInterval: 8000,
      compare: compareK8sObjectsArr,
    },
  );

  // Calculate current standalone services (not part of a workshop)
  const standaloneServicesCount = useMemo(
    () =>
      Array.isArray(userResourceClaims)
        ? userResourceClaims.filter((r) => !isResourceClaimPartOfWorkshop(r) && !r.metadata.deletionTimestamp).length
        : 0,
    [userResourceClaims],
  );

  // Calculate current active workshops count (each workshop counts as 1)
  const workshopsCount = useMemo(
    () =>
      Array.isArray(userWorkshops)
        ? userWorkshops.filter((w) => !w.metadata.deletionTimestamp).length
        : 0,
    [userWorkshops],
  );

  // Total current services for quota: standalone services + workshops
  const currentServicesCount = standaloneServicesCount + workshopsCount;

  // Quota exceeded check (admins bypass)
  const isQuotaExceeded = !isAdmin && currentServicesCount >= SERVICE_QUOTA_LIMIT;

  const isLoading = isLoadingResourceClaims || isLoadingWorkshops;

  return {
    standaloneServicesCount,
    workshopsCount,
    currentServicesCount,
    isQuotaExceeded,
    quotaLimit: SERVICE_QUOTA_LIMIT,
    isLoading,
  };
}
