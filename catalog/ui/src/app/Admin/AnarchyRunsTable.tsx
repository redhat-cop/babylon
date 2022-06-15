import React from 'react';
import { Link } from 'react-router-dom';

import { EmptyState, EmptyStateIcon, Title } from '@patternfly/react-core';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';

import { K8sFetchState } from '@app/K8sFetchState';
import { AnarchyRun } from '@app/types';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';

const AnarchyRunsTable: React.FC<{
  anarchyRuns: AnarchyRun[];
  fetchState: K8sFetchState | null;
  selectedUids: string[];
  selectedUidsReducer: any;
}> = ({ anarchyRuns, fetchState, selectedUids, selectedUidsReducer }) => {
  if (anarchyRuns.length === 0) {
    if (fetchState?.finished) {
      return (
        <EmptyState variant="full">
          <EmptyStateIcon icon={ExclamationTriangleIcon} />
          <Title headingLevel="h1" size="lg">
            No AnarchyRuns found.
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
      columns={['Name', 'Runner State', 'Created At']}
      onSelectAll={(isSelected) => {
        if (isSelected) {
          selectedUidsReducer({
            type: 'set',
            uids: anarchyRuns.map((item) => item.metadata.uid),
          });
        } else {
          selectedUidsReducer({
            type: 'clear',
          });
        }
      }}
      rows={anarchyRuns.map((anarchyRun: AnarchyRun) => {
        return {
          cells: [
            <>
              <Link key="admin" to={`/admin/anarchyruns/${anarchyRun.metadata.namespace}/${anarchyRun.metadata.name}`}>
                {anarchyRun.metadata.name}
              </Link>
              <OpenshiftConsoleLink key="console" resource={anarchyRun} />
            </>,
            <>{anarchyRun.metadata.labels['anarchy.gpte.redhat.com/runner'] || <p>-</p>}</>,
            <>
              <LocalTimestamp key="timestamp" timestamp={anarchyRun.metadata.creationTimestamp} /> (
              <TimeInterval key="interval" toTimestamp={anarchyRun.metadata.creationTimestamp} />)
            </>,
          ],
          onSelect: (isSelected) =>
            selectedUidsReducer({
              type: isSelected ? 'add' : 'remove',
              uids: [anarchyRun.metadata.uid],
            }),
          selected: selectedUids.includes(anarchyRun.metadata.uid),
        };
      })}
    />
  );
};

export default AnarchyRunsTable;
