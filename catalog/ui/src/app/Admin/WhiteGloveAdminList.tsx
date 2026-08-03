import React from 'react';
import { Link } from 'react-router-dom';
import useSWR from 'swr';
import {
  Breadcrumb,
  BreadcrumbItem,
  PageSection,
  Title,
} from '@patternfly/react-core';
import { Table, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';
import CheckCircleIcon from '@patternfly/react-icons/dist/js/icons/check-circle-icon';
import ExclamationCircleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-circle-icon';
import ClockIcon from '@patternfly/react-icons/dist/js/icons/clock-icon';
import { apiPaths, fetcher } from '@app/api';
import { WhiteGloveRequestList } from '@app/types';
import { DEMO_DOMAIN, FETCH_BATCH_LIMIT } from '@app/util';
import TimeInterval from '@app/components/TimeInterval';
import ErrorBoundaryPage from '@app/components/ErrorBoundaryPage';

import '@app/WhiteGlove/white-glove.css';

function statusIcon(state: string) {
  switch (state) {
    case 'pending-approval':
      return <span className="service-status--waiting" style={{ textTransform: 'capitalize' }}><ClockIcon /> Pending Approval</span>;
    case 'approved':
    case 'provisioning':
      return <span className="service-status--in-progress" style={{ textTransform: 'capitalize' }}><CheckCircleIcon /> Approved &amp; Scheduled</span>;
    case 'running':
      return <span className="service-status--running" style={{ textTransform: 'capitalize' }}><CheckCircleIcon /> Running</span>;
    case 'rejected':
      return <span className="service-status--failed" style={{ textTransform: 'capitalize' }}><ExclamationCircleIcon /> Rejected</span>;
    default:
      return <span className="service-status--waiting" style={{ textTransform: 'capitalize' }}><ClockIcon /> {state || 'Pending Approval'}</span>;
  }
}

const WhiteGloveAdminListContent: React.FC = () => {
  const { data } = useSWR<WhiteGloveRequestList>(
    apiPaths.WHITE_GLOVE_REQUESTS({ limit: FETCH_BATCH_LIMIT }),
    fetcher,
    { refreshInterval: 8000 },
  );
  const requests = data?.items || [];

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <Breadcrumb>
          <BreadcrumbItem>Admin</BreadcrumbItem>
          <BreadcrumbItem isActive>White Glove Requests</BreadcrumbItem>
        </Breadcrumb>
        <Title headingLevel="h1" size="lg" style={{ marginBottom: 'var(--pf-t--global--spacer--lg)' }}>
          White Glove Requests
        </Title>

        <Table aria-label="White Glove Requests" variant="compact">
          <Thead>
            <Tr>
              <Th>Name</Th>
              <Th>Requester</Th>
              <Th>Status</Th>
              <Th>Submitted</Th>
              <Th>Assignee</Th>
              <Th>Jira</Th>
            </Tr>
          </Thead>
          <Tbody>
            {requests.map((wgr) => (
              <Tr key={wgr.metadata.uid || wgr.metadata.name}>
                <Td dataLabel="Name">
                  <Link to={`/admin/white-glove-requests/${wgr.metadata.namespace}/${wgr.metadata.name}`}>
                    {wgr.spec.displayName || wgr.metadata.name}
                  </Link>
                </Td>
                <Td dataLabel="Requester" style={{ fontSize: '13px' }}>
                  {wgr.metadata.annotations?.[`${DEMO_DOMAIN}/requester`] || '—'}
                </Td>
                <Td dataLabel="Status">
                  {statusIcon(wgr.status?.state)}
                </Td>
                <Td dataLabel="Submitted" style={{ fontSize: '13px', color: 'var(--pf-t--global--text--color--subtle)' }}>
                  <TimeInterval toTimestamp={wgr.metadata.creationTimestamp} />
                </Td>
                <Td dataLabel="Assignee" style={{ fontSize: '13px' }}>
                  {wgr.status?.assignee || <span style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>Unassigned</span>}
                </Td>
                <Td dataLabel="Jira">
                  {wgr.status?.jiraTicketId ? (
                    <a href={wgr.status.jiraTicketUrl || '#'} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px' }}>
                      {wgr.status.jiraTicketId}
                    </a>
                  ) : '—'}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </PageSection>
    </>
  );
};

const WhiteGloveAdminList: React.FC = () => (
  <ErrorBoundaryPage namespace="" name="" type="White Glove Requests">
    <WhiteGloveAdminListContent />
  </ErrorBoundaryPage>
);

export default WhiteGloveAdminList;
