import useSWR from 'swr';
import { apiPaths, fetcher, SystemStatus } from '@app/api';

/**
 * Hook to get the current system status including ordering blocks.
 * 
 * This hook fetches the system status from the API and provides:
 * - workshops_ordering_blocked: Whether workshop ordering is currently blocked
 * - workshops_ordering_blocked_message: Custom message to show when blocked
 * - services_ordering_blocked: Whether service ordering is currently blocked
 * - services_ordering_blocked_message: Custom message to show when blocked
 * 
 * The status is refreshed every 30 seconds to pick up changes quickly.
 */
export default function useSystemStatus() {
  const { data, error, isLoading, mutate } = useSWR<SystemStatus>(
    apiPaths.SYSTEM_STATUS(),
    fetcher,
    {
      refreshInterval: 30000, // Refresh every 30 seconds
      revalidateOnFocus: true,
      dedupingInterval: 5000,
      fallbackData: {
        workshops_ordering_blocked: false,
        workshops_ordering_blocked_message: '',
        services_ordering_blocked: false,
        services_ordering_blocked_message: '',
      },
    }
  );

  return {
    systemStatus: data,
    isLoading,
    error,
    mutate,
    // Convenience getters
    isWorkshopOrderingBlocked: data?.workshops_ordering_blocked ?? false,
    workshopOrderingBlockedMessage: data?.workshops_ordering_blocked_message ?? '',
    isServiceOrderingBlocked: data?.services_ordering_blocked ?? false,
    serviceOrderingBlockedMessage: data?.services_ordering_blocked_message ?? '',
  };
}

