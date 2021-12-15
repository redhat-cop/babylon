import React from "react";
import { useEffect, useReducer, useState } from "react";
import { Link, useHistory, useLocation, useRouteMatch } from 'react-router-dom';
import {
  EmptyState,
  EmptyStateBody,
  EmptyStateIcon,
  PageSection,
  PageSectionVariants,
  Split,
  SplitItem,
  Title,
} from '@patternfly/react-core';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';
import { deleteAnarchyAction, listAnarchyActions } from '@app/api';
import { cancelFetchState, fetchStateReducer, k8sObjectsReducer, selectedUidsReducer } from '@app/reducers';
import { AnarchyAction, AnarchyActionList, FetchState } from '@app/types';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import KeywordSearchInput from '@app/components/KeywordSearchInput';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import RefreshButton from '@app/components/RefreshButton';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';
import AnarchyActionSelect from './AnarchyActionSelect';
import AnarchyNamespaceSelect from './AnarchyNamespaceSelect';

import './admin.css';

const FETCH_BATCH_LIMIT = 50;

function keywordMatch(anarchyAction:AnarchyAction, keyword:string): boolean {
  if (anarchyAction.metadata.name.includes(keyword)) {
    return true;
  }
  if (anarchyAction.spec.governorRef.name.includes(keyword)) {
    return true;
  }
  if (anarchyAction.spec.subjectRef.name.includes(keyword)) {
    return true;
  }
  return false;
}


function filterAnarchyAction(anarchyAction:AnarchyAction, keywordFilter:string[]): boolean {
  if (!keywordFilter) {
    return true;
  }
  for (const keyword of keywordFilter) {
    if (!keywordMatch(anarchyAction, keyword)) {
      return false;
    }
  }
  return true;
}

function pruneAnarchyAction(anarchyAction:AnarchyAction) {
  return {
    apiVersion: anarchyAction.apiVersion,
    kind: anarchyAction.kind,
    metadata: {
      creationTimestamp: anarchyAction.metadata.creationTimestamp,
      name: anarchyAction.metadata.name,
      namespace: anarchyAction.metadata.namespace,
      uid: anarchyAction.metadata.uid,
    },
    spec: {
      action: anarchyAction.spec.action,
      governorRef: anarchyAction.spec.governorRef,
      subjectRef: anarchyAction.spec.subjectRef,
    },
    status: {
      finishedTimestamp: anarchyAction.status?.finishedTimestamp,
      state: anarchyAction.status?.state,
    }
  };
}

