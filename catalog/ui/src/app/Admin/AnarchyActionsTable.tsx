import React from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, EmptyStateIcon, EmptyStateHeader } from '@patternfly/react-core';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import { AnarchyAction } from '@app/types';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';

const AnarchyActionsTable: React.FC<{
  anarchyActions: AnarchyAction[];
  selectedUids: string[];
  selectedUidsReducer: any;
}> = ({ anarchyActions, selectedUids, selectedUidsReducer }) => {
  if (anarchyActions.length === 0) {
    return (
      <EmptyState variant="full">
        <EmptyStateHeader
          titleText="No AnarchyActions found."
          icon={<EmptyStateIcon icon={ExclamationTriangleIcon} />}
          headingLevel="h1"
        />
      </EmptyState>
    );
  }
  return (
    <SelectableTable
      columns={['Name', 'Created At']}
      onSelectAll={(isSelected: boolean) => {
        if (isSelected) {
          selectedUidsReducer({
            type: 'set',
            uids: anarchyActions.map((item) => item.metadata.uid),
          });
        } else {
          selectedUidsReducer({
            type: 'clear',
          });
        }
      }}
      rows={anarchyActions.map((anarchyAction: AnarchyAction) => {
        return {
          cells: [
            <>
              <Link
                key="admin"
                to={`/admin/anarchyactions/${anarchyAction.metadata.namespace}/${anarchyAction.metadata.name}`}
              >
                {anarchyAction.metadata.name}
              </Link>
              <OpenshiftConsoleLink key="console" resource={anarchyAction} />
            </>,
            <>
              <LocalTimestamp key="timestamp" timestamp={anarchyAction.metadata.creationTimestamp} />
              <span key="interval" style={{ padding: '0 6px' }}>
                (<TimeInterval key="time-interval" toTimestamp={anarchyAction.metadata.creationTimestamp} />)
              </span>
            </>,
          ],
          onSelect: (isSelected: boolean) =>
            selectedUidsReducer({
              type: isSelected ? 'add' : 'remove',
              uids: [anarchyAction.metadata.uid],
            }),
          selected: selectedUids.includes(anarchyAction.metadata.uid),
        };
      })}
    />
  );
};

export default AnarchyActionsTable;
