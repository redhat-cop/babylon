import React, { useState, useMemo } from 'react';
import {
  PageSection,
  Title,
  Pagination,
  Tooltip,
  Card,
  CardBody,
  Flex,
  FlexItem,
  Skeleton,
} from '@patternfly/react-core';
import { Table, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';
import OutlinedQuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/outlined-question-circle-icon';
import TrendUpIcon from '@patternfly/react-icons/dist/js/icons/trend-up-icon';
import HistoryIcon from '@patternfly/react-icons/dist/js/icons/history-icon';
import useSWR from 'swr';
import { apiFetch, apiPaths } from '@app/api';
import LoadingSection from '@app/components/LoadingSection';
import CurrencyAmount from '@app/components/CurrencyAmount';
import { UserActivityResponse } from '@app/types';
import './Activity.css';

function getMonthDateRange(monthOffset: number = 0): { start_date: string; end_date: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + monthOffset;

  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0); // Last day of the month

  // Format as YYYY-MM-DD
  const formatDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  return {
    start_date: formatDate(startDate),
    end_date: formatDate(endDate),
  };
}

async function fetchUserActivity(
  page: number,
  pageSize: number,
  start_date?: string,
  end_date?: string,
): Promise<UserActivityResponse> {
  // API uses 1-based page indexing
  // Ensure pageSize is within valid range (1-50)
  const validPageSize = Math.min(Math.max(1, pageSize), 50);
  const url = apiPaths.USER_ACTIVITY({ page, page_size: validPageSize, start_date, end_date });
  const response = await apiFetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch user activity: ${response.statusText}`);
  }
  return response.json();
}

const ActivitySummary: React.FC = () => {
  const currentMonthRange = useMemo(() => getMonthDateRange(0), []);
  const lastMonthRange = useMemo(() => getMonthDateRange(-1), []);

  const { data: currentMonthData, isLoading: currentMonthLoading } = useSWR<UserActivityResponse>(
    `user-activity-summary-current-month`,
    () => fetchUserActivity(1, 1, currentMonthRange.start_date, currentMonthRange.end_date),
    { refreshInterval: 60000 },
  );

  const { data: lastMonthData, isLoading: lastMonthLoading } = useSWR<UserActivityResponse>(
    `user-activity-summary-last-month`,
    () => fetchUserActivity(1, 1, lastMonthRange.start_date, lastMonthRange.end_date),
    { refreshInterval: 60000 },
  );

  const formatEuro = (amount: number) => {
    return new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <Card isPlain className="activity-summary-card">
      <CardBody>
        <Flex direction={{ default: 'column' }} gap={{ default: 'gapSm' }}>
          <FlexItem>
            <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
              <FlexItem>
                <TrendUpIcon color="var(--pf-t--global--color--status--success--default)" />
              </FlexItem>
              <FlexItem>
                {currentMonthLoading ? (
                  <Skeleton width="300px" />
                ) : (
                  <span>
                    <strong>{currentMonthData?.total_user_experiences ?? 0}</strong> experience
                    {currentMonthData?.total_user_experiences !== 1 ? 's' : ''} delivered this month, representing{' '}
                    <strong>{formatEuro(currentMonthData?.total_usage_amount ?? 0)}</strong> in usage.
                  </span>
                )}
              </FlexItem>
            </Flex>
          </FlexItem>
          <FlexItem>
            <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
              <FlexItem>
                <HistoryIcon color="var(--pf-t--global--color--status--info--default)" />
              </FlexItem>
              <FlexItem>
                {lastMonthLoading ? (
                  <Skeleton width="300px" />
                ) : (
                  <span>
                    <strong>{lastMonthData?.total_user_experiences ?? 0}</strong> experience
                    {lastMonthData?.total_user_experiences !== 1 ? 's' : ''} last month, resulting in a chargeback of{' '}
                    <strong>{formatEuro(lastMonthData?.total_chargeback_user ?? 0)}</strong>.
                  </span>
                )}
              </FlexItem>
            </Flex>
          </FlexItem>
        </Flex>
      </CardBody>
    </Card>
  );
};

const Activity: React.FC = () => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data, error, isLoading } = useSWR<UserActivityResponse>(
    `user-activity-${page}-${pageSize}`,
    () => fetchUserActivity(page, pageSize),
    {
      refreshInterval: 30000, // Refresh every 30 seconds
    },
  );

  if (isLoading) {
    return <LoadingSection />;
  }

  if (error) {
    return (
      <PageSection>
        <Title headingLevel="h1">My Activity</Title>
        <p>Error loading activity: {error.message}</p>
      </PageSection>
    );
  }

  if (!data || !data.items || data.items.length === 0) {
    return (
      <PageSection>
        <Title headingLevel="h1">My Activity</Title>
        <p>No activity found.</p>
      </PageSection>
    );
  }

  const onSetPage = (_event: React.MouseEvent | React.KeyboardEvent | MouseEvent, newPage: number) => {
    setPage(newPage);
  };

  const onPerPageSelect = (
    _event: React.MouseEvent | React.KeyboardEvent | MouseEvent,
    newPerPage: number,
    newPage: number,
  ) => {
    // Ensure pageSize is within valid range (1-50)
    const validPageSize = Math.min(Math.max(1, newPerPage), 50);
    setPageSize(validPageSize);
    setPage(newPage);
  };

  const hasData = data && data.items && data.items.length > 0;

  return (
    <>
      <PageSection variant="default">
        <Title headingLevel="h1">My Activity</Title>
      </PageSection>
      <PageSection hasBodyWrapper={false}>
        <ActivitySummary />
      </PageSection>
      {hasData ? (
        <PageSection hasBodyWrapper={false}>
          <Pagination
            itemCount={data.total_items}
            page={data.page} // API uses 1-based indexing
            perPage={data.page_size}
            onSetPage={onSetPage}
            onPerPageSelect={onPerPageSelect}
            perPageOptions={[
              { title: '10', value: 10 },
              { title: '20', value: 20 },
              { title: '50', value: 50 },
            ]}
          />
          <Table aria-label="User activity table" variant="compact">
            <Thead>
              <Tr>
                <Th>Name</Th>
                <Th>Type</Th>
                <Th>Date requested</Th>
                <Th>Retirement date</Th>
                <Th>Usage Amount</Th>
                <Th>Salesforce IDs</Th>
              </Tr>
            </Thead>
            <Tbody>
              {data.items.map((item) => (
                <Tr key={item.request_id}>
                  <Td dataLabel="Name">
                    {item.display_name || '-'}
                    <span style={{ fontSize: '0.6rem', fontStyle: 'italic', padding: '0 var(--pf-t--global--spacer--xs)' }}>({item.resourceclaim_name || '-'})</span>
                  </Td>
                  <Td dataLabel="Type">
                    {item.workshop_id
                      ? `Workshop - ${item.user_experiences} ${item.user_experiences === 1 ? 'Seat' : 'Seats'}`
                      : `Service ${item.user_experiences && item.user_experiences > 1 ? `- ${item.user_experiences} 'Users'` : ''}`}
                  </Td>
                  <Td dataLabel="Date requested">
                    {item.requested_at ? new Date(item.requested_at).toLocaleDateString() : '-'}
                  </Td>
                  <Td dataLabel="Retirement date">
                    {item.retired_at ? new Date(item.retired_at).toLocaleDateString() : '-'}
                  </Td>
                  <Td dataLabel="Usage Amount">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--pf-t--global--spacer--xs)' }}>
                      <CurrencyAmount amount={item.costs.chargeback_user_amount} />
                      <Tooltip
                        content={
                          <div>
                            <p>Charged: {item.costs.chargeback_user ? 'Yes' : 'No'}</p>
                          </div>
                        }
                      >
                        <OutlinedQuestionCircleIcon
                          aria-label="Chargeback information"
                          className="tooltip-icon-only"
                          style={{ cursor: 'pointer' }}
                        />
                      </Tooltip>
                    </div>
                  </Td>
                  <Td dataLabel="Salesforce IDs">
                    {item.sales_items && item.sales_items.length > 0 ? (
                      <div style={{ whiteSpace: 'pre-line' }}>
                        {item.sales_items
                          .map(
                            (salesItem) =>
                              `${salesItem.sales_type.charAt(0).toUpperCase()}${salesItem.sales_type.slice(1)} Id: ${salesItem.sales_number}`,
                          )
                          .join('\n')}
                      </div>
                    ) : (
                      '-'
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </PageSection>
      ) : (
        <PageSection>
          <p>No activity found.</p>
        </PageSection>
      )}
    </>
  );
};

export default Activity;
