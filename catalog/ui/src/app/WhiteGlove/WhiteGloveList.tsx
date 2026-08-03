import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  EmptyState,
  EmptyStateBody,
  EmptyStateFooter,
  PageSection,
  Split,
  SplitItem,
  Title,
} from '@patternfly/react-core';
import CheckCircleIcon from '@patternfly/react-icons/dist/js/icons/check-circle-icon';
import ClockIcon from '@patternfly/react-icons/dist/js/icons/clock-icon';
import ExclamationCircleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-circle-icon';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import { Table, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';
import { apiPaths, fetcher } from '@app/api';
import { WhiteGloveRequest, WhiteGloveRequestList } from '@app/types';
import { FETCH_BATCH_LIMIT } from '@app/util';
import ErrorBoundaryPage from '@app/components/ErrorBoundaryPage';
import Footer from '@app/components/Footer';
import TimeInterval from '@app/components/TimeInterval';
import useSession from '@app/utils/useSession';

import './white-glove.css';

function statusIcon(state: string): React.ReactNode {
  switch (state) {
    case 'pending-approval':
      return <ClockIcon />;
    case 'approved':
    case 'running':
      return <CheckCircleIcon />;
    case 'rejected':
      return <ExclamationCircleIcon />;
    case 'provisioning':
      return <CheckCircleIcon />;
    default:
      return <ClockIcon />;
  }
}

function statusCssClass(state: string): string {
  switch (state) {
    case 'pending-approval':
      return 'service-status--waiting';
    case 'approved':
    case 'provisioning':
      return 'service-status--in-progress';
    case 'running':
      return 'service-status--running';
    case 'rejected':
      return 'service-status--failed';
    default:
      return 'service-status--waiting';
  }
}

function statusLabel(state: string): string {
  switch (state) {
    case 'pending-approval':
      return 'Pending Approval';
    case 'approved':
      return 'Approved';
    case 'provisioning':
      return 'Provisioning';
    case 'running':
      return 'Running';
    case 'rejected':
      return 'Rejected';
    default:
      return state;
  }
}

const WhiteGloveListContent: React.FC = () => {
  const navigate = useNavigate();
  const { userNamespace } = useSession().getSession();

  const { data } = useSWR<WhiteGloveRequestList>(
    userNamespace
      ? apiPaths.WHITE_GLOVE_REQUESTS({ namespace: userNamespace.name, limit: FETCH_BATCH_LIMIT })
      : null,
    fetcher,
    { refreshInterval: 8000 },
  );

  const items: WhiteGloveRequest[] = data?.items || [];

  if (!userNamespace) {
    return (
      <PageSection>
        <EmptyState headingLevel="h1" icon={ExclamationTriangleIcon} titleText="No namespace available" variant="full">
          <EmptyStateBody>Please ensure you have a valid namespace to view white glove requests.</EmptyStateBody>
        </EmptyState>
      </PageSection>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <PageSection hasBodyWrapper={false} variant="default">
        <Breadcrumb>
          <BreadcrumbItem isActive>White Glove Requests</BreadcrumbItem>
        </Breadcrumb>
        <Split hasGutter>
          <SplitItem isFilled>
            <Title headingLevel="h1" size="2xl">
              White Glove Requests
            </Title>
          </SplitItem>
          <SplitItem>
            <Button variant="primary" onClick={() => navigate('/white-glove/create')}>
              New Request
            </Button>
          </SplitItem>
        </Split>
      </PageSection>

      <PageSection hasBodyWrapper={false} style={{ flexGrow: 1 }}>
        {items.length === 0 ? (
          <EmptyState headingLevel="h2" icon={ExclamationTriangleIcon} titleText="No white glove requests" variant="full">
            <EmptyStateBody>You have not submitted any white glove requests yet.</EmptyStateBody>
            <EmptyStateFooter>
              <Button variant="primary" onClick={() => navigate('/white-glove/create')}>
                New Request
              </Button>
            </EmptyStateFooter>
          </EmptyState>
        ) : (
          <Table aria-label="White Glove Requests" variant="compact">
            <Thead>
              <Tr>
                <Th>Name</Th>
                <Th>Status</Th>
                <Th>Submitted</Th>
                <Th>Assignee</Th>
                <Th>Jira</Th>
                <Th>Service</Th>
              </Tr>
            </Thead>
            <Tbody>
              {items.map((wgr: WhiteGloveRequest) => {
                const state = wgr.status?.state || 'pending-approval';
                return (
                  <Tr key={wgr.metadata.uid}>
                    <Td>
                      <Link to={`/white-glove/${wgr.metadata.namespace}/${wgr.metadata.name}`}>
                        {wgr.spec.displayName || wgr.metadata.name}
                      </Link>
                    </Td>
                    <Td>
                      <span className={statusCssClass(state)}>
                        {statusIcon(state)} {statusLabel(state)}
                      </span>
                    </Td>
                    <Td>
                      <TimeInterval toTimestamp={wgr.metadata.creationTimestamp} />
                    </Td>
                    <Td>{wgr.status?.assignee || '—'}</Td>
                    <Td>
                      {wgr.status?.jiraTicketUrl ? (
                        <a href={wgr.status.jiraTicketUrl} target="_blank" rel="noopener noreferrer">
                          {wgr.status.jiraTicketId || 'View'}
                        </a>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td>
                      {wgr.status?.serviceName && wgr.status?.serviceNamespace ? (
                        <Link to={`/services/${wgr.status.serviceNamespace}/${wgr.status.serviceName}`}>
                          {wgr.status.serviceName}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        )}
      </PageSection>

      <Footer />
    </div>
  );
};

const WhiteGloveList: React.FC = () => (
  <ErrorBoundaryPage namespace="" name="" type="White Glove Requests">
    <WhiteGloveListContent />
  </ErrorBoundaryPage>
);

export default WhiteGloveList;
