import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import useSWR from 'swr';
import {
  ActionList,
  ActionListItem,
  Alert,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  FormGroup,
  PageSection,
  ProgressStep,
  ProgressStepper,
  Split,
  SplitItem,
  Tab,
  Tabs,
  TabTitleText,
  TextArea,
  TextInput,
  Title,
} from '@patternfly/react-core';
import { Modal as PFModal, ModalBody as PFModalBody, ModalFooter as PFModalFooter, ModalHeader as PFModalHeader } from '@patternfly/react-core';
import CheckCircleIcon from '@patternfly/react-icons/dist/js/icons/check-circle-icon';
import ExclamationCircleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-circle-icon';
import ClockIcon from '@patternfly/react-icons/dist/js/icons/clock-icon';
import { apiPaths, fetcher, patchWhiteGloveRequest } from '@app/api';
import { WhiteGloveRequest } from '@app/types';
import { BABYLON_DOMAIN, DEMO_DOMAIN } from '@app/util';
import ErrorBoundaryPage from '@app/components/ErrorBoundaryPage';
import Footer from '@app/components/Footer';
import TimeInterval from '@app/components/TimeInterval';
import useSession from '@app/utils/useSession';

import './white-glove.css';

function stateLabel(state: string): string {
  switch (state) {
    case 'pending-approval': return 'Pending Approval';
    case 'approved': return 'Approved & Scheduled';
    case 'provisioning': return 'Provisioning';
    case 'running': return 'Running';
    case 'rejected': return 'Rejected';
    default: return state;
  }
}

function getBannerClass(state: string): string {
  return `wg-status-banner wg-status-banner--${state}`;
}

function getProgressVariant(stepState: string, currentState: string): 'success' | 'danger' | 'pending' | 'info' {
  const stateOrder = ['pending-approval', 'approved', 'provisioning', 'running'];
  const currentIndex = stateOrder.indexOf(currentState);

  if (currentState === 'rejected') {
    if (stepState === 'submitted' || stepState === 'pending-approval') return 'success';
    if (stepState === 'rejected') return 'danger';
    return 'pending';
  }

  const stepMapping: Record<string, number> = {
    submitted: -1,
    'pending-approval': 0,
    approved: 1,
    running: 3,
  };

  const stepIndex = stepMapping[stepState] ?? -1;
  if (stepIndex < currentIndex) return 'success';
  if (stepIndex === currentIndex) return 'info';
  return 'pending';
}

function isCurrent(stepState: string, currentState: string): boolean {
  if (currentState === 'rejected' && stepState === 'rejected') return true;
  if ((currentState === 'approved' || currentState === 'provisioning') && stepState === 'approved') return true;
  return stepState === currentState;
}

