import React from "react";
import { useEffect, useReducer, useState } from "react";
import { Link } from 'react-router-dom';

import {
  EmptyState,
  EmptyStateBody,
  EmptyStateIcon,
} from '@patternfly/react-core';

import { listAnarchyActions } from '@app/api';
import { AnarchyAction, AnarchyActionList } from '@app/types';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';

export interface AnarchyActionsAction {
  items: AnarchyAction[];
  type: string;
}

export interface FetchStateAction {
  type: string;
}

export interface FetchState {
  canceled?: boolean;
  finished?: boolean;
  refreshTimeout?: any;
}

export interface LinkedAnarchyActionsProps {
  namespace?: string;
  labelSelector?: string;
}

export interface SelectedUidsAction {
  type: string;
  uids?: string[];
}

function anarchyActionsReducer(state:AnarchyAction[], action:AnarchyActionsAction): AnarchyAction[] {
  switch (action.type) {
    case 'set':
      return action.items;
    default:
      throw new Error(`Invalid AnarchyActionsAction type: ${action.type}`);
  }
}

function cancelFetchState(fetchState:FetchState): void {
  fetchState.canceled = true;
  if (fetchState.refreshTimeout) {
    clearTimeout(fetchState.refreshTimeout);
  }
}

function fetchStateReducer(state:FetchState, action:FetchStateAction): FetchState {
  // Any change in state cancels previous activity.
  cancelFetchState(state);
  switch (action.type) {
    case 'cancel':
      return null;
    case 'start':
      return {};
    default:
      throw new Error(`Invalid FetchStateAction type: ${action.type}`);
  }
}

function selectedUidsReducer(state:string[], action:SelectedUidsAction): string[] {
  switch (action.type) {
    case 'add':
      return [...state, ...action.uids.filter((uid) => !state.includes(uid))];
    case 'clear':
      return [];
    case 'remove':
      return [...state.filter((uid) => !action.uids.includes(uid))];
    case 'set':
      return action.uids;
    default:
      throw new Error(`Invalid SelectedUidsAction type: ${action.type}`);

  }
}

const LinkedAnarchyActions: React.FunctionComponent<LinkedAnarchyActionsProps> = ({
  namespace,
  labelSelector,
}) => {
  const [fetchState, reduceFetchState] = useReducer(fetchStateReducer, {});
  const [anarchyActions, reduceAnarchyActions] = useReducer(anarchyActionsReducer, []);
  const [selectedUids, reduceSelectedUids] = useReducer(selectedUidsReducer, []);

  async function fetchAnarchyActions(): Promise<void> {
    const anarchyActionList:AnarchyActionList = await listAnarchyActions({
      labelSelector: labelSelector,
      namespace: namespace,
    });
    if (!fetchState.canceled) {
      reduceAnarchyActions({type: 'set', items: anarchyActionList.items});
    }
  }

  useEffect(() => {
    if (fetchState) {
      fetchAnarchyActions();
      return () => cancelFetchState(fetchState);
    } else {
      reduceFetchState({type: 'start'});
      return null;
    }
  }, [fetchState])

  return (
    <SelectableTable
      columns={['Name', 'Created At']}
      onSelectAll={(isSelected) => {
        if (isSelected) {
          reduceSelectedUids({
            type: 'set',
            uids: anarchyActions.map((item) => item.metadata.uid),
          });
        } else {
          reduceSelectedUids({
            type: 'clear',
          });
        }
      }}
      rows={anarchyActions.map((anarchyAction:AnarchyAction) => {
        return {
          cells: [
            <>
              <Link key="admin" to={`/admin/anarchyactions/${anarchyAction.metadata.namespace}/${anarchyAction.metadata.name}`}>{anarchyAction.metadata.name}</Link>
              <OpenshiftConsoleLink key="console" resource={anarchyAction}/>
            </>,
            <>
              <LocalTimestamp key="timestamp" timestamp={anarchyAction.metadata.creationTimestamp}/>
              {' '}
              (<TimeInterval key="interval" toTimestamp={anarchyAction.metadata.creationTimestamp}/>)
            </>,
          ],
          onSelect: (isSelected) => reduceSelectedUids({
            type: isSelected ? 'add' : 'remove',
            uids: [anarchyAction.metadata.uid],
          }),
          selected: selectedUids.includes(anarchyAction.metadata.uid),
        };
      })}
    />
  );
}

export default LinkedAnarchyActions;
