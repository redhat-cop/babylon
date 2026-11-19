import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import useSWRInfinite from 'swr/infinite';
import {
  Alert,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  EmptyState,
  EmptyStateBody,
  PageSection,
  Title,
  ToggleGroup,
  ToggleGroupItem,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { apiPaths } from '@app/api';
import useSession from '@app/utils/useSession';
import LoadingSection from '@app/components/LoadingSection';
import { orderFetcher } from './catalog-item-order-api';
import type { OrderApiError } from './catalog-item-order-api';
import type { ApprovalListState, ApprovalReviewList } from './types';
import { getReviewStatus, orderErrorTitle } from './order-utils';
import OrderStatusLabel from './OrderStatusLabel';
import OrderTime from './OrderTime';
import CatalogItemName from './CatalogItemName';

export const APPROVALS_PAGE_SIZE = 50;
const REFRESH_MS = 30000;
const STATES: { key: ApprovalListState; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'decided', label: 'Decided' },
  { key: 'all', label: 'All' },
];

export type ApprovalsScope = 'manager' | 'admin';

export function approvalsBasePath(scope: ApprovalsScope): string {
  return scope === 'admin' ? '/admin/approvals' : '/approvals';
}

/**
 * Approval requests the server authorized for the signed-in user: direct and
 * higher managers see their reports' requests, administrators see all. The
 * browser never decides who may review what.
 */
const ApprovalsList: React.FC<{ scope: ApprovalsScope }> = ({ scope }) => {
  const { authUser } = useSession().getSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('state') as ApprovalListState;
  const state: ApprovalListState = STATES.some((s) => s.key === requested) ? requested : 'pending';
  const basePath = approvalsBasePath(scope);

  const { data, error, size, setSize, isLoading, isValidating, mutate } = useSWRInfinite<
    ApprovalReviewList,
    OrderApiError
  >(
    (index, previous: ApprovalReviewList | null) => {
      if (previous && !previous.continue) return null;
      return [
        apiPaths.CATALOG_ITEM_ORDER_APPROVALS({
          state,
          limit: APPROVALS_PAGE_SIZE,
          continueToken: index === 0 ? undefined : previous?.continue,
        }),
        authUser,
      ];
    },
    ([path]: [string, string]) => orderFetcher<ApprovalReviewList>(path),
    { suspense: false, refreshInterval: state === 'pending' ? REFRESH_MS : 0, revalidateFirstPage: true },
  );

  const items = (data || []).flatMap((page) => page.items);
  const incomplete = (data || []).some((page) => page.incomplete);
  const hasMore = Boolean(data?.[data.length - 1]?.continue);
  const loadingMore = isValidating && size > (data?.length || 0);

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <Breadcrumb>
          {scope === 'admin' ? <BreadcrumbItem>Admin</BreadcrumbItem> : null}
          <BreadcrumbItem isActive>Approvals</BreadcrumbItem>
        </Breadcrumb>
        <Title headingLevel="h1" size="lg">
          {scope === 'admin' ? 'Order approvals' : 'Approvals'}
        </Title>
        <p>
          {scope === 'admin'
            ? 'All catalog item orders that need approval. Administrators can decide any request except their own.'
            : 'Order requests from people who report to you, directly or through your management chain.'}
        </p>
      </PageSection>
      <PageSection hasBodyWrapper={false}>
        <Toolbar>
          <ToolbarContent>
            <ToolbarItem>
              <ToggleGroup aria-label="Filter by status">
                {STATES.map((option) => (
                  <ToggleGroupItem
                    key={option.key}
                    text={option.label}
                    buttonId={`approvals-state-${option.key}`}
                    isSelected={state === option.key}
                    onChange={() => {
                      const next = new URLSearchParams(searchParams);
                      if (option.key === 'pending') next.delete('state');
                      else next.set('state', option.key);
                      setSearchParams(next);
                    }}
                  />
                ))}
              </ToggleGroup>
            </ToolbarItem>
          </ToolbarContent>
        </Toolbar>

        {incomplete ? (
          <Alert variant="warning" isInline title="Some requests may be missing" style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}>
            Manager information is temporarily unavailable, so requests you can review through your management
            chain may not be listed. Try again later.
          </Alert>
        ) : null}

        {isLoading && !data ? (
          <LoadingSection />
        ) : error && !data ? (
          <Alert
            variant="danger"
            isInline
            title={orderErrorTitle(error.code) === 'Request failed' ? 'Approvals could not be loaded' : orderErrorTitle(error.code)}
            actionLinks={<Button variant="link" isInline onClick={() => mutate()}>Try again</Button>}
          >
            {error.message}
          </Alert>
        ) : items.length === 0 ? (
          <EmptyState headingLevel="h2" titleText={state === 'pending' ? 'No pending requests' : 'No requests'} variant="full">
            <EmptyStateBody>
              {state === 'pending' ? 'There is nothing waiting for your decision.' : 'No approval requests match this filter.'}
            </EmptyStateBody>
          </EmptyState>
        ) : (
          <>
            <Table aria-label="Approval requests" variant="compact">
              <Thead>
                <Tr>
                  <Th>Requester</Th>
                  <Th>Catalog item</Th>
                  <Th>Purpose</Th>
                  <Th>Status</Th>
                  <Th>Submitted</Th>
                  <Th>Expires</Th>
                </Tr>
              </Thead>
              <Tbody>
                {items.map((review) => {
                  const status = getReviewStatus(review);
                  return (
                    <Tr key={review.uid}>
                      <Td dataLabel="Requester">{review.requester.email || review.requester.user}</Td>
                      <Td dataLabel="Catalog item">
                        <Link to={`${basePath}/${encodeURIComponent(review.uid)}`}>
                          <CatalogItemName namespace={review.catalogItem.namespace} name={review.catalogItem.name} />
                        </Link>
                      </Td>
                      <Td dataLabel="Purpose">{review.request?.purpose || '-'}</Td>
                      <Td dataLabel="Status">
                        <OrderStatusLabel label={status.label} tone={status.tone} />
                      </Td>
                      <Td dataLabel="Submitted">
                        <OrderTime value={review.submittedAt} />
                      </Td>
                      <Td dataLabel="Expires">
                        {status.label === 'Pending' ? <OrderTime value={review.approval?.expiresAt} /> : '-'}
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
            {hasMore ? (
              <Button variant="secondary" onClick={() => setSize(size + 1)} isLoading={loadingMore} isDisabled={loadingMore}>
                Load more
              </Button>
            ) : null}
          </>
        )}
      </PageSection>
    </>
  );
};

export default ApprovalsList;
