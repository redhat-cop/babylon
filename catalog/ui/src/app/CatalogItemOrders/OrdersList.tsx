import React from 'react';
import { Link } from 'react-router-dom';
import useSWR from 'swr';
import {
  Alert,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  PageSection,
  Split,
  SplitItem,
  Title,
} from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { apiPaths } from '@app/api';
import useSession from '@app/utils/useSession';
import Footer from '@app/components/Footer';
import LoadingSection from '@app/components/LoadingSection';
import { orderFetcher } from './catalog-item-order-api';
import type { OrderApiError } from './catalog-item-order-api';
import type { CatalogItemOrder, CatalogItemOrderList } from './types';
import { getOrderStatus, isOrderActive, orderTypeLabel } from './order-utils';
import OrderStatusLabel from './OrderStatusLabel';
import OrderTime from './OrderTime';
import CatalogItemName from './CatalogItemName';

export const ACTIVE_REFRESH_MS = 8000;
const IDLE_REFRESH_MS = 60000;

/**
 * Orders shown to the requester: those that needed approval. Orders that need
 * no approval go straight to the created service and have no order page.
 */
export function visibleOrders(orders: CatalogItemOrder[]): CatalogItemOrder[] {
  return orders
    .filter((order) => order.approval?.state !== 'NotRequired')
    .sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
}

export const OrdersTable: React.FC<{ orders: CatalogItemOrder[] }> = ({ orders }) => (
  <Table aria-label="Orders" variant="compact">
    <Thead>
      <Tr>
        <Th>Catalog item</Th>
        <Th>Type</Th>
        <Th>Status</Th>
        <Th>Submitted</Th>
        <Th>Approval expires</Th>
      </Tr>
    </Thead>
    <Tbody>
      {orders.map((order) => {
        const status = getOrderStatus(order);
        return (
          <Tr key={order.uid}>
            <Td dataLabel="Catalog item">
              <Link to={`/orders/${encodeURIComponent(order.namespace)}/${encodeURIComponent(order.name)}`}>
                <CatalogItemName namespace={order.catalogItem.namespace} name={order.catalogItem.name} />
              </Link>
            </Td>
            <Td dataLabel="Type">{orderTypeLabel(order.orderType)}</Td>
            <Td dataLabel="Status">
              <OrderStatusLabel label={status.label} tone={status.tone} />
            </Td>
            <Td dataLabel="Submitted">
              <OrderTime value={order.submittedAt} />
            </Td>
            <Td dataLabel="Approval expires">
              {order.phase === 'PendingApproval' ? <OrderTime value={order.approval?.expiresAt} /> : '-'}
            </Td>
          </Tr>
        );
      })}
    </Tbody>
  </Table>
);

const OrdersList: React.FC = () => {
  const { authUser } = useSession().getSession();
  const { data, error, isLoading, mutate } = useSWR<CatalogItemOrderList, OrderApiError>(
    [apiPaths.CATALOG_ITEM_ORDERS(), authUser],
    ([path]: [string, string]) => orderFetcher<CatalogItemOrderList>(path),
    {
      suspense: false,
      refreshInterval: (latest) =>
        latest?.items?.some((order) => isOrderActive(order)) ? ACTIVE_REFRESH_MS : IDLE_REFRESH_MS,
    },
  );

  const orders = visibleOrders(data?.items || []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'auto', flexGrow: 1 }}>
      <PageSection hasBodyWrapper={false}>
        <Split hasGutter>
          <SplitItem isFilled>
            <Breadcrumb>
              <BreadcrumbItem>My Services</BreadcrumbItem>
              <BreadcrumbItem isActive>Orders</BreadcrumbItem>
            </Breadcrumb>
            <Title headingLevel="h1" size="lg">
              Orders
            </Title>
            <p>Orders that need manager approval. Once approved, the service is created and linked here.</p>
          </SplitItem>
        </Split>
      </PageSection>
      <PageSection hasBodyWrapper={false} style={{ flexGrow: 1 }}>
        {isLoading && !data ? (
          <LoadingSection />
        ) : error && !data ? (
          <Alert variant="danger" isInline title="Orders could not be loaded" actionLinks={<Button variant="link" isInline onClick={() => mutate()}>Try again</Button>}>
            {error.message}
          </Alert>
        ) : orders.length === 0 ? (
          <EmptyState headingLevel="h2" titleText="No orders" variant="full">
            <EmptyStateBody>Orders that need manager approval appear here.</EmptyStateBody>
            <EmptyStateFooter>
              <EmptyStateActions>
                <Link to="/catalog">Browse the catalog</Link>
              </EmptyStateActions>
            </EmptyStateFooter>
          </EmptyState>
        ) : (
          <>
            {error ? (
              <Alert variant="warning" isInline isPlain title="Showing the last loaded orders; refreshing failed." />
            ) : null}
            <OrdersTable orders={orders} />
          </>
        )}
      </PageSection>
      <Footer />
    </div>
  );
};

export default OrdersList;
