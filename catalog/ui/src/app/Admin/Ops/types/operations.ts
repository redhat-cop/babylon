export interface OperationHistoryEntry {
  id: string;
  operationType: 'lock' | 'unlock' | 'extend-stop' | 'extend-destroy' | 'disable-autostop' | 'scale';
  performedBy: {
    username: string;
    email: string;
    displayName?: string;
  };
  timestamp: string;
  targetScope: {
    workshopCount: number;
    namespaces: string[];
    workshopNames?: string[];
    filters: {
      stages: string[];
      namespaces: string[];
      statuses: string[];
      searchText?: string;
    };
  };
  parameters: {
    extStopDays?: number;
    extStopHours?: number;
    extDestroyDays?: number;
    extDestroyHours?: number;
    scaleCount?: number;
  };
  results: {
    totalTargets: number;
    successful: number;
    failed: number;
    errors?: OperationError[];
    executionTimeMs: number;
  };
  status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'cancelled';
  templateUsed?: {
    id: string;
    name: string;
  };
  metadata: {
    sessionId?: string;
    requestId?: string;
    clientVersion?: string;
  };
}

export interface OperationError {
  workshopName: string;
  namespace: string;
  error: string;
  code?: string;
  details?: any;
}

export interface OperationAuditLog {
  entries: OperationHistoryEntry[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
  filters: {
    dateRange: {
      start: Date;
      end: Date;
    };
    operationTypes: string[];
    users: string[];
    status: string[];
  };
}

export interface OperationHistoryFilters {
  dateRange: {
    start?: string;
    end?: string;
  };
  operationTypes: string[];
  performedBy: string[];
  status: string[];
  namespaces: string[];
  searchText: string;
}