const AnarchyActions: React.FunctionComponent = () => {
  const history = useHistory();
  const location = useLocation();
  const routeMatch = useRouteMatch<any>('/admin/anarchyactions/:namespace?');
  const anarchyNamespace = routeMatch.params.namespace;
  const urlSearchParams = new URLSearchParams(location.search);
  const keywordFilter = urlSearchParams.has('search') ? urlSearchParams.get('search').trim().split(/ +/).filter(w => w != '') : null;
  const actionFilter = urlSearchParams.has('action') ? urlSearchParams.get('action') : null;

  const [anarchyActions, reduceAnarchyActions] = useReducer(k8sObjectsReducer, []);
  const [selectedUids, reduceSelectedUids] = useReducer(selectedUidsReducer, []);
  const [fetchLimit, setFetchLimit] = useState(FETCH_BATCH_LIMIT * 2);
  const [fetchState, reduceFetchState] = useReducer(fetchStateReducer, {});
  const [firstRender, setFirstRender] = useState(true);

  const primaryAppContainer = document.getElementById('primary-app-container');
  primaryAppContainer.onscroll = (e) => {
    const scrollable = e.target as any;
    const scrollRemaining = scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight;
    if (scrollRemaining < 500 && fetchState?.continue && fetchLimit <= anarchyActions.length) {
      setFetchLimit((limit) => limit + FETCH_BATCH_LIMIT);
    }
  }

  async function confirmThenDelete(): Promise<void> {
    if (confirm("Deleted selected AnarchyActions?")) {
      const removedAnarchyActions:AnarchyAction[] = [];
      for (const anarchyAction of anarchyActions) {
        if (selectedUids.includes(anarchyAction.metadata.uid)) {
          await deleteAnarchyAction(anarchyAction);
          removedAnarchyActions.push(anarchyAction);
        }
      }
      reduceSelectedUids({type: 'clear'});
      reduceAnarchyActions({type: 'remove', items: removedAnarchyActions});
    }
  }

  async function fetchAnarchyActions(): Promise<void> {
    const anarchyActionList:AnarchyActionList = await listAnarchyActions({
      continue: fetchState.continue,
      labelSelector: actionFilter ? `anarchy.gpte.redhat.com/action=${actionFilter}` : null,
      limit: FETCH_BATCH_LIMIT,
      namespace: anarchyNamespace,
    });
    if (!fetchState.canceled) {
      const anarchyActions:AnarchyAction[] = anarchyActionList.items
        .filter((anarchyAction) => filterAnarchyAction(anarchyAction, keywordFilter))
        .map(pruneAnarchyAction);
      reduceAnarchyActions({
        type: fetchState.isRefresh ? 'refresh' : 'append',
        items: anarchyActions,
        refreshComplete: fetchState.isRefresh && anarchyActionList.metadata.continue ? false : true,
        refreshedUids: fetchState.isRefresh ? fetchState.fetchedUids : null,
      });
      reduceFetchState({
        type: 'finish',
        continue: anarchyActionList.metadata.continue,
        items: anarchyActions,
      });
    }
  }

  function reloadAnarchyActions(): void {
    reduceAnarchyActions({type: 'clear'});
    reduceFetchState({type: 'start'});
    reduceSelectedUids({type: 'clear'});
  }

  // Fetch or continue fetching
  useEffect(() => {
    if (!fetchState.finished && anarchyActions.length < fetchLimit) {
      fetchAnarchyActions();
      return () => cancelFetchState(fetchState);
    } else {
      return null;
    }
  }, [fetchState, fetchLimit]);

  // Reload on filter change
  useEffect(() => {
    if(!firstRender) {
      reloadAnarchyActions();
    }
  }, [anarchyNamespace, actionFilter, JSON.stringify(keywordFilter)]);

  // Track first render
  useEffect(() => {
    if(firstRender) {
      setFirstRender(false);
    }
  }, [firstRender]);

  return (<>
    <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
      <Split hasGutter>
        <SplitItem isFilled>
          <Title headingLevel="h4" size="xl">AnarchyActions</Title>
        </SplitItem>
        <SplitItem>
          <RefreshButton onClick={() => reloadAnarchyActions()}/>
        </SplitItem>
        <SplitItem>
          <KeywordSearchInput
            initialValue={keywordFilter}
            onSearch={(value) => {
              if (value) {
                urlSearchParams.set('search', value.join(' '));
              } else if(urlSearchParams.has('search')) {
                urlSearchParams.delete('search');
              }
              history.push(`${location.pathname}?${urlSearchParams.toString()}`);
            }}
          />
        </SplitItem>
        <SplitItem>
          <AnarchyActionSelect
            action={actionFilter}
            onSelect={(action) => {
              if (action) {
                urlSearchParams.set('action', action);
              } else if(urlSearchParams.has('action')) {
                urlSearchParams.delete('action');
              }
              history.push(`${location.pathname}?${urlSearchParams.toString()}`);
            }}
          />
        </SplitItem>
        <SplitItem>
          <AnarchyNamespaceSelect
            namespace={anarchyNamespace}
            onSelect={(namespaceName) => {
              if (namespaceName) {
                history.push(`/admin/anarchyactions/${namespaceName}${location.search}`);
              } else {
                history.push(`/admin/anarchyactions${location.search}`);
              }
            }}
          />
        </SplitItem>
        <SplitItem>
          <ActionDropdown
            position="right"
            actionDropdownItems={[
              <ActionDropdownItem
                key="delete"
                label="Delete Selected"
                onSelect={() => confirmThenDelete()}
              />,
            ]}
          />
        </SplitItem>
      </Split>
    </PageSection>
    { anarchyActions.length === 0 ? (
      fetchState.finished ? (
        <PageSection>
          <EmptyState variant="full">
            <EmptyStateIcon icon={ExclamationTriangleIcon} />
            <Title headingLevel="h1" size="lg">
              No AnarchyActions found
            </Title>
          </EmptyState>
        </PageSection>
      ) : (
        <PageSection>
          <EmptyState variant="full">
            <EmptyStateIcon icon={LoadingIcon} />
          </EmptyState>
        </PageSection>
      )
    ) : (
      <PageSection key="body" variant={PageSectionVariants.light} className="admin-body">
        <SelectableTable
          columns={['Namespace', 'Name', 'AnarchySubject', 'AnarchyGovernor', 'Created At', 'State', 'Finished At']}
          onSelectAll={(isSelected) => {
            if (isSelected) {
              reduceSelectedUids({type: 'set', items: anarchyActions});
            } else {
              reduceSelectedUids({type: 'clear'});
            }
          }}
          rows={anarchyActions.map((anarchyAction:AnarchyAction) => {
            return {
              cells: [
                <>
                  {anarchyAction.metadata.namespace}
                  <OpenshiftConsoleLink key="console" resource={anarchyAction} linkToNamespace={true}/>
                </>,
                <>
                  <Link key="admin" to={`/admin/anarchyactions/${anarchyAction.metadata.namespace}/${anarchyAction.metadata.name}`}>{anarchyAction.metadata.name}</Link>
                  <OpenshiftConsoleLink key="console" resource={anarchyAction}/>
                </>,
                <>
                  <Link key="admin" to={`/admin/anarchysubjects/${anarchyAction.spec.subjectRef.namespace}/${anarchyAction.spec.subjectRef.name}`}>{anarchyAction.spec.subjectRef.name}</Link>
                  <OpenshiftConsoleLink key="console" reference={anarchyAction.spec.subjectRef}/>
                </>,
                <>
                  <Link key="admin" to={`/admin/anarchygovernors/${anarchyAction.spec.governorRef.namespace}/${anarchyAction.spec.governorRef.name}`}>{anarchyAction.spec.governorRef.name}</Link>
                  <OpenshiftConsoleLink key="console" reference={anarchyAction.spec.governorRef}/>
                </>,
                <>
                  <LocalTimestamp key="timestamp" timestamp={anarchyAction.metadata.creationTimestamp}/>
                  {' '}
                  (<TimeInterval key="interval" toTimestamp={anarchyAction.metadata.creationTimestamp}/>)
                </>,
                <>
                  {anarchyAction.status?.state || '-'}
                </>,
                anarchyAction.status?.finishedTimestamp ? (
                  <>
                    <LocalTimestamp key="timestamp" timestamp={anarchyAction.status.finishedTimestamp}/>
                    {' '}
                    (<TimeInterval key="interval" toTimestamp={anarchyAction.status.finishedTimestamp}/>)
                  </>
                ) : '-',
              ],
              onSelect: (isSelected) => reduceSelectedUids({
                type: isSelected ? 'add' : 'remove',
                items: [anarchyAction],
              }),
              selected: selectedUids.includes(anarchyAction.metadata.uid),
            };
          })}
        />
        { fetchState?.continue ? (
          <EmptyState variant="full">
            <EmptyStateIcon icon={LoadingIcon} />
          </EmptyState>
        ) : null }
      </PageSection>
    )}
  </>);
}

export default AnarchyActions;
