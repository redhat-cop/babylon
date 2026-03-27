import React, { useCallback, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardTitle,
  Divider,
  Drawer,
  DrawerActions,
  DrawerCloseButton,
  DrawerContent,
  DrawerContentBody,
  DrawerHead,
  DrawerPanelBody,
  DrawerPanelContent,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  Label,
  List,
  ListItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  PageSection,
  Pagination,
  SearchInput,
  Select,
  SelectList,
  SelectOption,
  MenuToggle,
  Split,
  SplitItem,
  Title,
  Toolbar,
  ToolbarContent,
  ToolbarFilter,
  ToolbarGroup,
  ToolbarItem,
  Tooltip,
} from '@patternfly/react-core';
import CalendarAltIcon from '@patternfly/react-icons/dist/js/icons/calendar-alt-icon';
import ClockIcon from '@patternfly/react-icons/dist/js/icons/clock-icon';
import ExclamationCircleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-circle-icon';
import CheckCircleIcon from '@patternfly/react-icons/dist/js/icons/check-circle-icon';
import InProgressIcon from '@patternfly/react-icons/dist/js/icons/in-progress-icon';
import PauseIcon from '@patternfly/react-icons/dist/js/icons/pause-icon';
import TimesIcon from '@patternfly/react-icons/dist/js/icons/times-icon';
import EditIcon from '@patternfly/react-icons/dist/js/icons/edit-icon';
import TrashIcon from '@patternfly/react-icons/dist/js/icons/trash-icon';
import SyncAltIcon from '@patternfly/react-icons/dist/js/icons/sync-alt-icon';
import SearchIcon from '@patternfly/react-icons/dist/js/icons/search-icon';

import { ScheduledOperation, ScheduledOperationFilters } from '../../types/operations';

interface ScheduledOperationsPanelProps {
  isVisible: boolean;
  onClose: () => void;
  onEdit?: (operation: ScheduledOperation) => void;
  onCancel?: (operation: ScheduledOperation) => void;
  onRetry?: (operation: ScheduledOperation) => void;
}

// Mock data for demonstration
const mockScheduledOperations: ScheduledOperation[] = [
  {
    id: 'sched-001',
    operationType: 'extend-stop',
    scheduledBy: {
      username: 'admin',
      email: 'admin@example.com',
      displayName: 'Admin User',
    },
    createdAt: '2026-03-26T14:30:00Z',
    scheduledFor: '2026-03-27T02:00:00Z',
    timezone: 'UTC',
    parameters: {
      extStopDays: 1,
      extStopHours: 0,
    },
    targetScope: {
      workshopCount: 15,
      namespaces: ['openshift-workshop', 'kubernetes-training'],
      filters: {
        stages: ['dev', 'test'],
        namespaces: ['openshift-workshop'],
        statuses: ['running'],
      },
    },
    status: 'scheduled',
    executionHistory: [],
    metadata: {
      isRecurring: false,
      sessionId: 'sess-001',
    },
  },
  {
    id: 'sched-002',
    operationType: 'scale',
    scheduledBy: {
      username: 'devops',
      email: 'devops@example.com',
      displayName: 'DevOps Team',
    },
    createdAt: '2026-03-25T16:45:00Z',
    scheduledFor: '2026-03-27T18:00:00Z',
    cronExpression: '0 18 * * 5',
    timezone: 'America/New_York',
    parameters: {
      scaleCount: 0,
    },
    targetScope: {
      workshopCount: 8,
      namespaces: ['test-env'],
      filters: {
        stages: ['test'],
        namespaces: ['test-env'],
        statuses: ['running'],
      },
    },
    status: 'scheduled',
    executionHistory: [
      {
        id: 'exec-001',
        executedAt: '2026-03-19T18:00:00Z',
        status: 'completed',
        results: {
          totalTargets: 8,
          successful: 8,
          failed: 0,
          executionTimeMs: 15420,
        },
      },
    ],
    metadata: {
      isRecurring: true,
      nextExecution: '2026-04-03T18:00:00Z',
      totalExecutions: 1,
      maxExecutions: 10,
    },
  },
  {
    id: 'sched-003',
    operationType: 'health-check',
    scheduledBy: {
      username: 'monitor',
      email: 'monitor@example.com',
      displayName: 'Monitoring System',
    },
    createdAt: '2026-03-26T12:00:00Z',
    scheduledFor: '2026-03-26T15:00:00Z',
    timezone: 'UTC',
    parameters: {
      healthCheckTimeout: 30,
      healthCheckRetries: 3,
    },
    targetScope: {
      workshopCount: 42,
      namespaces: ['prod-workshops'],
      filters: {
        stages: ['prod'],
        namespaces: ['prod-workshops'],
        statuses: ['running'],
      },
    },
    status: 'executing',
    executionHistory: [],
    metadata: {
      isRecurring: false,
    },
  },
  {
    id: 'sched-004',
    operationType: 'restart',
    scheduledBy: {
      username: 'admin',
      email: 'admin@example.com',
      displayName: 'Admin User',
    },
    createdAt: '2026-03-25T09:15:00Z',
    scheduledFor: '2026-03-26T12:00:00Z',
    timezone: 'UTC',
    parameters: {
      restartStrategy: 'graceful',
      restartDelay: 30,
    },
    targetScope: {
      workshopCount: 3,
      namespaces: ['debug-env'],
      filters: {
        stages: ['dev'],
        namespaces: ['debug-env'],
        statuses: ['failed'],
      },
    },
    status: 'failed',
    executionHistory: [],
    metadata: {
      isRecurring: false,
    },
  },
];

