import React, { useState } from 'react';
import {
  Card,
  CardBody,
  CardTitle,
  Badge,
  Button,
  EmptyState,
  EmptyStateBody,
  Label,
  Modal,
  ModalBody,
  ModalHeader,
  ModalFooter,
  Pagination,
  PaginationVariant,
  Spinner,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  DatePicker,
  Select,
  SelectOption,
  SelectList,
  MenuToggle,
  SearchInput,
  Split,
  SplitItem,
} from '@patternfly/react-core';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  InProgressIcon,
  TimesCircleIcon,
} from '@patternfly/react-icons';
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
} from '@patternfly/react-table';
import { useOperationHistory } from '../hooks/useOperationHistory';
import { OperationHistoryEntry } from '../types/operations';

const statusIcons = {
  completed: <CheckCircleIcon color="var(--pf-t--global--color--green--default)" />,
  failed: <ExclamationCircleIcon color="var(--pf-t--global--color--red--default)" />,
  'in-progress': <InProgressIcon color="var(--pf-t--global--color--blue--default)" />,
  pending: <Spinner size="sm" />,
  cancelled: <TimesCircleIcon color="var(--pf-t--global--color--orange--default)" />,
};

const operationLabels = {
  lock: { text: 'Lock', color: 'red' as const },
  unlock: { text: 'Unlock', color: 'green' as const },
  'extend-stop': { text: 'Extend Stop', color: 'blue' as const },
  'extend-destroy': { text: 'Extend Destroy', color: 'purple' as const },
  'disable-autostop': { text: 'Disable Auto-stop', color: 'orange' as const },
  scale: { text: 'Scale', color: 'teal' as const },
  restart: { text: 'Restart', color: 'yellow' as const },
  clone: { text: 'Clone', color: 'grey' as const },
  'health-check': { text: 'Health Check', color: 'blue' as const },
};

interface OperationHistoryPanelProps {
  isVisible: boolean;
  onClose: () => void;
  onExport?: (operations: OperationHistoryEntry[]) => void;
}

