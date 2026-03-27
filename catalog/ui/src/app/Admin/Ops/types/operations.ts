export interface OperationHistoryEntry {
  id: string;
  operationType: 'lock' | 'unlock' | 'extend-stop' | 'extend-destroy' | 'disable-autostop' | 'scale' | 'restart' | 'clone' | 'health-check';
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
    restartStrategy?: 'graceful' | 'immediate';
    restartDelay?: number; // seconds
    cloneNamePrefix?: string;
    cloneNamespace?: string;
    preserveUsers?: boolean;
    healthCheckTimeout?: number; // seconds
    healthCheckRetries?: number;
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

export interface ScheduledOperation {
  id: string;
  operationType: 'lock' | 'unlock' | 'extend-stop' | 'extend-destroy' | 'disable-autostop' | 'scale' | 'restart' | 'clone' | 'health-check';
  scheduledBy: {
    username: string;
    email: string;
    displayName?: string;
  };
  createdAt: string;
  scheduledFor: string; // ISO datetime
  cronExpression?: string; // for recurring operations
  timezone: string;
  parameters: {
    extStopDays?: number;
    extStopHours?: number;
    extDestroyDays?: number;
    extDestroyHours?: number;
    scaleCount?: number;
    restartStrategy?: 'graceful' | 'immediate';
    restartDelay?: number; // seconds
    cloneNamePrefix?: string;
    cloneNamespace?: string;
    preserveUsers?: boolean;
    healthCheckTimeout?: number; // seconds
    healthCheckRetries?: number;
  };
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
  status: 'pending' | 'scheduled' | 'executing' | 'completed' | 'failed' | 'cancelled';
  executionHistory: ScheduledExecutionEntry[];
  metadata: {
    isRecurring: boolean;
    nextExecution?: string;
    totalExecutions?: number;
    maxExecutions?: number;
    sessionId?: string;
    requestId?: string;
    clientVersion?: string;
  };
}

export interface ScheduledExecutionEntry {
  id: string;
  executedAt: string;
  status: 'completed' | 'failed' | 'cancelled';
  results?: {
    totalTargets: number;
    successful: number;
    failed: number;
    errors?: OperationError[];
    executionTimeMs: number;
  };
  error?: string;
}

export interface SchedulePreset {
  id: string;
  label: string;
  description: string;
  cronExpression?: string;
  relativeTo?: 'now' | 'endOfDay' | 'startOfDay';
  offsetMinutes?: number;
  isRecurring: boolean;
}

export interface CronExpression {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
  expression: string;
  description: string;
}

export interface ScheduledOperationFilters {
  dateRange: {
    start?: string;
    end?: string;
  };
  operationTypes: string[];
  scheduledBy: string[];
  status: string[];
  namespaces: string[];
  isRecurring: boolean[];
  searchText: string;
}