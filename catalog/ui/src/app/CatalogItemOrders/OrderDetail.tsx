import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import useSWR from 'swr';
import {
  ActionList,
  ActionListItem,
  Alert,
  AlertActionCloseButton,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  List,
  ListItem,
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
import NotFound from '@app/components/NotFound';
import { cancelCatalogItemOrder, orderFetcher, toOrderApiError } from './catalog-item-order-api';
import type { OrderApiError } from './catalog-item-order-api';
import type { CatalogItemOrder } from './types';
import {
  approvalReasons,
  describeSchedule,
  effectiveSchedule,
  formatParameterValue,
  getOrderStatus,
  isOrderActive,
  orderErrorTitle,
  orderQuantity,
  orderResourceLinks,
  orderTypeLabel,
  safeParameters,
} from './order-utils';
import OrderStatusLabel from './OrderStatusLabel';
import OrderTime from './OrderTime';
import CatalogItemName from './CatalogItemName';
import ConfirmActionModal from './ConfirmActionModal';
import { ACTIVE_REFRESH_MS } from './OrdersList';

type ActionError = { title: string; message: string; variant: 'danger' | 'warning' };

const Field: React.FC<{ term: string; children: React.ReactNode }> = ({ term, children }) => (
  <DescriptionListGroup>
    <DescriptionListTerm>{term}</DescriptionListTerm>
    <DescriptionListDescription>{children}</DescriptionListDescription>
  </DescriptionListGroup>
);

const ApprovalDetails: React.FC<{ order: CatalogItemOrder }> = ({ order }) => {
  const approval = order.approval || {};
  const reasons = approvalReasons(order);
  const manager = approval.manager;
  return (
    <DescriptionList isHorizontal isCompact aria-label="Approval">
      <Field term="Approval">
        {approval.state === 'NotRequired'
          ? approval.exemption
            ? `Not required: ${approval.exemption.reason || 'exempt'}`
            : 'Not required'
          : approval.state || 'Not evaluated yet'}
      </Field>
      {reasons.length > 0 ? (
        <Field term="Why approval is needed">
          <List isPlain>
            {reasons.map((reason) => (
              <ListItem key={reason}>{reason}</ListItem>
            ))}
          </List>
        </Field>
      ) : null}
      {manager ? (
        <Field term="Manager">
          {manager.directManager?.email
            ? `${manager.directManager.name ? `${manager.directManager.name} ` : ''}<${manager.directManager.email}>`
            : manager.state === 'Unresolved' || manager.state === 'Failed'
              ? manager.message || 'Your manager could not be determined yet.'
              : 'Looking up your manager...'}
        </Field>
      ) : null}
      {approval.requestedAt ? (
        <Field term="Requested">
          <OrderTime value={approval.requestedAt} />
        </Field>
      ) : null}
      {approval.expiresAt && order.phase === 'PendingApproval' ? (
        <Field term="Expires">
          <OrderTime value={approval.expiresAt} />
        </Field>
      ) : null}
      {approval.decision ? (
        <>
          <Field term={approval.decision.outcome === 'Approved' ? 'Approved by' : 'Denied by'}>
            {approval.decision.decidedByEmail || approval.decision.decidedBy || '-'}
            {approval.decision.decidedAt ? (
              <>
                {' '}
                (<OrderTime value={approval.decision.decidedAt} />)
              </>
            ) : null}
          </Field>
          {approval.decision.comment ? <Field term="Comment">{approval.decision.comment}</Field> : null}
        </>
      ) : null}
      {approval.reviewUrl && order.phase === 'PendingApproval' ? (
        <Field term="Approval request link">
          <a href={approval.reviewUrl}>{approval.reviewUrl}</a>
        </Field>
      ) : null}
    </DescriptionList>
  );
};

const OrderDetailContent: React.FC<{ namespace: string; name: string }> = ({ namespace, name }) => {
  const [modal, setModal] = useState<'cancel' | null>(null);
  const [actionError, setActionError] = useState<ActionError | null>(null);
  const { authUser } = useSession().getSession();
  const { data: order, error, isLoading, mutate } = useSWR<CatalogItemOrder, OrderApiError>(
    [apiPaths.CATALOG_ITEM_ORDER({ namespace, name }), authUser],
    ([path]: [string, string]) => orderFetcher<CatalogItemOrder>(path),
    {
      suspense: false,
      refreshInterval: (latest) => (latest && isOrderActive(latest) ? ACTIVE_REFRESH_MS : 0),
    },
  );

  if (isLoading && !order) return <LoadingSection />;
  if (error && !order) {
    if (error.status === 404) return <NotFound name={name} namespace={namespace} type="Order" />;
    return (
      <PageSection hasBodyWrapper={false}>
        <Alert variant="danger" isInline title="The order could not be loaded" actionLinks={<Button variant="link" isInline onClick={() => mutate()}>Try again</Button>}>
          {error.message}
        </Alert>
      </PageSection>
    );
  }

  const status = getOrderStatus(order);
  const links = orderResourceLinks(order);
  const canCancel = order.cancel?.allowed === true;
  const quantity = orderQuantity(order);
  const parameters = safeParameters(order.request?.parameters);
  const scheduleRows = describeSchedule(effectiveSchedule(order));

  async function cancelOrder() {
    setActionError(null);
    try {
      const updated = await cancelCatalogItemOrder(order);
      await mutate(updated, { revalidate: true });
      setModal(null);
    } catch (thrown) {
      const apiError = await toOrderApiError(thrown);
      setModal(null);
      // The order changed under us (for example provisioning started); show its current state.
      await mutate();
      setActionError({
        title: apiError.status === 409 ? orderErrorTitle(apiError.code) : 'Cancel failed',
        message: apiError.message,
        variant: apiError.status === 409 ? 'warning' : 'danger',
      });
    }
  }

  return (
    <>
      <ConfirmActionModal
        isOpen={modal === 'cancel'}
        title="Cancel this order?"
        confirmLabel="Cancel order"
        confirmVariant="danger"
        onConfirm={() => cancelOrder()}
        onClose={() => setModal(null)}
      >
        <p>The order stops and no environment is created. To get this item later, place a new order.</p>
      </ConfirmActionModal>

      <PageSection hasBodyWrapper={false}>
        <Breadcrumb>
          <BreadcrumbItem render={({ className }) => <Link to="/orders" className={className}>Orders</Link>} />
          <BreadcrumbItem isActive>{order.name}</BreadcrumbItem>
        </Breadcrumb>
        <Split hasGutter style={{ alignItems: 'center' }}>
          <SplitItem>
            <Title headingLevel="h1" size="xl">
              <CatalogItemName namespace={order.catalogItem.namespace} name={order.catalogItem.name} />
            </Title>
          </SplitItem>
          <SplitItem isFilled>
            <OrderStatusLabel label={status.label} tone={status.tone} />
          </SplitItem>
        </Split>
      </PageSection>

      <PageSection hasBodyWrapper={false}>
        {actionError ? (
          <Alert
            variant={actionError.variant}
            isInline
            title={actionError.title}
            actionClose={<AlertActionCloseButton onClose={() => setActionError(null)} />}
            style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}
          >
            {actionError.message}
          </Alert>
        ) : null}
        {order.phase === 'PendingApproval' && order.approval?.manager?.state === 'Failed' ? (
          <Alert
            variant="warning"
            isInline
            title="Your manager could not be found"
            style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}
          >
            {order.approval.manager.message ||
              'No approval request was sent to a manager. An administrator must review this request.'}
          </Alert>
        ) : null}
        <Alert
          variant={status.tone === 'success' ? 'success' : status.tone === 'danger' ? 'danger' : status.tone === 'warning' ? 'warning' : 'info'}
          isInline
          title={status.label}
          aria-live="polite"
        >
          <p>{status.description}</p>
          {links.length > 0 ? (
            <p>
              {links.map((link) => (
                <Link key={link.to} to={link.to} style={{ marginInlineEnd: 'var(--pf-t--global--spacer--md)' }}>
                  {link.label}
                </Link>
              ))}
            </p>
          ) : null}
        </Alert>

        {canCancel ? (
          <ActionList style={{ marginTop: 'var(--pf-t--global--spacer--md)' }}>
            <ActionListItem>
              <Button variant="secondary" isDanger onClick={() => setModal('cancel')}>
                Cancel order
              </Button>
            </ActionListItem>
          </ActionList>
        ) : null}
      </PageSection>

      <PageSection hasBodyWrapper={false}>
        <Title headingLevel="h2" size="lg">
          Request
        </Title>
        <DescriptionList isHorizontal isCompact aria-label="Request">
          <Field term="Order type">{orderTypeLabel(order.orderType)}</Field>
          {quantity !== undefined ? <Field term="Quantity">{quantity}</Field> : null}
          <Field term="Project">{order.namespace}</Field>
          <Field term="Submitted">
            <OrderTime value={order.submittedAt} />
          </Field>
          {order.request?.purpose ? <Field term="Purpose">{order.request.purpose}</Field> : null}
          {order.request?.activity ? <Field term="Activity">{order.request.activity}</Field> : null}
          {order.request?.explanation ? <Field term="Explanation">{order.request.explanation}</Field> : null}
          {(order.request?.salesforceItems || []).length > 0 ? (
            <Field term="Salesforce">
              {order.request.salesforceItems.map((item) => `${item.type} ${item.id}`).join(', ')}
            </Field>
          ) : null}
          {scheduleRows.map((row) => (
            <Field key={row.label} term={row.label}>
              <OrderTime value={row.value} />
            </Field>
          ))}
          {parameters.length > 0 ? (
            <Field term="Parameters">
              <List isPlain>
                {parameters.map(([parameterName, value]) => (
                  <ListItem key={parameterName}>
                    <code>{parameterName}</code>: {formatParameterValue(value)}
                  </ListItem>
                ))}
              </List>
            </Field>
          ) : null}
        </DescriptionList>
      </PageSection>

      <PageSection hasBodyWrapper={false}>
        <Title headingLevel="h2" size="lg">
          Approval
        </Title>
        <ApprovalDetails order={order} />
      </PageSection>

      {order.history?.length > 0 ? (
        <PageSection hasBodyWrapper={false}>
          <Title headingLevel="h2" size="lg">
            History
          </Title>
          <Table aria-label="Order history" variant="compact">
            <Thead>
              <Tr>
                <Th>Time</Th>
                <Th>Event</Th>
                <Th>Details</Th>
              </Tr>
            </Thead>
            <Tbody>
              {[...order.history].reverse().map((entry, index) => (
                // eslint-disable-next-line @eslint-react/no-array-index-key -- history entries have no id and timestamps can repeat; the index disambiguates them
                <Tr key={`${entry.timestamp}-${index}`}>
                  <Td dataLabel="Time">
                    <OrderTime value={entry.timestamp} />
                  </Td>
                  <Td dataLabel="Event">{entry.event}</Td>
                  <Td dataLabel="Details">{entry.message || '-'}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </PageSection>
      ) : null}
    </>
  );
};

const OrderDetail: React.FC = () => {
  const { namespace, name } = useParams();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'auto', flexGrow: 1 }}>
      <OrderDetailContent namespace={namespace} name={name} />
      <Footer />
    </div>
  );
};

export default OrderDetail;
