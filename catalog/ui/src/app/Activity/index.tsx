import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageSection, Title, Pagination, Tooltip } from '@patternfly/react-core';
import { Table, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';
import OutlinedQuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/outlined-question-circle-icon';
import useSWR from 'swr';
import { apiFetch, apiPaths } from '@app/api';
import LoadingSection from '@app/components/LoadingSection';
import CurrencyAmount from '@app/components/CurrencyAmount';
import { UserActivityResponse } from '@app/types';

async function fetchUserActivity(page: number, pageSize: number): Promise<UserActivityResponse> {
  // API uses 1-based page indexing
  // Ensure pageSize is within valid range (1-50)
  const validPageSize = Math.min(Math.max(1, pageSize), 50);
  const url = apiPaths.USER_ACTIVITY({ page, page_size: validPageSize });
  const response = await apiFetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch user activity: ${response.statusText}`);
  }
  return response.json();
}

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
        <Title headingLevel="h1">Activity</Title>
        <p>Error loading activity: {error.message}</p>
      </PageSection>
    );
  }

  if (!data || !data.items || data.items.length === 0) {
    return (
      <PageSection>
        <Title headingLevel="h1">Activity</Title>
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

  return (
    <>
      <PageSection variant="default">
        <Title headingLevel="h1">Activity</Title>
      </PageSection>
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
              <Th>Catalog Item</Th>
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
                <Td dataLabel="Name">{item.resourceclaim_name || '-'}</Td>
                <Td dataLabel="Catalog Item">
                  {item.catalog?.name ? (
                    <Link to={`/catalog?search=${encodeURIComponent(item.catalog.name)}`}>{item.catalog.display_name}</Link>
                  ) : (
                    item.display_name || '-'
                  )}
                </Td>
                <Td dataLabel="Type">
                  {item.workshop_id
                    ? `Workshop - ${item.user_experiences} ${item.user_experiences === 1 ? 'Instance' : 'Instances'}`
                    : 'Service'}
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
    </>
  );
};

export default Activity;
