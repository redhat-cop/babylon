import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import yaml from 'js-yaml';
import {
  ActionGroup,
  Button,
  CodeBlock,
  CodeBlockCode,
  DescriptionList,
  DescriptionListTerm,
  DescriptionListGroup,
  DescriptionListDescription,
  EmptyState,
  EmptyStateIcon,
  Text,
  EmptyStateHeader,
} from '@patternfly/react-core';
import { Table /* data-codemods */, Thead, Tr, Th, Tbody, Td } from '@patternfly/react-table';
import { apiPaths, assignWorkshopUser, bulkAssignWorkshopUsers } from '@app/api';
import { WorkshopUserAssignment } from '@app/types';
import { renderContent } from '@app/util';
import BulkUserAssignmentModal from '@app/components/BulkUserAssignmentModal';
import EditableText from '@app/components/EditableText';
import LabInterfaceLink from '@app/components/LabInterfaceLink';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';

const WorkshopsItemUserAssignments: React.FC<{
  onUserAssignmentsUpdate: (userAssignments: WorkshopUserAssignment[]) => void;
  userAssignments: WorkshopUserAssignment[];
}> = ({ userAssignments, onUserAssignmentsUpdate }) => {
  const [bulkUserAssignmentMessage, setBulkUserAssignmentMessage] = useState('');
  const [bulkUserAssignmentModalIsOpen, setBulkUserAssignmentModalIsOpen] = useState(false);
  const haveUserNames = (userAssignments || []).find((ua) => ua.spec.userName) ? true : false;
  const resourceClaimNames = [...new Set((userAssignments || []).map((ua) => ua.spec.resourceClaimName))];

  function openBulkUserAssignmentModal() {
    setBulkUserAssignmentMessage('');
    setBulkUserAssignmentModalIsOpen(true);
  }

  async function bulkAssignUsers(emails: string[]) {
    const { unassignedEmails, workshopUserAssignments } = await bulkAssignWorkshopUsers({
      emails: emails,
      workshopUserAssignments: userAssignments,
    });
    setBulkUserAssignmentMessage(
      unassignedEmails.length === 0
        ? `Assigned ${userAssignments.length} users.`
        : `Assigned ${userAssignments.length} users. Unable to assign ${unassignedEmails.join(', ')}`,
    );
    setBulkUserAssignmentModalIsOpen(false);
    onUserAssignmentsUpdate(workshopUserAssignments);
  }

  async function updateUserAssignment({
    email,
    resourceClaimName,
    userName,
  }: {
    email: string;
    resourceClaimName: string;
    userName: string;
  }) {
    setBulkUserAssignmentMessage('');
    const workshopUserAssigments = await assignWorkshopUser({
      email: email,
      resourceClaimName: resourceClaimName,
      userName: userName,
      workshopUserAssignments: userAssignments,
    });
    onUserAssignmentsUpdate(workshopUserAssigments);
  }

  if (!userAssignments || userAssignments.length === 0) {
    return (
      <EmptyState variant="full">
        <EmptyStateHeader
          titleText="No user assignments available"
          icon={<EmptyStateIcon icon={ExclamationTriangleIcon} />}
          headingLevel="h1"
        />
      </EmptyState>
    );
  }
  const sortBy = (a: WorkshopUserAssignment, b: WorkshopUserAssignment) => {
    if (a.spec.resourceClaimName < b.spec.resourceClaimName) {
      return -1;
    }
    if (a.spec.resourceClaimName > b.spec.resourceClaimName) {
      return 1;
    }
    if (a.spec.userName && b.spec.userName) {
      return a.spec.userName.localeCompare(b.spec.userName, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    }
    return 0;
  };

  return (
    <>
      <BulkUserAssignmentModal
        key="bulk-user-assignment-modal"
        isOpen={bulkUserAssignmentModalIsOpen}
        onClose={() => setBulkUserAssignmentModalIsOpen(false)}
        onConfirm={(emails) => bulkAssignUsers(emails)}
      />
      <Table key="users-table">
        <Thead>
          <Tr>
            {resourceClaimNames.length > 1 ? <Th>Service</Th> : null}
            {haveUserNames ? <Th>User</Th> : null}
            <Th>Assigned Email</Th>
            <Th>Details</Th>
          </Tr>
        </Thead>
        <Tbody>
          {userAssignments.sort(sortBy).map((userAssignment, userAssignmentIdx) => {
            return (
              <Tr key={userAssignmentIdx}>
                {resourceClaimNames.length > 1 ? (
                  <Td>
                    <Link
                      key="services"
                      to={`/services/${userAssignment.metadata.namespace}/${userAssignment.spec.resourceClaimName}`}
                    >
                      {userAssignment.spec.resourceClaimName}
                    </Link>
                  </Td>
                ) : null}
                {haveUserNames ? <Td>{userAssignment.spec.userName}</Td> : null}
                <Td>
                  <EditableText
                    aria-label={`Edit assignment for ${userAssignment.spec.userName}`}
                    onChange={(email) =>
                      updateUserAssignment({
                        email: email,
                        resourceClaimName: userAssignment.spec.resourceClaimName,
                        userName: userAssignment.spec.userName,
                      })
                    }
                    placeholder="- unassigned -"
                    value={userAssignment.spec.assignment?.email || ''}
                  />
                </Td>
                <Td>
                  <DescriptionList isHorizontal>
                    {userAssignment.spec.labUserInterface ? (
                      <DescriptionListGroup>
                        <DescriptionListTerm>Lab UI</DescriptionListTerm>
                        <DescriptionListDescription>
                          <LabInterfaceLink
                            method={userAssignment.spec.labUserInterface.method || 'GET'}
                            url={userAssignment.spec.labUserInterface.url}
                          />
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    ) : null}
                    {userAssignment.spec.messages ? (
                      <DescriptionListGroup>
                        <DescriptionListTerm>Messages</DescriptionListTerm>
                        <DescriptionListDescription>
                          <div
                            dangerouslySetInnerHTML={{
                              __html: renderContent(userAssignment.spec.messages.replace(/\n/g, '  +\n'), {
                                format: 'asciidoc',
                              }),
                            }}
                          />
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    ) : null}
                    {userAssignment.spec.data ? (
                      <DescriptionListGroup>
                        <DescriptionListTerm>Data</DescriptionListTerm>
                        <DescriptionListDescription>
                          <CodeBlock>
                            <CodeBlockCode>{yaml.dump(userAssignment.spec.data)}</CodeBlockCode>
                          </CodeBlock>
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    ) : null}
                  </DescriptionList>
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
      <ActionGroup key="users-actions" style={{ marginTop: 'var(--pf-v5-global--spacer--md)' }}>
        <Button onClick={openBulkUserAssignmentModal}>Bulk User Assignment</Button>
      </ActionGroup>
      {bulkUserAssignmentMessage ? <Text key="users-message">{bulkUserAssignmentMessage}</Text> : null}
    </>
  );
};

export default WorkshopsItemUserAssignments;