export const ScheduledOperationsPanel: React.FC<ScheduledOperationsPanelProps> = ({
  isVisible,
  onClose,
  onEdit,
  onCancel,
  onRetry,
}) => {
  const [filters, setFilters] = useState<ScheduledOperationFilters>({
    dateRange: {},
    operationTypes: [],
    scheduledBy: [],
    status: [],
    namespaces: [],
    isRecurring: [],
    searchText: '',
  });
  const [selectedOperation, setSelectedOperation] = useState<ScheduledOperation | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState<ScheduledOperation | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  // Filter operations
  const filteredOperations = useMemo(() => {
    return mockScheduledOperations.filter(op => {
      if (filters.searchText && !op.id.toLowerCase().includes(filters.searchText.toLowerCase()) &&
          !op.operationType.includes(filters.searchText.toLowerCase())) {
        return false;
      }

      if (filters.operationTypes.length > 0 && !filters.operationTypes.includes(op.operationType)) {
        return false;
      }

      if (filters.status.length > 0 && !filters.status.includes(op.status)) {
        return false;
      }

      if (filters.scheduledBy.length > 0 && !filters.scheduledBy.includes(op.scheduledBy.username)) {
        return false;
      }

      if (filters.isRecurring.length > 0) {
        const isRecurring = op.metadata.isRecurring;
        if (!filters.isRecurring.includes(isRecurring)) {
          return false;
        }
      }

      return true;
    });
  }, [filters]);

  // Paginated operations
  const paginatedOperations = useMemo(() => {
    const startIndex = (page - 1) * perPage;
    return filteredOperations.slice(startIndex, startIndex + perPage);
  }, [filteredOperations, page, perPage]);

  const getStatusIcon = (status: ScheduledOperation['status']) => {
    switch (status) {
      case 'pending':
        return <ClockIcon color="var(--pf-global--info-color--100)" />;
      case 'scheduled':
        return <CalendarAltIcon color="var(--pf-global--primary-color--100)" />;
      case 'executing':
        return <InProgressIcon color="var(--pf-global--warning-color--100)" />;
      case 'completed':
        return <CheckCircleIcon color="var(--pf-global--success-color--100)" />;
      case 'failed':
        return <ExclamationCircleIcon color="var(--pf-global--danger-color--100)" />;
      case 'cancelled':
        return <PauseIcon color="var(--pf-global--disabled-color--100)" />;
      default:
        return <ClockIcon />;
    }
  };

  const getStatusBadge = (status: ScheduledOperation['status']) => {
    const colors: Record<ScheduledOperation['status'], string> = {
      pending: 'blue',
      scheduled: 'blue',
      executing: 'orange',
      completed: 'green',
      failed: 'red',
      cancelled: 'grey',
    };
    return <Badge style={{ backgroundColor: `var(--pf-global--${colors[status]}-color--100)`, color: 'white' }}>{status}</Badge>;
  };

  const formatDateTime = (isoString: string, timezone: string) => {
    const date = new Date(isoString);
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
      timeZoneName: 'short',
    };
    return date.toLocaleDateString('en-US', options);
  };

  const getTimeToExecution = (scheduledFor: string) => {
    const now = new Date();
    const scheduled = new Date(scheduledFor);
    const diffMs = scheduled.getTime() - now.getTime();

    if (diffMs <= 0) return 'Overdue';

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `in ${diffDays} day${diffDays > 1 ? 's' : ''}`;
    } else if (diffHours > 0) {
      return `in ${diffHours} hour${diffHours > 1 ? 's' : ''}`;
    } else {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return `in ${diffMinutes} min${diffMinutes > 1 ? 's' : ''}`;
    }
  };

  const handleCancelOperation = useCallback((operation: ScheduledOperation) => {
    setShowCancelConfirm(operation);
  }, []);

  const confirmCancel = useCallback(() => {
    if (showCancelConfirm && onCancel) {
      onCancel(showCancelConfirm);
    }
    setShowCancelConfirm(null);
  }, [showCancelConfirm, onCancel]);

  const drawerContent = (
    <DrawerPanelContent isResizable defaultSize="600px" minSize="400px">
      <DrawerHead>
        <Split hasGutter>
          <SplitItem isFilled>
            <Title headingLevel="h2" size="lg">
              <CalendarAltIcon style={{ marginRight: 8 }} />
              Scheduled Operations
            </Title>
          </SplitItem>
          <SplitItem>
            <Badge>
              {filteredOperations.length} operation{filteredOperations.length !== 1 ? 's' : ''}
            </Badge>
          </SplitItem>
        </Split>
        <DrawerActions>
          <DrawerCloseButton onClick={onClose} />
        </DrawerActions>
      </DrawerHead>

      <DrawerPanelBody style={{ padding: 0 }}>
        {/* Filters Toolbar */}
        <Toolbar style={{ padding: '16px' }}>
          <ToolbarContent>
            <ToolbarItem style={{ width: '300px' }}>
              <SearchInput
                placeholder="Search operations..."
                value={filters.searchText}
                onChange={(event, value) => setFilters(prev => ({ ...prev, searchText: value }))}
                onSearch={() => {}}
                onClear={() => setFilters(prev => ({ ...prev, searchText: '' }))}
              />
            </ToolbarItem>
            <ToolbarItem>
              <Button
                variant="link"
                onClick={() => setFilters({
                  dateRange: {},
                  operationTypes: [],
                  scheduledBy: [],
                  status: [],
                  namespaces: [],
                  isRecurring: [],
                  searchText: '',
                })}
              >
                Clear filters
              </Button>
            </ToolbarItem>
          </ToolbarContent>
        </Toolbar>

        <Divider />

        {/* Operations List */}
        <div style={{ padding: '16px' }}>
          {paginatedOperations.length === 0 ? (
            <EmptyState>
              <Title headingLevel="h4" size="lg">
                <CalendarAltIcon style={{ marginRight: 8 }} />
                No scheduled operations
              </Title>
              <EmptyStateBody>
                {filteredOperations.length === 0
                  ? 'No operations have been scheduled yet. Use the "Schedule" buttons on operation cards to create scheduled operations.'
                  : 'No operations match the current filters. Try adjusting your search criteria.'
                }
              </EmptyStateBody>
              <EmptyStateActions>
                {filteredOperations.length > 0 && (
                  <Button variant="link" onClick={() => setFilters(prev => ({ ...prev, searchText: '' }))}>
                    Clear search
                  </Button>
                )}
              </EmptyStateActions>
            </EmptyState>
          ) : (
            <>
              {paginatedOperations.map(operation => (
                <Card key={operation.id} isClickable onClick={() => setSelectedOperation(operation)} style={{ marginBottom: 16 }}>
                  <CardBody>
                    <Split hasGutter>
                      <SplitItem>
                        {getStatusIcon(operation.status)}
                      </SplitItem>
                      <SplitItem isFilled>
                        <Split hasGutter>
                          <SplitItem isFilled>
                            <div>
                              <h6 style={{ margin: '0 0 4px 0' }}>
                                {operation.operationType.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                {operation.metadata.isRecurring && (
                                  <SyncAltIcon style={{ marginLeft: 8 }} />
                                )}
                              </h6>
                              <div style={{ fontSize: 'var(--pf-global--FontSize--sm)', color: 'var(--pf-global--Color--200)' }}>
                                {operation.targetScope.workshopCount} workshop{operation.targetScope.workshopCount !== 1 ? 's' : ''}
                                {' • '}
                                by {operation.scheduledBy.displayName || operation.scheduledBy.username}
                                {' • '}
                                {formatDateTime(operation.scheduledFor, operation.timezone)}
                              </div>
                              {operation.status === 'scheduled' && (
                                <div style={{ fontSize: 'var(--pf-global--FontSize--sm)', color: 'var(--pf-global--primary-color--100)' }}>
                                  {getTimeToExecution(operation.scheduledFor)}
                                </div>
                              )}
                            </div>
                          </SplitItem>
                          <SplitItem>
                            {getStatusBadge(operation.status)}
                          </SplitItem>
                        </Split>
                      </SplitItem>
                    </Split>

                    {/* Action buttons */}
                    <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                      {(operation.status === 'pending' || operation.status === 'scheduled') && (
                        <>
                          {onEdit && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEdit(operation);
                              }}
                            >
                              <EditIcon style={{ marginRight: 4 }} />
                              Edit
                            </Button>
                          )}
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelOperation(operation);
                            }}
                          >
                            <TimesIcon style={{ marginRight: 4 }} />
                            Cancel
                          </Button>
                        </>
                      )}
                      {operation.status === 'failed' && onRetry && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRetry(operation);
                          }}
                        >
                          Retry
                        </Button>
                      )}
                    </div>
                  </CardBody>
                </Card>
              ))}

              {/* Pagination */}
              <Pagination
                itemCount={filteredOperations.length}
                perPage={perPage}
                page={page}
                onSetPage={(event, pageNumber) => setPage(pageNumber)}
                onPerPageSelect={(event, newPerPage) => {
                  setPerPage(newPerPage);
                  setPage(1);
                }}
                widgetId="scheduled-operations-pagination"
                variant="bottom"
              />
            </>
          )}
        </div>
      </DrawerPanelBody>
    </DrawerPanelContent>
  );

  return (
    <>
      <Drawer isExpanded={isVisible}>
        <DrawerContent panelContent={drawerContent}>
          <DrawerContentBody />
        </DrawerContent>
      </Drawer>

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && (
        <Modal
          variant="small"
          isOpen={true}
          onClose={() => setShowCancelConfirm(null)}
          aria-labelledby="cancel-confirm-title"
        >
          <ModalHeader title="Cancel Scheduled Operation" labelId="cancel-confirm-title" titleIconVariant="warning" />
          <ModalBody>
            <p>
              Are you sure you want to cancel the scheduled{' '}
              <strong>{showCancelConfirm.operationType}</strong> operation
              {' '}targeting <strong>{showCancelConfirm.targetScope.workshopCount}</strong> workshop
              {showCancelConfirm.targetScope.workshopCount !== 1 ? 's' : ''}?
            </p>
            <p style={{ marginTop: 12 }}>
              <strong>Scheduled for:</strong>{' '}
              {formatDateTime(showCancelConfirm.scheduledFor, showCancelConfirm.timezone)}
            </p>
            {showCancelConfirm.metadata.isRecurring && (
              <p style={{ marginTop: 8 }}>
                <strong>Note:</strong> This will cancel all future executions of this recurring operation.
              </p>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="danger" onClick={confirmCancel}>
              Cancel Operation
            </Button>
            <Button variant="link" onClick={() => setShowCancelConfirm(null)}>
              Keep Operation
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {/* Operation Details Modal */}
      {selectedOperation && (
        <Modal
          variant="large"
          isOpen={true}
          onClose={() => setSelectedOperation(null)}
          aria-labelledby="operation-details-title"
        >
          <ModalHeader
            title={`${selectedOperation.operationType.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())} Operation`}
            labelId="operation-details-title"
          />
          <ModalBody>
            {/* Implementation of detailed operation view would go here */}
            <p>Detailed view of scheduled operation {selectedOperation.id}</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="primary" onClick={() => setSelectedOperation(null)}>
              Close
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
};