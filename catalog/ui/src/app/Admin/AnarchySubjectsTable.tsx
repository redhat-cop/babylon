import React from 'react';
import { Link } from 'react-router-dom';

import { EmptyState, EmptyStateIcon, Title } from '@patternfly/react-core';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';

import { K8sFetchState } from '@app/K8sFetchState';
import { AnarchySubject } from '@app/types';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';

const AnarchySubjectsTable: React.FC<{
  anarchySubjects: AnarchySubject[];
  fetchState: K8sFetchState | null;
  selectedUids: string[];
  selectedUidsReducer: any;
}> = ({ anarchySubjects, fetchState, selectedUids, selectedUidsReducer }) => {
  if (anarchySubjects.length === 0) {
    if (fetchState?.finished) {
      return (
        <EmptyState variant="full">
          <EmptyStateIcon icon={ExclamationTriangleIcon} />
          <Title headingLevel="h1" size="lg">
            No AnarchySubjects found.
          </Title>
        </EmptyState>
      );
    } else {
      return (
        <EmptyState variant="full">
          <EmptyStateIcon icon={LoadingIcon} />
        </EmptyState>
      );
    }
  }
  return (
    <SelectableTable
      columns={['Name', 'Created At']}
      onSelectAll={(isSelected) => {
        if (isSelected) {
          selectedUidsReducer({
            type: 'set',
            uids: anarchySubjects.map((item) => item.metadata.uid),
          });
        } else {
          selectedUidsReducer({
            type: 'clear',
          });
        }
      }}
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
          onSelect: (isSelected) =>
            selectedUidsReducer({
              type: isSelected ? 'add' : 'remove',
              uids: [anarchySubject.metadata.uid],
            }),
          selected: selectedUids.includes(anarchySubject.metadata.uid),
        };
      })}
    />
  );
};

export default AnarchySubjectsTable;
