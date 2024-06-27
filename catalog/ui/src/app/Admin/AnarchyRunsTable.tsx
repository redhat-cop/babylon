import React from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, EmptyStateIcon, EmptyStateHeader } from '@patternfly/react-core';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import { AnarchyRun } from '@app/types';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';

const AnarchyRunsTable: React.FC<{
  anarchyRuns: AnarchyRun[];
  selectedUids: string[];
  selectedUidsReducer: any;
}> = ({ anarchyRuns, selectedUids, selectedUidsReducer }) => {
  if (anarchyRuns.length === 0) {
    return (
      <EmptyState variant="full">
        <EmptyStateHeader
          titleText="No AnarchyRuns found."
          icon={<EmptyStateIcon icon={ExclamationTriangleIcon} />}
          headingLevel="h1"
        />
      </EmptyState>
    );
  }
  return (
    <SelectableTable
      columns={['Name', 'Runner State', 'Created At']}
      onSelectAll={(isSelected: boolean) => {
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
          onSelect: (isSelected: boolean) =>
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