const WhiteGloveDetailContent: React.FC = () => {
  const { namespace, name } = useParams();
  const { isAdmin } = useSession().getSession();
  const [activeTab, setActiveTab] = useState<string>('details');
  const [comment, setComment] = useState('');
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const { data: wgr, mutate } = useSWR<WhiteGloveRequest>(
    namespace && name ? apiPaths.WHITE_GLOVE_REQUEST({ namespace, name }) : null,
    fetcher,
    { refreshInterval: 8000 },
  );

  if (!wgr) {
    return (
      <PageSection>
        <Title headingLevel="h1" size="2xl">Loading...</Title>
      </PageSection>
    );
  }

  const state = wgr.status?.state || 'pending-approval';
  const isRejected = state === 'rejected';
  const requester = wgr.metadata.annotations?.[`${DEMO_DOMAIN}/requester`]
    || wgr.metadata.annotations?.[`${BABYLON_DOMAIN}/created-by`]
    || '—';

  const listPath = isAdmin ? '/admin/white-glove-requests' : '/white-glove';

  async function handleReject() {
    const updated = await patchWhiteGloveRequest({
      namespace,
      name,
      patch: { status: { state: 'rejected', rejectionReason: rejectReason, rejectedAt: new Date().toISOString() } },
    });
    mutate(updated, false);
    setIsRejectModalOpen(false);
  }

  async function handleSlackUpdate(slackChannel: string) {
    const updated = await patchWhiteGloveRequest({
      namespace,
      name,
      patch: { spec: { slackChannel } },
    });
    mutate(updated, false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <PageSection variant="default">
        <Breadcrumb>
          <BreadcrumbItem>
            <Link to={listPath}>White Glove Requests</Link>
          </BreadcrumbItem>
          <BreadcrumbItem isActive>{wgr.spec.displayName || wgr.metadata.name}</BreadcrumbItem>
        </Breadcrumb>

        <Title headingLevel="h1" size="2xl" style={{ marginBottom: '16px' }}>
          {wgr.spec.displayName || wgr.metadata.name}
        </Title>

        <div className={getBannerClass(state)}>
          <Split hasGutter>
            <SplitItem isFilled>
              <div className="wg-status-banner__header">
                {state === 'pending-approval' && <ClockIcon className="wg-status-banner__icon" />}
                {(state === 'approved' || state === 'provisioning') && <CheckCircleIcon className="wg-status-banner__icon" />}
                {state === 'running' && <CheckCircleIcon className="wg-status-banner__icon" />}
                {isRejected && <ExclamationCircleIcon className="wg-status-banner__icon" />}
                <span className="wg-status-banner__state">{stateLabel(state)}</span>
              </div>
              <div className="wg-status-banner__meta">
                Submitted <TimeInterval toTimestamp={wgr.metadata.creationTimestamp} />
                {isAdmin && <> by <strong>{requester}</strong></>}
                {wgr.status?.assignee && <> &middot; Assigned to <strong>{wgr.status.assignee}</strong></>}
              </div>
            </SplitItem>
            {wgr.status?.jiraTicketId && (
              <SplitItem>
                <a href={wgr.status.jiraTicketUrl || '#'} target="_blank" rel="noopener noreferrer" className="wg-jira-link">
                  {wgr.status.jiraTicketId} &#8599;
                </a>
              </SplitItem>
            )}
          </Split>
          <ProgressStepper className="wg-status-banner__stepper">
            <ProgressStep variant="success" id="step-submitted" titleId="step-submitted-t" aria-label="Submitted completed">Submitted</ProgressStep>
            <ProgressStep
              variant={getProgressVariant('pending-approval', state)}
              isCurrent={isCurrent('pending-approval', state)}
              id="step-pending" titleId="step-pending-t" aria-label="Pending Approval"
            >
              Pending Approval
            </ProgressStep>
            {isRejected ? (
              <ProgressStep variant="danger" isCurrent id="step-rejected" titleId="step-rejected-t" aria-label="Rejected">Rejected</ProgressStep>
            ) : (
              <>
                <ProgressStep
                  variant={getProgressVariant('approved', state)}
                  isCurrent={isCurrent('approved', state)}
                  id="step-approved" titleId="step-approved-t" aria-label="Approved"
                >
                  Approved &amp; Scheduled
                </ProgressStep>
                <ProgressStep
                  variant={getProgressVariant('running', state)}
                  isCurrent={isCurrent('running', state)}
                  id="step-running" titleId="step-running-t" aria-label="Running"
                >
                  Running
                </ProgressStep>
              </>
            )}
          </ProgressStepper>
          {isRejected && wgr.status?.rejectionReason && (
            <Alert variant="danger" isInline isPlain title="Reason" style={{ marginTop: 'var(--pf-t--global--spacer--sm)' }}>
              {wgr.status.rejectionReason}
            </Alert>
          )}
        </div>

        {isAdmin && state === 'pending-approval' && (
          <ActionList style={{ marginBottom: 'var(--pf-t--global--spacer--lg)' }}>
            <ActionListItem>
              <Button variant="primary" component="a" href={`/admin/white-glove-requests/${namespace}/${name}/approve`}>Approve</Button>
            </ActionListItem>
            <ActionListItem>
              <Button variant="danger" onClick={() => setIsRejectModalOpen(true)}>Reject</Button>
            </ActionListItem>
          </ActionList>
        )}
      </PageSection>

      {isAdmin && (
        <PFModal isOpen={isRejectModalOpen} onClose={() => setIsRejectModalOpen(false)} variant="medium">
          <PFModalHeader title="Reject White Glove Request" />
          <PFModalBody>
            <p style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}>
              Provide a reason for rejecting the white glove request for <strong>{wgr.spec.displayName}</strong> from <strong>{requester}</strong>.
              The requester will be notified and the reason will be synced to the Jira ticket.
            </p>
            <FormGroup label="Reason for Rejection" isRequired fieldId="reject-reason">
              <TextArea
                id="reject-reason"
                placeholder="e.g. Resource capacity insufficient for the requested dates..."
                value={rejectReason}
                onChange={(_e, v) => setRejectReason(v)}
                rows={4}
              />
            </FormGroup>
          </PFModalBody>
          <PFModalFooter>
            <Button variant="danger" isDisabled={!rejectReason.trim()} onClick={handleReject}>Reject Request</Button>
            <Button variant="link" onClick={() => setIsRejectModalOpen(false)}>Cancel</Button>
          </PFModalFooter>
        </PFModal>
      )}

      <PageSection hasBodyWrapper={false} style={{ flexGrow: 1 }}>
        <Tabs activeKey={activeTab} onSelect={(_, tabIndex) => setActiveTab(tabIndex as string)}>
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
            {activeTab === 'details' ? (
              <DescriptionList isHorizontal style={{ marginTop: '16px' }}>
                <DescriptionListGroup>
                  <DescriptionListTerm>Request Type</DescriptionListTerm>
                  <DescriptionListDescription>
                    <span className="wg-label">White Glove</span>
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Catalog Item</DescriptionListTerm>
                  <DescriptionListDescription>
                    {wgr.spec.catalogItemName && wgr.spec.catalogItemNamespace ? (
                      <Link to={`/catalog/${wgr.spec.catalogItemNamespace}?item=${wgr.spec.catalogItemNamespace}/${wgr.spec.catalogItemName}`}>
                        {wgr.spec.displayName || wgr.spec.catalogItemName}
                      </Link>
                    ) : (
                      wgr.spec.displayName || wgr.metadata.name
                    )}
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Requested By</DescriptionListTerm>
                  <DescriptionListDescription>{requester}</DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Requested On</DescriptionListTerm>
                  <DescriptionListDescription>
                    <TimeInterval toTimestamp={wgr.metadata.creationTimestamp} />
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Jira Ticket</DescriptionListTerm>
                  <DescriptionListDescription>
                    {wgr.status?.jiraTicketId ? (
                      <a href={wgr.status.jiraTicketUrl || '#'} target="_blank" rel="noopener noreferrer">
                        {wgr.status.jiraTicketId} &#8599;
                      </a>
                    ) : '—'}
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Slack Channel</DescriptionListTerm>
                  <DescriptionListDescription>
                    {isAdmin ? (
                      <div style={{ width: '180px' }}>
                        <TextInput
                          id="admin-slack"
                          placeholder="e.g. #wg-rhel9-summit"
                          value={wgr.spec.slackChannel || ''}
                          onChange={(_e, v) => handleSlackUpdate(v)}
                        />
                      </div>
                    ) : wgr.spec.slackChannel ? (
                      wgr.spec.slackChannel
                    ) : (
                      <em style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>
                        A dedicated Slack channel will be created by the operations team.
                      </em>
                    )}
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Assignee</DescriptionListTerm>
                  <DescriptionListDescription>
                    {wgr.status?.assignee || <span style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>Unassigned</span>}
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Purpose</DescriptionListTerm>
                  <DescriptionListDescription>{wgr.spec.purpose || '—'}</DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Event Date</DescriptionListTerm>
                  <DescriptionListDescription>
                    {wgr.spec.eventDate ? <TimeInterval toTimestamp={wgr.spec.eventDate} /> : '—'}
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Event End Date</DescriptionListTerm>
                  <DescriptionListDescription>
                    {wgr.spec.eventEndDate ? <TimeInterval toTimestamp={wgr.spec.eventEndDate} /> : '—'}
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Number of Users</DescriptionListTerm>
                  <DescriptionListDescription>{wgr.spec.numberOfUsers || '—'}</DescriptionListDescription>
                </DescriptionListGroup>
                {wgr.spec.notes && (
                  <DescriptionListGroup>
                    <DescriptionListTerm>Notes</DescriptionListTerm>
                    <DescriptionListDescription>
                      <div className="wg-notes-block">{wgr.spec.notes}</div>
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                )}
                {wgr.status?.serviceName && wgr.status?.serviceNamespace && (
                  <DescriptionListGroup>
                    <DescriptionListTerm>Service</DescriptionListTerm>
                    <DescriptionListDescription>
                      <Button variant="primary" component="a" href={`/services/${wgr.status.serviceNamespace}/${wgr.status.serviceName}`}>
                        {wgr.spec.displayName || wgr.status.serviceName} &#8599;
                      </Button>
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                )}
              </DescriptionList>
            ) : null}
          </Tab>
          <Tab eventKey="activity" title={<TabTitleText>Activity</TabTitleText>}>
            {activeTab === 'activity' ? (
              <div style={{ marginTop: '16px' }}>
                <div className="wg-comment-input">
                  <TextArea
                    id="activity-comment"
                    value={comment}
                    onChange={(_, value) => setComment(value)}
                    placeholder="Add a comment... (synced with Jira)"
                    rows={2}
                  />
                  <div className="wg-comment-input__actions">
                    <Button variant="primary" size="sm" isDisabled={!comment.trim()}>Send</Button>
                  </div>
                </div>
                <p style={{ color: 'var(--pf-t--global--text--color--subtle)', fontStyle: 'italic' }}>
                  Activity feed will sync with Jira comments.
                </p>
              </div>
            ) : null}
          </Tab>
        </Tabs>
      </PageSection>

      <Footer />
    </div>
  );
};

const WhiteGloveDetail: React.FC = () => {
  const { namespace, name } = useParams();
  return (
    <ErrorBoundaryPage namespace={namespace || ''} name={name || ''} type="White Glove Request">
      <WhiteGloveDetailContent />
    </ErrorBoundaryPage>
  );
};

export default WhiteGloveDetail;
