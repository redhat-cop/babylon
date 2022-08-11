import React, { useEffect, useReducer, useRef } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  EmptyState,
  EmptyStateIcon,
  PageSection,
  PageSectionVariants,
  Split,
  SplitItem,
  Title,
} from '@patternfly/react-core';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';
import { deleteAnarchyAction, listAnarchyActions } from '@app/api';
import { cancelFetchActivity, k8sFetchStateReducer } from '@app/K8sFetchState';
import { selectedUidsReducer } from '@app/reducers';
import { AnarchyAction, AnarchyActionList, K8sObject } from '@app/types';
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

const FETCH_BATCH_LIMIT = 20;

function keywordMatch(anarchyAction: AnarchyAction, keyword: string): boolean {
  if (anarchyAction.metadata.name.includes(keyword)) {
    return true;
  }
  if (anarchyAction.spec.governorRef?.name.includes(keyword)) {
    return true;
  }
  if (anarchyAction.spec.subjectRef?.name.includes(keyword)) {
    return true;
  }
  return false;
}

function filterAnarchyAction(anarchyAction: AnarchyAction, keywordFilter: string[]): boolean {
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

function pruneAnarchyAction(anarchyAction: AnarchyAction): AnarchyAction {
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
    },
  };
}

const AnarchyActions: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const componentWillUnmount = useRef(false);
  const { namespace: anarchyNamespace } = useParams();
  const urlSearchParams = new URLSearchParams(location.search);
  const keywordFilter = urlSearchParams.has('search')
    ? urlSearchParams
        .get('search')
        .trim()
        .split(/ +/)
        .filter((w) => w != '')
    : null;
  const actionFilter = urlSearchParams.has('action') ? urlSearchParams.get('action') : null;

  const [fetchState, reduceFetchState] = useReducer(k8sFetchStateReducer, null);
  const [selectedUids, reduceSelectedUids] = useReducer(selectedUidsReducer, []);

  const anarchyActions: AnarchyAction[] = (fetchState?.filteredItems as AnarchyAction[]) || [];

  const filterFunction = keywordFilter
    ? (anarchyAction: K8sObject): boolean => filterAnarchyAction(anarchyAction as AnarchyAction, keywordFilter)
    : null;

  const primaryAppContainer = document.getElementById('primary-app-container');
  primaryAppContainer.onscroll = (e) => {
    const scrollable = e.target as any;
    const scrollRemaining = scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight;
    if (scrollRemaining < 500 && !fetchState?.finished && fetchState.limit <= anarchyActions.length) {
      reduceFetchState({
        type: 'modify',
        limit: fetchState.limit + FETCH_BATCH_LIMIT,
      });
    }
  };

  async function confirmThenDelete(): Promise<void> {
    if (confirm('Deleted selected AnarchyActions?')) {
      const removedAnarchyActions: AnarchyAction[] = [];
      for (const anarchyAction of anarchyActions) {
        if (selectedUids.includes(anarchyAction.metadata.uid)) {
          await deleteAnarchyAction(anarchyAction);
          removedAnarchyActions.push(anarchyAction);
        }
      }
      reduceSelectedUids({ type: 'clear' });
      reduceFetchState({ type: 'removeItems', items: removedAnarchyActions });
    }
  }

  async function fetchAnarchyActions(): Promise<void> {
    const anarchyActionList: AnarchyActionList = await listAnarchyActions({
      continue: fetchState.continue,
      labelSelector: actionFilter ? `anarchy.gpte.redhat.com/action=${actionFilter}` : null,
      limit: FETCH_BATCH_LIMIT,
      namespace: anarchyNamespace,
    });
    if (!fetchState.activity.canceled) {
      reduceFetchState({
        type: 'post',
        k8sObjectList: anarchyActionList,
        refreshInterval: 15000,
        refresh: (): void => {
          reduceFetchState({ type: 'startRefresh' });
        },
      });
    }
  }

  function reloadAnarchyActions(): void {
    reduceFetchState({
      type: 'startFetch',
      filter: filterFunction,
      limit: FETCH_BATCH_LIMIT,
      prune: pruneAnarchyAction,
    });
    reduceSelectedUids({ type: 'clear' });
  }

  // First render and detect unmount
  useEffect(() => {
    return () => {
      componentWillUnmount.current = true;
    };
  }, []);

  // Fetch or continue fetching
  useEffect(() => {
    if (fetchState?.canContinue && (fetchState.refreshing || fetchState.filteredItems.length < fetchState.limit)) {
      fetchAnarchyActions();
    }
    return () => {
      if (componentWillUnmount.current) {
        cancelFetchActivity(fetchState);
      }
    };
  }, [fetchState]);

  // Start fetch and reload on k8s namespace or label filter
  useEffect(() => {
    reloadAnarchyActions();
  }, [anarchyNamespace, actionFilter]);

  useEffect(() => {
    if (fetchState) {
      reduceFetchState({
        type: 'modify',
        filter: filterFunction,
      });
    }
  }, [JSON.stringify(keywordFilter)]);

  return (
    <>
      <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
        <Split hasGutter>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">
              AnarchyActions
            </Title>
          </SplitItem>
          <SplitItem>
            <RefreshButton onClick={() => reloadAnarchyActions()} />
          </SplitItem>
          <SplitItem>
            <KeywordSearchInput
              initialValue={keywordFilter}
              onSearch={(value) => {
                if (value) {
                  urlSearchParams.set('search', value.join(' '));
                } else if (urlSearchParams.has('search')) {
                  urlSearchParams.delete('search');
                }
                navigate(`${location.pathname}?${urlSearchParams.toString()}`);
              }}
            />
          </SplitItem>
          <SplitItem>
            <AnarchyActionSelect
              action={actionFilter}
              onSelect={(action) => {
                if (action) {
                  urlSearchParams.set('action', action);
                } else if (urlSearchParams.has('action')) {
                  urlSearchParams.delete('action');
                }
                navigate(`${location.pathname}?${urlSearchParams.toString()}`);
              }}
            />
          </SplitItem>
          <SplitItem>
            <AnarchyNamespaceSelect
              namespace={anarchyNamespace}
              onSelect={(namespaceName) => {
                if (namespaceName) {
                  navigate(`/admin/anarchyactions/${namespaceName}${location.search}`);
                } else {
                  navigate(`/admin/anarchyactions${location.search}`);
                }
              }}
            />
          </SplitItem>
          <SplitItem>
            <ActionDropdown
              position="right"
              actionDropdownItems={[
                <ActionDropdownItem key="delete" label="Delete Selected" onSelect={() => confirmThenDelete()} />,
              ]}
            />
          </SplitItem>
        </Split>
      </PageSection>
      {anarchyActions.length === 0 ? (
        fetchState?.finished ? (
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
                reduceSelectedUids({ type: 'set', items: anarchyActions });
              } else {
                reduceSelectedUids({ type: 'clear' });
              }
            }}
            rows={anarchyActions.map((anarchyAction: AnarchyAction) => {
              return {
                cells: [
                  <>
                    {anarchyAction.metadata.namespace}
                    <OpenshiftConsoleLink key="console" resource={anarchyAction} linkToNamespace={true} />
                  </>,
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
                    <Link
                      key="admin"
                      to={`/admin/anarchysubjects/${anarchyAction.spec.subjectRef.namespace}/${anarchyAction.spec.subjectRef.name}`}
                    >
                      {anarchyAction.spec.subjectRef.name}
                    </Link>
                    <OpenshiftConsoleLink key="console" reference={anarchyAction.spec.subjectRef} />
                  </>,
                  anarchyAction.spec.governorRef ? (
                    <>
                      <Link
                        key="admin"
                        to={`/admin/anarchygovernors/${anarchyAction.spec.governorRef.namespace}/${anarchyAction.spec.governorRef.name}`}
                      >
                        {anarchyAction.spec.governorRef.name}
                      </Link>
                      <OpenshiftConsoleLink key="console" reference={anarchyAction.spec.governorRef} />
                    </>
                  ) : (
                    <>
                      <p style={{ color: 'red', fontWeight: 'bold' }}>NO GOVERNOR?!</p>
                    </>
                  ),
                  <>
                    <LocalTimestamp key="timestamp" timestamp={anarchyAction.metadata.creationTimestamp} />
                    <span key="interval" style={{ padding: '0 6px' }}>
                      <TimeInterval key="time-interval" toTimestamp={anarchyAction.metadata.creationTimestamp} />)
                    </span>
                  </>,
                  <>{anarchyAction.status?.state || <p>-</p>}</>,
                  anarchyAction.status?.finishedTimestamp ? (
                    <>
                      <LocalTimestamp key="timestamp" timestamp={anarchyAction.status.finishedTimestamp} />
                      <span key="interval" style={{ padding: '0 6px' }}>
                        <TimeInterval key="time-interval" toTimestamp={anarchyAction.status.finishedTimestamp} />)
                      </span>
                    </>
                  ) : (
                    <p>-</p>
                  ),
                ],
                onSelect: (isSelected) =>
                  reduceSelectedUids({
                    type: isSelected ? 'add' : 'remove',
                    items: [anarchyAction],
                  }),
                selected: selectedUids.includes(anarchyAction.metadata.uid),
              };
            })}
          />
          {fetchState?.canContinue ? (
            <EmptyState variant="full">
              <EmptyStateIcon icon={LoadingIcon} />
            </EmptyState>
          ) : null}
        </PageSection>
      )}
    </>
  );
};

export default AnarchyActions;
