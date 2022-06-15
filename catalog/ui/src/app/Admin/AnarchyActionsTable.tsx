import React from 'react';
import { Link } from 'react-router-dom';

import { EmptyState, EmptyStateIcon, Title } from '@patternfly/react-core';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';

import { K8sFetchState } from '@app/K8sFetchState';
import { AnarchyAction } from '@app/types';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';

const AnarchyActionsTable: React.FC<{
  anarchyActions: AnarchyAction[];
  fetchState: K8sFetchState | null;
  selectedUids: string[];
  selectedUidsReducer: any;
}> = ({ anarchyActions, fetchState, selectedUids, selectedUidsReducer }) => {
  if (anarchyActions.length === 0) {
    if (fetchState?.finished) {
      return (
        <EmptyState variant="full">
          <EmptyStateIcon icon={ExclamationTriangleIcon} />
          <Title headingLevel="h1" size="lg">
            No AnarchyActions found.
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
          onSelect: (isSelected) =>
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
