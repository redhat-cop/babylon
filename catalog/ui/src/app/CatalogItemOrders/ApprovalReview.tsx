import React, { useState } from 'react';
import { Link } from 'react-router-dom';
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
  EmptyState,
  EmptyStateBody,
  List,
  ListItem,
  PageSection,
  Split,
  SplitItem,
  Title,
} from '@patternfly/react-core';
import { apiPaths } from '@app/api';
import useSession from '@app/utils/useSession';
import LoadingSection from '@app/components/LoadingSection';
import NotFound from '@app/components/NotFound';
import { decideCatalogItemOrder, orderFetcher, toOrderApiError } from './catalog-item-order-api';
import type { OrderApiError } from './catalog-item-order-api';
import type { ApprovalReview as ApprovalReviewData } from './types';
import {
  authorityLabel,
  describeSchedule,
  formatParameterValue,
  getReviewStatus,
  orderErrorTitle,
  orderTypeLabel,
} from './order-utils';
import OrderStatusLabel from './OrderStatusLabel';
import OrderTime from './OrderTime';
import CatalogItemName from './CatalogItemName';
import ConfirmActionModal from './ConfirmActionModal';
import { approvalsBasePath } from './ApprovalsList';
import type { ApprovalsScope } from './ApprovalsList';

const PENDING_REFRESH_MS = 30000;

type Notice = { variant: 'success' | 'warning' | 'danger'; title: string; message?: string };

const Field: React.FC<{ term: string; children: React.ReactNode }> = ({ term, children }) => (
  <DescriptionListGroup>
    <DescriptionListTerm>{term}</DescriptionListTerm>
    <DescriptionListDescription>{children}</DescriptionListDescription>
  </DescriptionListGroup>
);

/** Errors that mean the request is no longer decidable: reload it, never replay the decision. */
const STALE_CODES = ['already_decided', 'not_pending', 'expired', 'request_changed', 'policy_changed', 'order_conflict'];

const ReviewError: React.FC<{ error: OrderApiError; onRetry: () => void }> = ({ error, onRetry }) => {
  if (error.code === 'self_decision') {
    return (
      <EmptyState headingLevel="h2" titleText="You cannot review your own order" variant="lg">
        <EmptyStateBody>
          Your manager, someone higher in your management chain, or an administrator needs to review it.
        </EmptyStateBody>
      </EmptyState>
    );
  }
  if (error.code === 'not_authorized' || error.status === 403) {
    return (
      <EmptyState headingLevel="h2" titleText="You are not an approver for this request" variant="lg">
        <EmptyStateBody>
          Only the requester&apos;s managers and catalog administrators can review it. If you expected to be able to,
          make sure you are signed in with the account the email was sent to.
        </EmptyStateBody>
      </EmptyState>
    );
  }
  return (
    <Alert
      variant={error.status === 503 ? 'warning' : 'danger'}
      isInline
      title={orderErrorTitle(error.code) === 'Request failed' ? 'The request could not be loaded' : orderErrorTitle(error.code)}
      actionLinks={
        <Button variant="link" isInline onClick={onRetry}>
          Try again
        </Button>
      }
    >
      {error.message}
    </Alert>
  );
};

