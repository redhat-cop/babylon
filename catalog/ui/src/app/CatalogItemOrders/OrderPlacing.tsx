import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import useSWR from 'swr';
import { Alert, Bullseye, Button, EmptyState, EmptyStateBody, EmptyStateFooter, PageSection, Spinner } from '@patternfly/react-core';
import { apiPaths } from '@app/api';
import useSession from '@app/utils/useSession';
import NotFound from '@app/components/NotFound';
import { orderFetcher } from './catalog-item-order-api';
import type { OrderApiError } from './catalog-item-order-api';
import type { CatalogItemOrder } from './types';
import { orderDestination } from './order-utils';

export const PLACING_POLL_MS = 500;
export const PLACING_SLOW_AFTER_MS = 30000;

/**
 * Shown right after submitting an order. Waits for the controller and then
 * replaces itself with the created service, workshop or lab (no approval
 * needed) or with the order page (approval needed, or the order cannot
 * continue). Orders that need no approval therefore never show an order page.
 */
const OrderPlacing: React.FC = () => {
  const { namespace, name } = useParams();
  const navigate = useNavigate();
  const { authUser } = useSession().getSession();
  const [slow, setSlow] = useState(false);
  const { data: order, error, mutate } = useSWR<CatalogItemOrder, OrderApiError>(
    [apiPaths.CATALOG_ITEM_ORDER({ namespace, name }), authUser],
    ([path]: [string, string]) => orderFetcher<CatalogItemOrder>(path),
    { suspense: false, refreshInterval: PLACING_POLL_MS, dedupingInterval: 0 },
  );
  const destination = order ? orderDestination(order) : null;

  useEffect(() => {
    if (destination) navigate(destination, { replace: true });
  }, [destination, navigate]);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), PLACING_SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  if (error?.status === 404) return <NotFound name={name} namespace={namespace} type="Order" />;

  return (
    <PageSection hasBodyWrapper={false} isFilled>
      <Bullseye>
        <EmptyState
          headingLevel="h1"
          icon={() => <Spinner size="xl" aria-label="Placing your order" />}
          titleText="Placing your order…"
          variant="lg"
        >
          <EmptyStateBody aria-live="polite">
            {slow
              ? 'This is taking longer than usual. Your service will appear in My Services as soon as it is created, and this page will open it automatically.'
              : 'We are checking whether your order needs manager approval. You will be taken to your service, or to your order if it needs approval.'}
          </EmptyStateBody>
          {error && error.status !== 404 ? (
            <Alert variant="warning" isInline isPlain title="The order status could not be checked; retrying." />
          ) : null}
          {slow ? (
            <EmptyStateFooter>
              <Link to={`/services/${encodeURIComponent(namespace)}`}>Go to My Services</Link>
              <Button variant="link" onClick={() => mutate()}>
                Check again
              </Button>
            </EmptyStateFooter>
          ) : null}
        </EmptyState>
      </Bullseye>
    </PageSection>
  );
};

export default OrderPlacing;
