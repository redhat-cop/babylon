import { useState, useCallback, useMemo } from 'react';

export interface PaginationConfig {
  pageSize: number;
  maxItemsBeforeVirtualization: number;
  prefetchPages: number;
}

export interface PaginationState<T> {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  startIndex: number;
  endIndex: number;
  currentPageItems: T[];
}

export interface PaginationActions {
  goToPage: (page: number) => void;
  goToNextPage: () => void;
  goToPrevPage: () => void;
  goToFirstPage: () => void;
  goToLastPage: () => void;
  changePageSize: (newSize: number) => void;
  jumpToItem: (itemIndex: number) => void;
}

const DEFAULT_CONFIG: PaginationConfig = {
  pageSize: 50,
  maxItemsBeforeVirtualization: 1000,
  prefetchPages: 2,
};

export function usePagination<T>(
  items: T[],
  config: Partial<PaginationConfig> = {}
): [PaginationState<T>, PaginationActions] {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(mergedConfig.pageSize);

  const totalItems = items.length;
  const totalPages = Math.ceil(totalItems / pageSize);

  const state: PaginationState<T> = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalItems);
    const currentPageItems = items.slice(startIndex, endIndex);

    return {
      currentPage,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1,
      startIndex,
      endIndex,
      currentPageItems,
    };
  }, [currentPage, pageSize, totalItems, totalPages, items]);

  const actions: PaginationActions = useMemo(() => ({
    goToPage: useCallback((page: number) => {
      if (page >= 1 && page <= totalPages) {
        setCurrentPage(page);
      }
    }, [totalPages]),

    goToNextPage: useCallback(() => {
      if (state.hasNextPage) {
        setCurrentPage(prev => prev + 1);
      }
    }, [state.hasNextPage]),

    goToPrevPage: useCallback(() => {
      if (state.hasPrevPage) {
        setCurrentPage(prev => prev - 1);
      }
    }, [state.hasPrevPage]),

    goToFirstPage: useCallback(() => {
      setCurrentPage(1);
    }, []),

    goToLastPage: useCallback(() => {
      setCurrentPage(totalPages);
    }, [totalPages]),

    changePageSize: useCallback((newSize: number) => {
      const newTotalPages = Math.ceil(totalItems / newSize);
      const newCurrentPage = Math.min(currentPage, newTotalPages);

      setPageSize(newSize);
      setCurrentPage(newCurrentPage);
    }, [totalItems, currentPage]),

    jumpToItem: useCallback((itemIndex: number) => {
      if (itemIndex >= 0 && itemIndex < totalItems) {
        const targetPage = Math.ceil((itemIndex + 1) / pageSize);
        setCurrentPage(targetPage);
      }
    }, [totalItems, pageSize]),
  }), [state, totalPages, totalItems, currentPage, pageSize]);

  return [state, actions];
}

// Hook for performance monitoring
export function usePaginationPerformance<T>(
  items: T[],
  paginationState: PaginationState<T>
) {
  const performance = useMemo(() => {
    const itemsPerSecond = items.length / (performance.now() / 1000);
    const memoryUsageEstimate = items.length * 1024; // Rough estimate in bytes
    const shouldVirtualize = items.length > 1000;
    const renderTime = performance.now();

    return {
      totalItems: items.length,
      pageSize: paginationState.pageSize,
      currentPageItems: paginationState.currentPageItems.length,
      memoryUsageEstimate,
      shouldVirtualize,
      renderTime,
      itemsPerSecond,
      performance: {
        excellent: items.length < 100,
        good: items.length < 500,
        fair: items.length < 1000,
        poor: items.length >= 1000,
      },
    };
  }, [items, paginationState]);

  return performance;
}

// Virtualization hook for very large datasets
export function useVirtualization<T>(
  items: T[],
  containerHeight: number,
  itemHeight: number,
  overscan: number = 5
) {
  const [scrollTop, setScrollTop] = useState(0);

  const visibleRange = useMemo(() => {
    const visibleStart = Math.floor(scrollTop / itemHeight);
    const visibleEnd = Math.min(
      visibleStart + Math.ceil(containerHeight / itemHeight),
      items.length - 1
    );

    const startIndex = Math.max(0, visibleStart - overscan);
    const endIndex = Math.min(items.length - 1, visibleEnd + overscan);

    return {
      startIndex,
      endIndex,
      visibleItems: items.slice(startIndex, endIndex + 1),
      totalHeight: items.length * itemHeight,
      offsetY: startIndex * itemHeight,
    };
  }, [scrollTop, itemHeight, containerHeight, items, overscan]);

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  return {
    ...visibleRange,
    handleScroll,
    scrollTop,
  };
}

// Smart loading hook that combines pagination with virtualization
export function useSmartPagination<T>(
  items: T[],
  config: Partial<PaginationConfig> = {}
) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const [paginationState, paginationActions] = usePagination(items, mergedConfig);

  const shouldVirtualize = items.length > mergedConfig.maxItemsBeforeVirtualization;
  const performance = usePaginationPerformance(items, paginationState);

  // Adaptive page size based on performance
  const adaptivePageSize = useMemo(() => {
    if (items.length < 100) return 50;
    if (items.length < 500) return 100;
    if (items.length < 1000) return 200;
    return 500; // For very large datasets
  }, [items.length]);

  // Auto-adjust page size if performance is poor
  const optimizePageSize = useCallback(() => {
    if (performance.poor && paginationState.pageSize > 50) {
      paginationActions.changePageSize(Math.max(50, paginationState.pageSize / 2));
    }
  }, [performance.poor, paginationState.pageSize, paginationActions]);

  return {
    ...paginationState,
    ...paginationActions,
    performance,
    shouldVirtualize,
    adaptivePageSize,
    optimizePageSize,
    config: mergedConfig,
  };
}