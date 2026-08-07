import React, { useState } from 'react';
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
  Pagination,
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
import { DEMO_DOMAIN } from '@app/util';
import ErrorBoundaryPage from '@app/components/ErrorBoundaryPage';

import TimeInterval from '@app/components/TimeInterval';
import useSession from '@app/utils/useSession';

import '@app/Services/service-status.css';
import './white-glove.css';

function statusIcon(state: string): React.ReactNode {
  switch (state) {
    case 'pending-approval':
      return <ClockIcon />;
    case 'approved':
      return <CheckCircleIcon />;
    case 'rejected':
      return <ExclamationCircleIcon />;
    default:
      return <ClockIcon />;
  }
}

function statusCssClass(state: string): string {
  switch (state) {
    case 'pending-approval':
      return 'service-status--waiting';
    case 'approved':
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
    case 'rejected':
      return 'Rejected';
    default:
      return state;
  }
}

const defaultPerPage = 20;

const WhiteGloveListContent: React.FC = () => {
  const navigate = useNavigate();
  const { userNamespace } = useSession().getSession();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(defaultPerPage);

  const { data, mutate } = useSWR<WhiteGloveRequestList>(
    userNamespace
      ? apiPaths.WHITE_GLOVE_REQUESTS({ namespace: userNamespace.name })
      : null,
    fetcher,
    { refreshInterval: 8000 },
  );

  const items: WhiteGloveRequest[] = (data?.items || []).sort(
    (a, b) => new Date(b.metadata.creationTimestamp).getTime() - new Date(a.metadata.creationTimestamp).getTime(),
  );
  const paginatedItems = items.slice((page - 1) * perPage, page * perPage);

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
    <>
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
          <>
          <Pagination
            itemCount={items.length}
            page={page}
            perPage={perPage}
            onSetPage={(_evt, newPage) => setPage(newPage)}
            onPerPageSelect={(_evt, newPerPage, newPage) => {
              setPerPage(newPerPage);
              setPage(newPage);
            }}
            perPageOptions={[
              { title: '20', value: 20 },
              { title: '50', value: 50 },
              { title: '100', value: 100 },
            ]}
          />
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
              {paginatedItems.map((wgr: WhiteGloveRequest) => {
                const ann = wgr.metadata.annotations || {};
                const state = ann[`${DEMO_DOMAIN}/state`] || 'pending-approval';
                const assignee = ann[`${DEMO_DOMAIN}/assignee`];
                const jiraTicketId = ann[`${DEMO_DOMAIN}/jira-ticket-id`];
                const jiraTicketUrl = ann[`${DEMO_DOMAIN}/jira-ticket-url`];
                const svcName = ann[`${DEMO_DOMAIN}/service-name`];
                const svcNamespace = ann[`${DEMO_DOMAIN}/service-namespace`];
                const svcType = ann[`${DEMO_DOMAIN}/service-type`] || 'services';
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
                    <Td>{assignee || '—'}</Td>
                    <Td>
                      {jiraTicketUrl ? (
                        <a href={jiraTicketUrl} target="_blank" rel="noopener noreferrer">
                          {jiraTicketId || 'View'}
                        </a>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td>
                      {svcName && svcNamespace ? (
                        <Link to={`/${svcType}/${svcNamespace}/${svcName}`}>
                          View Service
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
          </>
        )}
      </PageSection>

    </>
  );
};

const WhiteGloveList: React.FC = () => (
  <ErrorBoundaryPage namespace="" name="" type="White Glove Requests">
    <WhiteGloveListContent />
  </ErrorBoundaryPage>
);

export default WhiteGloveList;
