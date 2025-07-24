import React from 'react';
import { Link } from 'react-router-dom';
import { EmptyState,  } from '@patternfly/react-core';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import { AnarchySubject } from '@app/types';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import TimeInterval from '@app/components/TimeInterval';
import { Table, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';

const AnarchySubjectsTable: React.FC<{
  anarchySubjects: AnarchySubject[];
}> = ({ anarchySubjects }) => {
  if (anarchySubjects.length === 0) {
    return (
      <EmptyState  headingLevel="h1" icon={ExclamationTriangleIcon}  titleText="No AnarchySubjects found." variant="full">
        </EmptyState>
    );
  }
  return (
    <Table aria-label="AnarchySubjects table" variant="compact">
      <Thead>
        <Tr>
          <Th>Name</Th>
          <Th>Created At</Th>
        </Tr>
      </Thead>
      <Tbody>
        {anarchySubjects.map((anarchySubject: AnarchySubject) => (
          <Tr key={anarchySubject.metadata.name}>
            <Td dataLabel="Name">
              <Link to={`/admin/anarchysubjects/${anarchySubject.metadata.namespace}/${anarchySubject.metadata.name}`}>
                {anarchySubject.metadata.name}
              </Link>
              <OpenshiftConsoleLink resource={anarchySubject} />
            </Td>
            <Td dataLabel="Created At">
              <LocalTimestamp timestamp={anarchySubject.metadata.creationTimestamp} />
              <span style={{ padding: '0 6px' }}>
                (<TimeInterval toTimestamp={anarchySubject.metadata.creationTimestamp} />)
              </span>
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
};

export default AnarchySubjectsTable;
