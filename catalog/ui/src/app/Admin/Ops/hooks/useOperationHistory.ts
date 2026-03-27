import { useCallback, useState } from 'react';
import useSWR from 'swr';
import { fetcher, apiPaths } from '@app/api';
import { OperationHistoryEntry, OperationHistoryFilters, OperationAuditLog } from '../types/operations';

export function useOperationHistory() {
  const [filters, setFilters] = useState<OperationHistoryFilters>({
    dateRange: {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
      end: new Date().toISOString(),
    },
    operationTypes: [],
    performedBy: [],
    status: [],
    namespaces: [],
    searchText: '',
  });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Build API query string
  const queryString = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
    ...(filters.dateRange.start && { startDate: filters.dateRange.start }),
    ...(filters.dateRange.end && { endDate: filters.dateRange.end }),
    ...(filters.operationTypes.length && { operationTypes: filters.operationTypes.join(',') }),
    ...(filters.performedBy.length && { performedBy: filters.performedBy.join(',') }),
    ...(filters.status.length && { status: filters.status.join(',') }),
    ...(filters.namespaces.length && { namespaces: filters.namespaces.join(',') }),
    ...(filters.searchText && { search: filters.searchText }),
  }).toString();

  const { data, error, mutate, isValidating } = useSWR<OperationAuditLog>(
    `/api/ops/history?${queryString}`,
    fetcher,
    {
      refreshInterval: 10000, // Refresh every 10 seconds for real-time updates
      revalidateOnFocus: true,
    }
  );

  const updateFilters = useCallback((newFilters: Partial<OperationHistoryFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    setPage(1); // Reset to first page when filters change
  }, []);

  const goToPage = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  const changePageSize = useCallback((newPageSize: number) => {
    setPageSize(newPageSize);
    setPage(1); // Reset to first page when page size changes
  }, []);

  const refreshHistory = useCallback(() => {
    mutate();
  }, [mutate]);

  // Mock data for development (remove when backend is ready)
  const mockData: OperationAuditLog = {
    entries: [
      {
        id: '1',
        operationType: 'scale',
        performedBy: {
          username: 'jdisrael',
          email: 'jdisrael@redhat.com',
          displayName: 'Joshua Israeli',
        },
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        targetScope: {
          workshopCount: 15,
          namespaces: ['user-test-namespace'],
          filters: {
            stages: ['prod'],
            namespaces: ['user-test-namespace'],
            statuses: ['Running'],
            searchText: '',
          },
        },
        parameters: {
          scaleCount: 0,
        },
        results: {
          totalTargets: 15,
          successful: 14,
          failed: 1,
          errors: [
            {
              workshopName: 'test-workshop-broken',
              namespace: 'user-test-namespace',
              error: 'Resource not found',
              code: 'NOT_FOUND',
            },
          ],
          executionTimeMs: 45000,
        },
        status: 'completed',
        templateUsed: {
          id: '2',
          name: 'Emergency Scale Down',
        },
        metadata: {
          sessionId: 'sess_' + Math.random().toString(36),
          requestId: 'req_' + Math.random().toString(36),
          clientVersion: '2.0.0',
        },
      },
      {
        id: '2',
        operationType: 'lock',
        performedBy: {
          username: 'admin',
          email: 'admin@redhat.com',
          displayName: 'System Administrator',
        },
        timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
        targetScope: {
          workshopCount: 8,
          namespaces: ['production'],
          filters: {
            stages: ['prod'],
            namespaces: ['production'],
            statuses: ['Running', 'Provisioning'],
          },
        },
        parameters: {},
        results: {
          totalTargets: 8,
          successful: 8,
          failed: 0,
          executionTimeMs: 12000,
        },
        status: 'completed',
        templateUsed: {
          id: '3',
          name: 'Maintenance Lock',
        },
        metadata: {
          sessionId: 'sess_' + Math.random().toString(36),
          requestId: 'req_' + Math.random().toString(36),
          clientVersion: '2.0.0',
        },
      },
    ],
    pagination: {
      page: 1,
      pageSize: 20,
      totalCount: 2,
      totalPages: 1,
    },
    filters: {
      dateRange: {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        end: new Date(),
      },
      operationTypes: [],
      users: [],
      status: [],
    },
  };

  return {
    data: data || mockData, // Use mock data when no real data available
    error,
    isLoading: !data && !error,
    isValidating,
    filters,
    updateFilters,
    page,
    pageSize,
    goToPage,
    changePageSize,
    refreshHistory,
  };
}