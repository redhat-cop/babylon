import React from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, EmptyStateIcon, Title } from '@patternfly/react-core';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import { AnarchySubject } from '@app/types';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import TimeInterval from '@app/components/TimeInterval';
import { Table, TableBody, TableHeader } from '@patternfly/react-table';

const AnarchySubjectsTable: React.FC<{
  anarchySubjects: AnarchySubject[];
}> = ({ anarchySubjects }) => {
  if (anarchySubjects.length === 0) {
    return (
      <EmptyState variant="full">
        <EmptyStateIcon icon={ExclamationTriangleIcon} />
        <Title headingLevel="h1" size="lg">
          No AnarchySubjects found.
        </Title>
      </EmptyState>
    );
  }
  return (
    <Table
      aria-label="Table"
      variant="compact"
      cells={['Name', 'Created At']}
      rows={anarchySubjects.map((anarchySubject: AnarchySubject) => {
        return {
          cells: [
            <>
              <Link
                key="admin"
                to={`/admin/anarchysubjects/${anarchySubject.metadata.namespace}/${anarchySubject.metadata.name}`}
              >
                {anarchySubject.metadata.name}
              </Link>
              <OpenshiftConsoleLink key="console" resource={anarchySubject} />
            </>,
            <>
              <LocalTimestamp key="timestamp" timestamp={anarchySubject.metadata.creationTimestamp} />
              <span key="interval" style={{ padding: '0 6px' }}>
                (<TimeInterval key="time-interval" toTimestamp={anarchySubject.metadata.creationTimestamp} />)
              </span>
            </>,
          ],
        };
      })}
    >
      <TableHeader />
      <TableBody />
    </Table>
  );
};

export default AnarchySubjectsTable;
