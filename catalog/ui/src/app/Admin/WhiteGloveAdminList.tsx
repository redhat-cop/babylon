import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import useSWR from 'swr';
import {
  Alert,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Card,
  CardBody,
  CardTitle,
  FormGroup,
  Form,
  PageSection,
  Pagination,
  TextInput,
  Title,
} from '@patternfly/react-core';
import { Table, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';
import CheckCircleIcon from '@patternfly/react-icons/dist/js/icons/check-circle-icon';
import ExclamationCircleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-circle-icon';
import ClockIcon from '@patternfly/react-icons/dist/js/icons/clock-icon';
import TrashIcon from '@patternfly/react-icons/dist/js/icons/trash-icon';
import { apiPaths, deleteWhiteGloveRequest, fetcher, silentFetcher, updateSystemStatus } from '@app/api';
import Modal, { useModal } from '@app/Modal/Modal';
import ButtonCircleIcon from '@app/components/ButtonCircleIcon';
import { WhiteGloveRequest, WhiteGloveRequestList } from '@app/types';
import { DEMO_DOMAIN } from '@app/util';
import TimeInterval from '@app/components/TimeInterval';
import ErrorBoundaryPage from '@app/components/ErrorBoundaryPage';
import useSystemStatus from '@app/utils/useSystemStatus';

import '@app/Services/service-status.css';
import '@app/WhiteGlove/white-glove.css';

function statusIcon(state: string) {
  switch (state) {
    case 'pending-approval':
      return <span className="service-status--waiting" style={{ textTransform: 'capitalize' }}><ClockIcon /> Pending Approval</span>;
    case 'approved':
      return <span className="service-status--running" style={{ textTransform: 'capitalize' }}><CheckCircleIcon /> Approved</span>;
    case 'rejected':
      return <span className="service-status--failed" style={{ textTransform: 'capitalize' }}><ExclamationCircleIcon /> Rejected</span>;
    default:
      return <span className="service-status--waiting" style={{ textTransform: 'capitalize' }}><ClockIcon /> {state || 'Pending Approval'}</span>;
  }
}

const JiraAssigneeCell: React.FC<{ jiraTicketId: string; fallback: string }> = ({ jiraTicketId, fallback }) => {
  const { data } = useSWR(
    jiraTicketId ? apiPaths.JIRA_ISSUE({ issueKey: jiraTicketId }) : null,
    silentFetcher,
    { refreshInterval: 30000 },
  );
  const assignee = data?.assignee?.displayName || fallback;
  return <>{assignee || <span style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>Unassigned</span>}</>;
};

const BlockedDatesManager: React.FC = () => {
  const { wgBlockedDates, mutate } = useSystemStatus();
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addBlockedRange() {
    if (!newStartDate || !newEndDate) return;
    if (newEndDate < newStartDate) {
      setError('End date must be on or after start date');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await updateSystemStatus({
        wg_blocked_dates: [...wgBlockedDates, { startDate: newStartDate, endDate: newEndDate, message: newMessage }],
      });
      await mutate();
      setNewStartDate('');
      setNewEndDate('');
      setNewMessage('');
    } catch {
      setError('Failed to add blocked dates');
    } finally {
      setIsSaving(false);
    }
  }

  async function removeBlockedRange(index: number) {
    setIsSaving(true);
    setError(null);
    try {
      await updateSystemStatus({
        wg_blocked_dates: wgBlockedDates.filter((_, i) => i !== index),
      });
      await mutate();
    } catch {
      setError('Failed to remove blocked dates');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card style={{ marginBottom: 'var(--pf-t--global--spacer--lg)' }}>
      <CardTitle>Blocked Dates</CardTitle>
      <CardBody>
        <p style={{ marginBottom: '12px', color: 'var(--pf-t--global--text--color--subtle)' }}>
          Block date ranges to prevent users from scheduling white glove requests on those days.
        </p>
        {error && <Alert variant="danger" isInline title={error} style={{ marginBottom: '12px' }} />}
        <Form>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <FormGroup label="Start Date" fieldId="blocked-start">
              <TextInput
                type="date"
                id="blocked-start"
                value={newStartDate}
                onChange={(_e, v) => setNewStartDate(v)}
              />
            </FormGroup>
            <FormGroup label="End Date" fieldId="blocked-end">
              <TextInput
                type="date"
                id="blocked-end"
                value={newEndDate}
                onChange={(_e, v) => setNewEndDate(v)}
              />
            </FormGroup>
            <FormGroup label="Message" fieldId="blocked-msg">
              <TextInput
                id="blocked-msg"
                value={newMessage}
                onChange={(_e, v) => setNewMessage(v)}
                placeholder="e.g. On vacation, no capacity"
                style={{ minWidth: '250px' }}
              />
            </FormGroup>
            <Button
              variant="primary"
              onClick={addBlockedRange}
              isDisabled={!newStartDate || !newEndDate || isSaving}
              isLoading={isSaving}
            >
              Add
            </Button>
          </div>
        </Form>
        {wgBlockedDates.length > 0 && (
          <Table aria-label="Blocked dates" variant="compact" style={{ marginTop: '16px' }}>
            <Thead>
              <Tr>
                <Th>Start</Th>
                <Th>End</Th>
                <Th>Message</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {wgBlockedDates.map((range, i) => (
                <Tr key={i}>
                  <Td dataLabel="Start">{range.startDate}</Td>
                  <Td dataLabel="End">{range.endDate}</Td>
                  <Td dataLabel="Message">{range.message || '—'}</Td>
                  <Td dataLabel="Actions">
                    <ButtonCircleIcon onClick={() => removeBlockedRange(i)} description="Remove" icon={TrashIcon} />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
};

const defaultPerPage = 20;

const WhiteGloveAdminListContent: React.FC = () => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(defaultPerPage);
  const [modalAction, openModalAction] = useModal();
  const [deleteTarget, setDeleteTarget] = useState<WhiteGloveRequest | null>(null);

  const showDeleteModal = useCallback(
    (wgr: WhiteGloveRequest) => {
      setDeleteTarget(wgr);
      openModalAction();
    },
    [openModalAction],
  );

  const { data, mutate } = useSWR<WhiteGloveRequestList>(
    apiPaths.WHITE_GLOVE_REQUESTS({}),
    fetcher,
    { refreshInterval: 8000 },
  );
  const requests = (data?.items || []).sort(
    (a, b) => new Date(b.metadata.creationTimestamp).getTime() - new Date(a.metadata.creationTimestamp).getTime(),
  );
  const paginatedRequests = requests.slice((page - 1) * perPage, page * perPage);

  async function onDeleteConfirm(): Promise<void> {
    if (deleteTarget) {
      await deleteWhiteGloveRequest(deleteTarget);
      mutate();
    }
  }

  return (
    <>
      <Modal
        ref={modalAction}
        onConfirm={onDeleteConfirm}
        confirmText="Delete"
        title={deleteTarget ? `Delete request "${deleteTarget.spec.displayName || deleteTarget.metadata.name}"?` : ''}
      >
        <p>This white glove request will be permanently deleted.</p>
      </Modal>
      <PageSection hasBodyWrapper={false}>
        <Breadcrumb>
          <BreadcrumbItem>Admin</BreadcrumbItem>
          <BreadcrumbItem isActive>White Glove Requests</BreadcrumbItem>
        </Breadcrumb>
        <Title headingLevel="h1" size="lg" style={{ marginBottom: 'var(--pf-t--global--spacer--lg)' }}>
          White Glove Requests
        </Title>

        <BlockedDatesManager />

        <Pagination
          itemCount={requests.length}
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
              <Th>Requester</Th>
              <Th>Status</Th>
              <Th>Submitted</Th>
              <Th>Assignee</Th>
              <Th>Jira</Th>
              <Th>Actions</Th>
            </Tr>
          </Thead>
          <Tbody>
            {paginatedRequests.map((wgr) => {
              const ann = wgr.metadata.annotations || {};
              return (
                <Tr key={wgr.metadata.uid || wgr.metadata.name}>
                  <Td dataLabel="Name">
                    <Link to={`/admin/white-glove-requests/${wgr.metadata.namespace}/${wgr.metadata.name}`}>
                      {wgr.spec.displayName || wgr.metadata.name}
                    </Link>
                  </Td>
                  <Td dataLabel="Requester" style={{ fontSize: '13px' }}>
                    {ann[`${DEMO_DOMAIN}/requester`] || '—'}
                  </Td>
                  <Td dataLabel="Status">
                    {statusIcon(ann[`${DEMO_DOMAIN}/state`] || 'pending-approval')}
                  </Td>
                  <Td dataLabel="Submitted" style={{ fontSize: '13px', color: 'var(--pf-t--global--text--color--subtle)' }}>
                    <TimeInterval toTimestamp={wgr.metadata.creationTimestamp} />
                  </Td>
                  <Td dataLabel="Assignee" style={{ fontSize: '13px' }}>
                    <JiraAssigneeCell jiraTicketId={ann[`${DEMO_DOMAIN}/jira-ticket-id`]} fallback={ann[`${DEMO_DOMAIN}/assignee`]} />
                  </Td>
                  <Td dataLabel="Jira">
                    {ann[`${DEMO_DOMAIN}/jira-ticket-id`] ? (
                      <a href={ann[`${DEMO_DOMAIN}/jira-ticket-url`] || '#'} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px' }}>
                        {ann[`${DEMO_DOMAIN}/jira-ticket-id`]}
                      </a>
                    ) : '—'}
                  </Td>
                  <Td dataLabel="Actions">
                    <ButtonCircleIcon
                      onClick={() => showDeleteModal(wgr)}
                      description="Delete"
                      icon={TrashIcon}
                    />
                  </Td>
                </Tr>
              );
            })}
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