export function OperationHistoryPanel({ isVisible, onClose, onExport }: OperationHistoryPanelProps) {
  const {
    data,
    error,
    isLoading,
    filters,
    updateFilters,
    page,
    pageSize,
    goToPage,
    changePageSize,
    refreshHistory,
  } = useOperationHistory();

  const [selectedEntry, setSelectedEntry] = useState<OperationHistoryEntry | null>(null);
  const [operationTypeSelectOpen, setOperationTypeSelectOpen] = useState(false);
  const [statusSelectOpen, setStatusSelectOpen] = useState(false);
  const [namespaceSelectOpen, setNamespaceSelectOpen] = useState(false);

  if (!isVisible) return null;

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const getSuccessRate = (entry: OperationHistoryEntry): number => {
    if (entry.results.totalTargets === 0) return 100;
    return Math.round((entry.results.successful / entry.results.totalTargets) * 100);
  };

  return (
    <Card className="operation-history-panel">
      <CardTitle>
        <Split hasGutter>
          <SplitItem>Operation History</SplitItem>
          <SplitItem isFilled />
          <SplitItem>
            <Button variant="secondary" size="sm" onClick={refreshHistory}>
              Refresh
            </Button>
          </SplitItem>
          {onExport && (
            <SplitItem>
              <Button variant="secondary" size="sm" onClick={() => onExport(data.entries)}>
                Export CSV
              </Button>
            </SplitItem>
          )}
          <SplitItem>
            <Button variant="plain" size="sm" onClick={onClose}>
              ×
            </Button>
          </SplitItem>
        </Split>
      </CardTitle>
      <CardBody>
        {/* Filters Toolbar */}
        <Toolbar>
          <ToolbarContent>
            <ToolbarItem>
              <SearchInput
                placeholder="Search operations..."
                value={filters.searchText}
                onChange={(_, value) => updateFilters({ searchText: value })}
                onClear={() => updateFilters({ searchText: '' })}
              />
            </ToolbarItem>

            <ToolbarItem>
              <DatePicker
                value={filters.dateRange.start ? new Date(filters.dateRange.start).toISOString().split('T')[0] : ''}
                onChange={(_, value) => updateFilters({
                  dateRange: { ...filters.dateRange, start: value ? new Date(value).toISOString() : undefined }
                })}
                placeholder="Start date"
              />
            </ToolbarItem>

            <ToolbarItem>
              <DatePicker
                value={filters.dateRange.end ? new Date(filters.dateRange.end).toISOString().split('T')[0] : ''}
                onChange={(_, value) => updateFilters({
                  dateRange: { ...filters.dateRange, end: value ? new Date(value).toISOString() : undefined }
                })}
                placeholder="End date"
              />
            </ToolbarItem>

            <ToolbarItem>
              <Select
                isOpen={operationTypeSelectOpen}
                selected={filters.operationTypes}
                onSelect={(_, val) => {
                  const value = val as string;
                  const newTypes = filters.operationTypes.includes(value)
                    ? filters.operationTypes.filter(t => t !== value)
                    : [...filters.operationTypes, value];
                  updateFilters({ operationTypes: newTypes });
                }}
                onOpenChange={setOperationTypeSelectOpen}
                toggle={(toggleRef) => (
                  <MenuToggle
                    ref={toggleRef}
                    onClick={() => setOperationTypeSelectOpen(p => !p)}
                    isExpanded={operationTypeSelectOpen}
                  >
                    Operation Type {filters.operationTypes.length > 0 && (
                      <Badge isRead>{filters.operationTypes.length}</Badge>
                    )}
                  </MenuToggle>
                )}
                shouldFocusToggleOnSelect={false}
              >
                <SelectList>
                  {Object.keys(operationLabels).map(type => (
                    <SelectOption
                      key={type}
                      value={type}
                      hasCheckbox
                      isSelected={filters.operationTypes.includes(type)}
                    >
                      {operationLabels[type as keyof typeof operationLabels].text}
                    </SelectOption>
                  ))}
                </SelectList>
              </Select>
            </ToolbarItem>
          </ToolbarContent>
        </Toolbar>

        {/* History Table */}
        {isLoading ? (
          <EmptyState>
            <Spinner size="lg" />
            <EmptyStateBody>Loading operation history...</EmptyStateBody>
          </EmptyState>
        ) : error ? (
          <EmptyState>
            <ExclamationCircleIcon color="var(--pf-t--global--color--red--default)" />
            <EmptyStateBody>Failed to load operation history</EmptyStateBody>
            <Button variant="secondary" onClick={refreshHistory}>
              Retry
            </Button>
          </EmptyState>
        ) : data.entries.length === 0 ? (
          <EmptyState>
            <EmptyStateBody>No operation history found for the selected filters</EmptyStateBody>
          </EmptyState>
        ) : (
          <>
            <Table variant="compact">
              <Thead>
                <Tr>
                  <Th>Status</Th>
                  <Th>Operation</Th>
                  <Th>Performed By</Th>
                  <Th>Timestamp</Th>
                  <Th>Targets</Th>
                  <Th>Success Rate</Th>
                  <Th>Duration</Th>
                  <Th>Template</Th>
                  <Th>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.entries.map((entry) => (
                  <Tr key={entry.id}>
                    <Td>{statusIcons[entry.status]}</Td>
                    <Td>
                      <Label color={operationLabels[entry.operationType].color}>
                        {operationLabels[entry.operationType].text}
                      </Label>
                    </Td>
                    <Td>
                      <div>
                        <div style={{ fontWeight: 'bold' }}>{entry.performedBy.displayName || entry.performedBy.username}</div>
                        <div style={{ fontSize: 'small', color: 'var(--pf-t--global--color--text--subtle)' }}>
                          {entry.performedBy.email}
                        </div>
                      </div>
                    </Td>
                    <Td>{formatTimestamp(entry.timestamp)}</Td>
                    <Td>
                      <div>{entry.results.totalTargets} workshops</div>
                      <div style={{ fontSize: 'small', color: 'var(--pf-t--global--color--text--subtle)' }}>
                        {entry.targetScope.namespaces.join(', ')}
                      </div>
                    </Td>
                    <Td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{getSuccessRate(entry)}%</span>
                        {entry.results.failed > 0 && (
                          <Badge color="red">{entry.results.failed} failed</Badge>
                        )}
                      </div>
                    </Td>
                    <Td>{formatDuration(entry.results.executionTimeMs)}</Td>
                    <Td>
                      {entry.templateUsed ? (
                        <Label color="blue">{entry.templateUsed.name}</Label>
                      ) : (
                        <span style={{ color: 'var(--pf-t--global--color--text--subtle)' }}>Manual</span>
                      )}
                    </Td>
                    <Td>
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => setSelectedEntry(entry)}
                      >
                        View Details
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>

            {/* Pagination */}
            <Pagination
              itemCount={data.pagination.totalCount}
              perPage={pageSize}
              page={page}
              onSetPage={(_, newPage) => goToPage(newPage)}
              onPerPageSelect={(_, newPageSize) => changePageSize(newPageSize)}
              variant={PaginationVariant.bottom}
            />
          </>
        )}

        {/* Details Modal */}
        {selectedEntry && (
          <Modal
            title={`Operation Details - ${operationLabels[selectedEntry.operationType].text}`}
            isOpen={!!selectedEntry}
            onClose={() => setSelectedEntry(null)}
            width="900px"
          >
            <ModalHeader>
              <Split hasGutter>
                <SplitItem>{statusIcons[selectedEntry.status]}</SplitItem>
                <SplitItem>
                  <Label color={operationLabels[selectedEntry.operationType].color}>
                    {operationLabels[selectedEntry.operationType].text}
                  </Label>
                </SplitItem>
                <SplitItem isFilled />
                <SplitItem>
                  <div style={{ textAlign: 'right', fontSize: 'small' }}>
                    <div>ID: {selectedEntry.id}</div>
                    <div>{formatTimestamp(selectedEntry.timestamp)}</div>
                  </div>
                </SplitItem>
              </Split>
            </ModalHeader>
            <ModalBody>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <div>
                  <h4>Execution Results</h4>
                  <div style={{ marginBottom: 16 }}>
                    <Label color="green">{selectedEntry.results.successful} successful</Label>
                    {selectedEntry.results.failed > 0 && (
                      <Label color="red" style={{ marginLeft: 8 }}>{selectedEntry.results.failed} failed</Label>
                    )}
                  </div>
                  <div>Duration: {formatDuration(selectedEntry.results.executionTimeMs)}</div>

                  {selectedEntry.results.errors && selectedEntry.results.errors.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <h5>Errors:</h5>
                      {selectedEntry.results.errors.map((error, index) => (
                        <div key={index} style={{
                          padding: 8,
                          backgroundColor: 'var(--pf-t--global--color--background--danger)',
                          borderRadius: 4,
                          marginBottom: 8
                        }}>
                          <div style={{ fontWeight: 'bold' }}>{error.workshopName}</div>
                          <div style={{ fontSize: 'small' }}>{error.namespace}</div>
                          <div>{error.error}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h4>Target Scope</h4>
                  <div>Workshops: {selectedEntry.targetScope.workshopCount}</div>
                  <div>Namespaces: {selectedEntry.targetScope.namespaces.join(', ')}</div>

                  <h4 style={{ marginTop: 16 }}>Parameters</h4>
                  {Object.entries(selectedEntry.parameters).map(([key, value]) => (
                    value !== undefined && (
                      <div key={key}>{key}: {value}</div>
                    )
                  ))}

                  {selectedEntry.templateUsed && (
                    <>
                      <h4 style={{ marginTop: 16 }}>Template Used</h4>
                      <Label color="blue">{selectedEntry.templateUsed.name}</Label>
                    </>
                  )}
                </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="secondary" onClick={() => setSelectedEntry(null)}>
                Close
              </Button>
            </ModalFooter>
          </Modal>
        )}
      </CardBody>
    </Card>
  );
}