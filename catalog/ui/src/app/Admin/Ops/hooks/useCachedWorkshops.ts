import { useMemo, useCallback } from 'react';
import useSWR, { SWRConfiguration, mutate } from 'swr';
import { Workshop, WorkshopList, WorkshopProvision, WorkshopProvisionList } from '@app/types';
import { apiPaths, fetcher } from '@app/api';

interface CacheConfig {
  workshopsTtl?: number; // TTL in seconds
  provisionsTtl?: number;
  operationHistoryTtl?: number;
  enableBackgroundRefresh?: boolean;
  staleWhileRevalidate?: boolean;
}

interface CachedWorkshopData {
  workshops: Workshop[];
  provisions: WorkshopProvision[];
  loading: boolean;
  error?: Error;
  mutate: () => void;
  lastUpdated?: Date;
}

const DEFAULT_CONFIG: Required<CacheConfig> = {
  workshopsTtl: 300, // 5 minutes
  provisionsTtl: 600, // 10 minutes
  operationHistoryTtl: 600, // 10 minutes
  enableBackgroundRefresh: true,
  staleWhileRevalidate: true,
};

// Cache manager utility
class CacheManager {
  private static instance: CacheManager;
  private cacheKeys = new Set<string>();

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  registerKey(key: string): void {
    this.cacheKeys.add(key);
  }

  // Invalidate all workshop-related caches
  invalidateWorkshopCaches(): void {
    this.cacheKeys.forEach(key => {
      if (key.includes('workshop') || key.includes('provision')) {
        mutate(key);
      }
    });
  }

  // Invalidate operation history caches
  invalidateOperationHistoryCaches(): void {
    this.cacheKeys.forEach(key => {
      if (key.includes('operation-history')) {
        mutate(key);
      }
    });
  }

  // Clear all caches
  clearAll(): void {
    this.cacheKeys.forEach(key => {
      mutate(key, undefined, { revalidate: false });
    });
    this.cacheKeys.clear();
  }
}

// Custom hook for cached workshop data
export function useCachedWorkshops(
  namespace: string,
  extraNamespaces: string[] = [],
  config: CacheConfig = {}
): CachedWorkshopData {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const cacheManager = CacheManager.getInstance();

  // All namespaces to fetch from
  const allNamespaces = useMemo(() => {
    return namespace ? [namespace, ...extraNamespaces] : [];
  }, [namespace, extraNamespaces]);

  // Workshop cache key
  const workshopsKey = useMemo(() => {
    const key = `workshops-${allNamespaces.join('-')}-${mergedConfig.workshopsTtl}`;
    cacheManager.registerKey(key);
    return key;
  }, [allNamespaces, mergedConfig.workshopsTtl, cacheManager]);

  // Provisions cache key
  const provisionsKey = useMemo(() => {
    const key = `provisions-${allNamespaces.join('-')}-${mergedConfig.provisionsTtl}`;
    cacheManager.registerKey(key);
    return key;
  }, [allNamespaces, mergedConfig.provisionsTtl, cacheManager]);

  // SWR configuration with caching
  const swrConfig: SWRConfiguration = useMemo(() => ({
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: mergedConfig.workshopsTtl * 1000,
    errorRetryCount: 3,
    errorRetryInterval: 5000,
    refreshInterval: mergedConfig.enableBackgroundRefresh ? mergedConfig.workshopsTtl * 1000 : 0,
    keepPreviousData: mergedConfig.staleWhileRevalidate,
  }), [mergedConfig]);

  // Fetch workshops with caching
  const { data: workshopsData, error: workshopsError, isValidating: workshopsLoading } = useSWR<WorkshopList[]>(
    allNamespaces.length > 0 ? workshopsKey : null,
    async () => {
      const promises = allNamespaces.map(ns =>
        fetcher(apiPaths.WORKSHOPS({ namespace: ns, limit: 1000 }))
      );
      return Promise.all(promises);
    },
    swrConfig
  );

  // Fetch provisions with caching
  const { data: provisionsData, error: provisionsError, isValidating: provisionsLoading } = useSWR<WorkshopProvisionList[]>(
    workshopsData && workshopsData.length > 0 ? provisionsKey : null,
    async () => {
      const allWorkshops = workshopsData!.flatMap(wsList => wsList.items);
      const promises = allWorkshops.map(ws =>
        fetcher(apiPaths.WORKSHOP_PROVISIONS({
          workshopName: ws.metadata.name,
          namespace: ws.metadata.namespace,
          limit: 100
        }))
      );
      return Promise.all(promises);
    },
    swrConfig
  );

  // Combine and memoize results
  const result = useMemo((): CachedWorkshopData => {
    const workshops = workshopsData?.flatMap(wsList => wsList.items) || [];
    const provisions = provisionsData?.flatMap(provList => provList.items) || [];
    const loading = workshopsLoading || provisionsLoading;
    const error = workshopsError || provisionsError;

    return {
      workshops,
      provisions,
      loading,
      error,
      mutate: () => {
        mutate(workshopsKey);
        mutate(provisionsKey);
      },
      lastUpdated: new Date(),
    };
  }, [workshopsData, provisionsData, workshopsLoading, provisionsLoading, workshopsError, provisionsError, workshopsKey, provisionsKey]);

  return result;
}

// Hook for operation history caching
export function useCachedOperationHistory(
  namespace: string,
  config: CacheConfig = {}
) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const cacheManager = CacheManager.getInstance();

  const cacheKey = useMemo(() => {
    const key = `operation-history-${namespace}-${mergedConfig.operationHistoryTtl}`;
    cacheManager.registerKey(key);
    return key;
  }, [namespace, mergedConfig.operationHistoryTtl, cacheManager]);

  const swrConfig: SWRConfiguration = useMemo(() => ({
    revalidateOnFocus: false,
    dedupingInterval: mergedConfig.operationHistoryTtl * 1000,
    refreshInterval: mergedConfig.enableBackgroundRefresh ? mergedConfig.operationHistoryTtl * 1000 : 0,
    keepPreviousData: mergedConfig.staleWhileRevalidate,
  }), [mergedConfig]);

  return useSWR(
    cacheKey,
    async () => {
      // Implementation would fetch operation history from API
      // For now, return empty array as placeholder
      return [];
    },
    swrConfig
  );
}

// Hook to invalidate caches after operations
export function useCacheInvalidation() {
  const cacheManager = CacheManager.getInstance();

  const invalidateAfterOperation = useCallback((operationType: string) => {
    // Invalidate workshop caches immediately after operations
    setTimeout(() => {
      cacheManager.invalidateWorkshopCaches();

      // Add to operation history cache
      setTimeout(() => {
        cacheManager.invalidateOperationHistoryCaches();
      }, 1000);
    }, 500);
  }, [cacheManager]);

  const invalidateAll = useCallback(() => {
    cacheManager.clearAll();
  }, [cacheManager]);

  return {
    invalidateAfterOperation,
    invalidateAll,
    invalidateWorkshops: cacheManager.invalidateWorkshopCaches.bind(cacheManager),
    invalidateOperationHistory: cacheManager.invalidateOperationHistoryCaches.bind(cacheManager),
  };
}

export { CacheManager };