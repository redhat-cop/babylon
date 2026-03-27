import React, { useMemo, useState } from 'react';
import {
  Card,
  CardBody,
  CardTitle,
  Pagination,
  PaginationVariant,
  EmptyState,
  EmptyStateBody,
  Progress,
  ProgressSize,
  Label,
  Badge,
  Spinner,
  Flex,
  FlexItem,
  Divider,
  Alert,
  AlertVariant,
  Switch,
} from '@patternfly/react-core';
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
} from '@patternfly/react-table';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  InProgressIcon,
  TachometerAltIcon,
} from '@patternfly/react-icons';
import { Workshop, WorkshopProvision } from '@app/types';
import { useSmartPagination, useVirtualization } from '../hooks/usePagination';
import { isWorkshopLocked } from '@app/Workshops/workshops-utils';

interface VirtualizedWorkshopTableProps {
  workshops: Workshop[];
  provisions: WorkshopProvision[];
  selectedWorkshops: Set<string>;
  onSelectionChange: (workshopId: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  isLoading?: boolean;
}

const ITEM_HEIGHT = 60; // Height of each table row in pixels
const CONTAINER_HEIGHT = 600; // Height of virtualized container

const statusIcons = {
  active: <CheckCircleIcon color="var(--pf-t--global--color--green--default)" />,
  running: <CheckCircleIcon color="var(--pf-t--global--color--green--default)" />,
  provisioning: <InProgressIcon color="var(--pf-t--global--color--blue--default)" />,
  failed: <ExclamationCircleIcon color="var(--pf-t--global--color--red--default)" />,
  error: <ExclamationCircleIcon color="var(--pf-t--global--color--red--default)" />,
  stopped: <Badge color="orange">Stopped</Badge>,
  destroying: <Spinner size="sm" />,
};

export function VirtualizedWorkshopTable({
  workshops,
  provisions,
  selectedWorkshops,
  onSelectionChange,
  onSelectAll,
  isLoading = false,
}: VirtualizedWorkshopTableProps) {
  const [enableVirtualization, setEnableVirtualization] = useState(false);

  // Smart pagination with performance optimization
  const {
    currentPageItems,
    currentPage,
    totalPages,
    totalItems,
    pageSize,
    hasNextPage,
    hasPrevPage,
    goToPage,
    changePageSize,
    performance,
    shouldVirtualize,
    adaptivePageSize,
    optimizePageSize,
  } = useSmartPagination(workshops, {
    pageSize: 100, // Start with larger page size for better performance
    maxItemsBeforeVirtualization: 500,
    prefetchPages: 1,
  });

  // Virtualization for very large datasets
  const virtualization = useVirtualization(
    enableVirtualization ? workshops : currentPageItems,
    CONTAINER_HEIGHT,
    ITEM_HEIGHT,
    5
  );

  const displayItems = enableVirtualization ? virtualization.visibleItems : currentPageItems;

  // Performance metrics
  const performanceInfo = useMemo(() => {
    const isExcellent = totalItems < 100;
    const isGood = totalItems < 500;
    const isFair = totalItems < 1000;
    const isPoor = totalItems >= 1000;

    return {
      level: isExcellent ? 'excellent' : isGood ? 'good' : isFair ? 'fair' : 'poor',
      color: isExcellent ? 'green' as const : isGood ? 'blue' as const : isFair ? 'orange' as const : 'red' as const,
      message:
        isExcellent ? 'Excellent performance' :
        isGood ? 'Good performance' :
        isFair ? 'Fair performance - consider pagination' :
        'Poor performance - virtualization recommended',
      shouldOptimize: isPoor,
    };
  }, [totalItems]);

  // Get workshop status
  const getWorkshopStatus = (workshop: Workshop) => {
    const workshopProvisions = provisions.filter(p =>
      p.metadata.labels?.['babylon.gpte.redhat.com/workshop'] === workshop.metadata.name
    );

    const status = workshop.status?.summary?.provision?.state || 'unknown';
    const failedCount = workshopProvisions.filter(p =>
      p.status?.summary?.provision?.state === 'failed'
    ).length;

    return { status, failedCount };
  };

  // Get seat information
  const getSeats = (workshop: Workshop) => {
    const total = (workshop.spec?.labUserInterface as any)?.userCount || 0;
    const assigned = workshop.status?.summary?.users?.length || 0;
    return { total, assigned, available: total - assigned };
  };

  const allSelected = selectedWorkshops.size === displayItems.length && displayItems.length > 0;
  const someSelected = selectedWorkshops.size > 0 && selectedWorkshops.size < displayItems.length;

  if (isLoading) {
    return (
      <Card>
        <CardBody>
          <EmptyState>
            <Spinner size="lg" />
            <EmptyStateBody>Loading workshops...</EmptyStateBody>
          </EmptyState>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>
        <Flex alignItems={{ default: 'alignItemsCenter' }}>
          <FlexItem>
            Workshops ({totalItems.toLocaleString()})
          </FlexItem>
          <FlexItem>
            <Label color={performanceInfo.color}>
              <TachometerAltIcon style={{ marginRight: 4 }} />
              {performanceInfo.message}
            </Label>
          </FlexItem>
          <FlexItem flex={{ default: 'flex_1' }} />
          {shouldVirtualize && (
            <FlexItem>
              <Switch
                id="virtualization-toggle"
                label="Enable virtualization"
                isChecked={enableVirtualization}
                onChange={(_, checked) => setEnableVirtualization(checked)}
              />
            </FlexItem>
          )}
        </Flex>
      </CardTitle>
      <CardBody>
        {/* Performance warning */}
        {performanceInfo.shouldOptimize && (
          <Alert variant={AlertVariant.warning} title="Performance Notice" isInline>
            <p>
              Large dataset detected ({totalItems.toLocaleString()} workshops).
              Consider enabling virtualization or using smaller page sizes for better performance.
            </p>
            <div style={{ marginTop: 8 }}>
              <button
                className="pf-c-button pf-m-link pf-m-inline"
                onClick={optimizePageSize}
              >
                Optimize page size
              </button>
              {shouldVirtualize && (
                <button
                  className="pf-c-button pf-m-link pf-m-inline"
                  onClick={() => setEnableVirtualization(true)}
                  style={{ marginLeft: 16 }}
                >
                  Enable virtualization
                </button>
              )}
            </div>
          </Alert>
        )}

        <Divider />

        {/* Virtualized table container */}
        <div
          style={{
            height: enableVirtualization ? CONTAINER_HEIGHT : 'auto',
            overflow: enableVirtualization ? 'auto' : 'visible',
            position: 'relative'
          }}
          onScroll={enableVirtualization ? virtualization.handleScroll : undefined}
        >
          {enableVirtualization && (
            <div style={{ height: virtualization.totalHeight, position: 'relative' }}>
              <div
                style={{
                  transform: `translateY(${virtualization.offsetY}px)`,
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                }}
              >
                <Table variant="compact">
                  <Thead>
                    <Tr>
                      <Th>
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={input => {
                            if (input) input.indeterminate = someSelected && !allSelected;
                          }}
                          onChange={(e) => onSelectAll(e.target.checked)}
                        />
                      </Th>
                      <Th>Status</Th>
                      <Th>Workshop</Th>
                      <Th>Namespace</Th>
                      <Th>Stage</Th>
                      <Th>Seats</Th>
                      <Th>Actions</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {displayItems.map((workshop) => {
                      const { status, failedCount } = getWorkshopStatus(workshop);
                      const seats = getSeats(workshop);
                      const isLocked = isWorkshopLocked(workshop);
                      const workshopKey = `${workshop.metadata.namespace}/${workshop.metadata.name}`;

                      return (
                        <Tr key={workshopKey} style={{ height: ITEM_HEIGHT }}>
                          <Td>
                            <input
                              type="checkbox"
                              checked={selectedWorkshops.has(workshopKey)}
                              onChange={(e) => onSelectionChange(workshopKey, e.target.checked)}
                            />
                          </Td>
                          <Td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {statusIcons[status as keyof typeof statusIcons] ||
                               <Badge color="grey">{status}</Badge>}
                              {failedCount > 0 && (
                                <Badge color="red">{failedCount} failed</Badge>
                              )}
                              {isLocked && <Badge color="red">Locked</Badge>}
                            </div>
                          </Td>
                          <Td>
                            <div>
                              <div style={{ fontWeight: 'bold' }}>{workshop.metadata.name}</div>
                              <div style={{ fontSize: 'small', color: 'var(--pf-t--global--color--text--subtle)' }}>
                                {workshop.metadata.labels?.['babylon.gpte.redhat.com/catalog-item-name'] || ''}
                              </div>
                            </div>
                          </Td>
                          <Td>{workshop.metadata.namespace}</Td>
                          <Td>
                            <Label color="blue">
                              {workshop.metadata.labels?.['babylon.gpte.redhat.com/stage'] || 'unknown'}
                            </Label>
                          </Td>
                          <Td>
                            <div>
                              <strong>{seats.assigned}</strong> / {seats.total}
                              {seats.available > 0 && (
                                <Badge color="green" style={{ marginLeft: 4 }}>
                                  {seats.available} available
                                </Badge>
                              )}
                            </div>
                          </Td>
                          <Td>
                            <button className="pf-c-button pf-m-link pf-m-inline">
                              View Details
                            </button>
                          </Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                </Table>
              </div>
            </div>
          )}

          {/* Standard table for non-virtualized view */}
          {!enableVirtualization && (
            <Table variant="compact">
              <Thead>
                <Tr>
                  <Th>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={input => {
                        if (input) input.indeterminate = someSelected && !allSelected;
                      }}
                      onChange={(e) => onSelectAll(e.target.checked)}
                    />
                  </Th>
                  <Th>Status</Th>
                  <Th>Workshop</Th>
                  <Th>Namespace</Th>
                  <Th>Stage</Th>
                  <Th>Seats</Th>
                  <Th>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {displayItems.map((workshop) => {
                  const { status, failedCount } = getWorkshopStatus(workshop);
                  const seats = getSeats(workshop);
                  const isLocked = isWorkshopLocked(workshop);
                  const workshopKey = `${workshop.metadata.namespace}/${workshop.metadata.name}`;

                  return (
                    <Tr key={workshopKey}>
                      <Td>
                        <input
                          type="checkbox"
                          checked={selectedWorkshops.has(workshopKey)}
                          onChange={(e) => onSelectionChange(workshopKey, e.target.checked)}
                        />
                      </Td>
                      <Td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {statusIcons[status as keyof typeof statusIcons] ||
                           <Badge color="grey">{status}</Badge>}
                          {failedCount > 0 && (
                            <Badge color="red">{failedCount} failed</Badge>
                          )}
                          {isLocked && <Badge color="red">Locked</Badge>}
                        </div>
                      </Td>
                      <Td>
                        <div>
                          <div style={{ fontWeight: 'bold' }}>{workshop.metadata.name}</div>
                          <div style={{ fontSize: 'small', color: 'var(--pf-t--global--color--text--subtle)' }}>
                            {workshop.metadata.labels?.['babylon.gpte.redhat.com/catalog-item-name'] || ''}
                          </div>
                        </div>
                      </Td>
                      <Td>{workshop.metadata.namespace}</Td>
                      <Td>
                        <Label color="blue">
                          {workshop.metadata.labels?.['babylon.gpte.redhat.com/stage'] || 'unknown'}
                        </Label>
                      </Td>
                      <Td>
                        <div>
                          <strong>{seats.assigned}</strong> / {seats.total}
                          {seats.available > 0 && (
                            <Badge color="green" style={{ marginLeft: 4 }}>
                              {seats.available} available
                            </Badge>
                          )}
                        </div>
                      </Td>
                      <Td>
                        <button className="pf-c-button pf-m-link pf-m-inline">
                          View Details
                        </button>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          )}
        </div>

        {/* Performance metrics and pagination */}
        <Divider />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
          <div>
            <div style={{ fontSize: 'small', color: 'var(--pf-t--global--color--text--subtle)' }}>
              Showing {!enableVirtualization ? currentPageItems.length : displayItems.length} of {totalItems.toLocaleString()} workshops
              {performance.memoryUsageEstimate && (
                <span> • Est. memory: {Math.round(performance.memoryUsageEstimate / 1024)}KB</span>
              )}
            </div>
          </div>

          {!enableVirtualization && totalItems > pageSize && (
            <Pagination
              itemCount={totalItems}
              perPage={pageSize}
              page={currentPage}
              onSetPage={(_, page) => goToPage(page)}
              onPerPageSelect={(_, newPageSize) => changePageSize(newPageSize)}
              perPageOptions={[
                { title: '50', value: 50 },
                { title: '100', value: 100 },
                { title: '200', value: 200 },
                { title: '500', value: 500 },
              ]}
              variant={PaginationVariant.bottom}
            />
          )}
        </div>
      </CardBody>
    </Card>
  );
}