const ApprovalReview: React.FC<{ uid: string; scope: ApprovalsScope }> = ({ uid, scope }) => {
  const { authUser } = useSession().getSession();
  const [modal, setModal] = useState<'approve' | 'deny' | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const { data: review, error, isLoading, mutate } = useSWR<ApprovalReviewData, OrderApiError>(
    [apiPaths.CATALOG_ITEM_ORDER_APPROVAL({ uid }), authUser],
    ([path]: [string, string]) => orderFetcher<ApprovalReviewData>(path),
    {
      suspense: false,
      shouldRetryOnError: false,
      // Keep a pending request fresh so a decision by someone else shows up.
      refreshInterval: (latest) => (latest?.canDecide ? PENDING_REFRESH_MS : 0),
    },
  );
  const basePath = approvalsBasePath(scope);

  const breadcrumb = (
    <Breadcrumb>
      {scope === 'admin' ? <BreadcrumbItem>Admin</BreadcrumbItem> : null}
      <BreadcrumbItem render={({ className }) => <Link to={basePath} className={className}>Approvals</Link>} />
      <BreadcrumbItem isActive>Request</BreadcrumbItem>
    </Breadcrumb>
  );

  if (isLoading && !review) return <LoadingSection />;
  if (error && !review) {
    if (error.status === 404) return <NotFound name={uid} type="Approval request" />;
    return (
      <PageSection hasBodyWrapper={false}>
        {breadcrumb}
        <ReviewError error={error} onRetry={() => mutate()} />
      </PageSection>
    );
  }

  const status = getReviewStatus(review);
  const decision = review.approval?.decision;
  const scheduleRows = describeSchedule(review.request?.schedule);
  const parameters = Object.entries(review.parameters || {}).sort(([a], [b]) => a.localeCompare(b));
  const manager = review.approval?.manager?.directManager;

  async function decide(outcome: 'approve' | 'deny', comment: string) {
    setNotice(null);
    try {
      const updated = await decideCatalogItemOrder(uid, outcome, comment);
      await mutate(updated, { revalidate: false });
      setModal(null);
      setNotice(
        outcome === 'approve'
          ? {
              variant: 'success',
              title: 'Request approved',
              message: 'The requester is notified and the service is created automatically.',
            }
          : { variant: 'success', title: 'Request denied', message: 'The requester is notified. Nothing is created.' },
      );
    } catch (thrown) {
      const apiError = await toOrderApiError(thrown);
      setModal(null);
      if (STALE_CODES.includes(apiError.code)) {
        // Show what actually happened instead of retrying the decision.
        await mutate();
      }
      setNotice({
        variant: STALE_CODES.includes(apiError.code) || apiError.status === 503 ? 'warning' : 'danger',
        title: orderErrorTitle(apiError.code),
        message: apiError.message,
      });
    }
  }

  return (
    <>
      <ConfirmActionModal
        isOpen={modal === 'approve'}
        title="Approve this request?"
        confirmLabel="Approve"
        withComment
        onConfirm={(comment) => decide('approve', comment)}
        onClose={() => setModal(null)}
      >
        <p>
          The service for <strong>{review.catalogItem.displayName || review.catalogItem.name}</strong> requested by{' '}
          <strong>{review.requester.email || review.requester.user}</strong> will be created.
        </p>
      </ConfirmActionModal>
      <ConfirmActionModal
        isOpen={modal === 'deny'}
        title="Deny this request?"
        confirmLabel="Deny"
        confirmVariant="danger"
        withComment
        onConfirm={(comment) => decide('deny', comment)}
        onClose={() => setModal(null)}
      >
        <p>Nothing will be created, and the requester will have to place a new order.</p>
      </ConfirmActionModal>

      <PageSection hasBodyWrapper={false}>
        {breadcrumb}
        <Split hasGutter style={{ alignItems: 'center' }}>
          <SplitItem>
            <Title headingLevel="h1" size="xl">
              {review.catalogItem.displayName && review.catalogItem.displayName !== review.catalogItem.name ? (
                review.catalogItem.displayName
              ) : (
                <CatalogItemName namespace={review.catalogItem.namespace} name={review.catalogItem.name} />
              )}
            </Title>
          </SplitItem>
          <SplitItem isFilled>
            <OrderStatusLabel label={status.label} tone={status.tone} />
          </SplitItem>
        </Split>
      </PageSection>

      <PageSection hasBodyWrapper={false}>
        {notice ? (
          <Alert
            variant={notice.variant}
            isInline
            title={notice.title}
            actionClose={<AlertActionCloseButton onClose={() => setNotice(null)} />}
            style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}
            aria-live="polite"
          >
            {notice.message}
          </Alert>
        ) : null}
        {review.canDecide ? (
          <>
            <p>
              Review the request below. Nothing is recorded until you choose <strong>Approve</strong> or{' '}
              <strong>Deny</strong>.
            </p>
            <ActionList style={{ marginTop: 'var(--pf-t--global--spacer--md)' }}>
              <ActionListItem>
                <Button variant="primary" onClick={() => setModal('approve')}>
                  Approve
                </Button>
              </ActionListItem>
              <ActionListItem>
                <Button variant="secondary" isDanger onClick={() => setModal('deny')}>
                  Deny
                </Button>
              </ActionListItem>
            </ActionList>
          </>
        ) : decision ? null : (
          <Alert variant="info" isInline isPlain title="This request can no longer be decided." />
        )}
      </PageSection>

      <PageSection hasBodyWrapper={false}>
        <DescriptionList isHorizontal isCompact aria-label="Approval request">
          <Field term="Requester">{review.requester.email || review.requester.user}</Field>
          <Field term="Order type">{orderTypeLabel(review.request?.orderType)}</Field>
          {review.request?.quantity ? <Field term="Quantity">{review.request.quantity}</Field> : null}
          {review.request?.durationHours ? <Field term="Duration">{`${review.request.durationHours} hours`}</Field> : null}
          {review.request?.purpose ? <Field term="Purpose">{review.request.purpose}</Field> : null}
          {review.request?.activity ? <Field term="Activity">{review.request.activity}</Field> : null}
          {review.request?.explanation ? <Field term="Explanation">{review.request.explanation}</Field> : null}
          {scheduleRows.map((row) => (
            <Field key={row.label} term={row.label}>
              <OrderTime value={row.value} />
            </Field>
          ))}
          {review.reasons?.length > 0 ? (
            <Field term="Why approval is needed">
              <List isPlain>
                {review.reasons.map((reason) => (
                  <ListItem key={reason}>{reason}</ListItem>
                ))}
              </List>
            </Field>
          ) : null}
          <Field term="Submitted">
            <OrderTime value={review.submittedAt} />
          </Field>
          {review.approval?.expiresAt ? (
            <Field term="Expires">
              <OrderTime value={review.approval.expiresAt} />
            </Field>
          ) : null}
          {manager?.email ? (
            <Field term="Direct manager">{manager.name ? `${manager.name} <${manager.email}>` : manager.email}</Field>
          ) : null}
          {review.authority ? <Field term="You can review as">{authorityLabel(review.authority)}</Field> : null}
          {decision ? (
            <>
              <Field term={decision.outcome === 'Approved' ? 'Approved by' : 'Denied by'}>
                {decision.decidedByEmail || decision.decidedBy || '-'}
                {decision.decidedAt ? (
                  <>
                    {' '}
                    (<OrderTime value={decision.decidedAt} />)
                  </>
                ) : null}
              </Field>
              {decision.comment ? <Field term="Comment">{decision.comment}</Field> : null}
            </>
          ) : null}
          {parameters.length > 0 ? (
            <Field term="Parameters">
              <List isPlain>
                {parameters.map(([name, value]) => (
                  <ListItem key={name}>
                    <code>{name}</code>: {formatParameterValue(value)}
                  </ListItem>
                ))}
              </List>
            </Field>
          ) : null}
        </DescriptionList>
      </PageSection>
    </>
  );
};

export default ApprovalReview;
