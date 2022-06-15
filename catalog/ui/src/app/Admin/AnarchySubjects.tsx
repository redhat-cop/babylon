import React, { useEffect, useReducer, useRef } from 'react';
import { Link, useHistory, useLocation, useRouteMatch } from 'react-router-dom';
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
import { deleteAnarchySubject, forceDeleteAnarchySubject, listAnarchySubjects } from '@app/api';
import { cancelFetchActivity, k8sFetchStateReducer } from '@app/K8sFetchState';
import { selectedUidsReducer } from '@app/reducers';
import { AnarchySubject, AnarchySubjectList, K8sObject } from '@app/types';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import KeywordSearchInput from '@app/components/KeywordSearchInput';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';
import RefreshButton from '@app/components/RefreshButton';
import AnarchyNamespaceSelect from './AnarchyNamespaceSelect';
import AnarchySubjectStateSelect from './AnarchySubjectStateSelect';

import './admin.css';

const FETCH_BATCH_LIMIT = 20;

function keywordMatch(anarchySubject: AnarchySubject, keyword: string): boolean {
  if (anarchySubject.metadata.name.includes(keyword)) {
    return true;
  }
  if (anarchySubject.spec.governor.includes(keyword)) {
    return true;
  }
  return false;
}

function filterAnarchySubject(anarchySubject: AnarchySubject, keywordFilter: string[]): boolean {
  if (!keywordFilter) {
    return true;
  }
  for (const keyword of keywordFilter) {
    if (!keywordMatch(anarchySubject, keyword)) {
      return false;
    }
  }
  return true;
}

function pruneAnarchySubject(anarchySubject: AnarchySubject): AnarchySubject {
  return {
    apiVersion: anarchySubject.apiVersion,
    kind: anarchySubject.kind,
    metadata: {
      creationTimestamp: anarchySubject.metadata.creationTimestamp,
      deletionTimestamp: anarchySubject.metadata.deletionTimestamp,
      name: anarchySubject.metadata.name,
      namespace: anarchySubject.metadata.namespace,
      uid: anarchySubject.metadata.uid,
    },
    spec: {
      governor: anarchySubject.spec.governor,
      vars: {
        current_state: anarchySubject.spec.vars?.current_state,
        desired_state: anarchySubject.spec.vars?.desired_state,
      },
    },
  };
}

const AnarchySubjects: React.FC = () => {
  const history = useHistory();
  const location = useLocation();
  const componentWillUnmount = useRef(false);
  const routeMatch = useRouteMatch<any>('/admin/anarchysubjects/:namespace?');
  const anarchyNamespace = routeMatch.params.namespace;
  const urlSearchParams = new URLSearchParams(location.search);
  const keywordFilter = urlSearchParams.has('search')
    ? urlSearchParams
        .get('search')
        .trim()
        .split(/ +/)
        .filter((w) => w != '')
    : null;
  const stateFilter = urlSearchParams.has('state') ? urlSearchParams.get('state') : null;

  const [fetchState, reduceFetchState] = useReducer(k8sFetchStateReducer, null);
  const [selectedUids, reduceSelectedUids] = useReducer(selectedUidsReducer, []);

  const anarchySubjects: AnarchySubject[] = (fetchState?.filteredItems as AnarchySubject[]) || [];

  const filterFunction = keywordFilter
    ? (anarchySubject: K8sObject): boolean => filterAnarchySubject(anarchySubject as AnarchySubject, keywordFilter)
    : null;

  const primaryAppContainer = document.getElementById('primary-app-container');
  primaryAppContainer.onscroll = (e) => {
    const scrollable = e.target as any;
    const scrollRemaining = scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight;
    if (scrollRemaining < 500 && !fetchState?.finished && fetchState.limit <= anarchySubjects.length) {
      reduceFetchState({
        type: 'modify',
        limit: fetchState.limit + FETCH_BATCH_LIMIT,
      });
    }
  };

  async function confirmThenDelete(): Promise<void> {
    if (confirm('Delete selected AnarchySubjects?')) {
      const removedAnarchySubjects: AnarchySubject[] = [];
      for (const anarchySubject of anarchySubjects) {
        if (selectedUids.includes(anarchySubject.metadata.uid)) {
          await deleteAnarchySubject(anarchySubject);
          removedAnarchySubjects.push(anarchySubject);
        }
      }
      reduceSelectedUids({ type: 'clear' });
    }
  }

  async function confirmThenForceDelete(): Promise<void> {
    if (confirm('Force delete selected AnarchySubjects? Forcing delete may orphan provisioned cloud resources!')) {
      const removedAnarchySubjects: AnarchySubject[] = [];
      for (const anarchySubject of anarchySubjects) {
        if (selectedUids.includes(anarchySubject.metadata.uid)) {
          await forceDeleteAnarchySubject(anarchySubject);
          removedAnarchySubjects.push(anarchySubject);
        }
      }
      reduceSelectedUids({ type: 'clear' });
      reduceFetchState({ type: 'removeItems', items: removedAnarchySubjects });
    }
  }

  async function fetchAnarchySubjects(): Promise<void> {
    const anarchySubjectList: AnarchySubjectList = await listAnarchySubjects({
      continue: fetchState.continue,
      labelSelector: stateFilter ? `state=${stateFilter}` : null,
      limit: FETCH_BATCH_LIMIT,
      namespace: anarchyNamespace,
    });
    if (!fetchState.activity.canceled) {
      reduceFetchState({
        type: 'post',
        k8sObjectList: anarchySubjectList,
        refreshInterval: 15000,
        refresh: (): void => {
          reduceFetchState({ type: 'startRefresh' });
        },
      });
    }
  }

  function reloadAnarchySubjects() {
    reduceFetchState({
      type: 'startFetch',
      filter: filterFunction,
      limit: FETCH_BATCH_LIMIT,
      prune: pruneAnarchySubject,
    });
    reduceSelectedUids({ type: 'clear' });
  }

  useEffect(() => {
    return () => {
      componentWillUnmount.current = true;
    };
  }, []);

  // Fetch or continue fetching
  useEffect(() => {
    if (fetchState?.canContinue && (fetchState.refreshing || fetchState.filteredItems.length < fetchState.limit)) {
      fetchAnarchySubjects();
    }
    return () => {
      if (componentWillUnmount.current) {
        cancelFetchActivity(fetchState);
      }
    };
  }, [fetchState]);

  // Start fetch and reload on k8s namespace or label filter
  useEffect(() => {
    reloadAnarchySubjects();
  }, [anarchyNamespace, stateFilter]);

  // Handle keyword filter change
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
              AnarchySubjects
            </Title>
          </SplitItem>
          <SplitItem>
            <RefreshButton onClick={() => reloadAnarchySubjects()} />
          </SplitItem>
          <SplitItem>
            <KeywordSearchInput
              initialValue={keywordFilter}
              onSearch={(value) => {
                if (value) {
                  urlSearchParams.set('search', value.join(' '));
                } else if (urlSearchParams.has('search')) {
                  urlSearchParams.delete('searchs');
                }
                history.push(`${location.pathname}?${urlSearchParams.toString()}`);
              }}
            />
          </SplitItem>
          <SplitItem>
            <AnarchySubjectStateSelect
              state={stateFilter}
              onSelect={(state) => {
                if (state) {
                  urlSearchParams.set('state', state);
                } else if (urlSearchParams.has('state')) {
                  urlSearchParams.delete('state');
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
                  history.push(`/admin/anarchysubjects/${namespaceName}${location.search}`);
                } else {
                  history.push(`/admin/anarchysubjects${location.search}`);
                }
              }}
            />
          </SplitItem>
          <SplitItem>
            <ActionDropdown
              position="right"
              actionDropdownItems={[
                <ActionDropdownItem key="delete" label="Delete Selected" onSelect={() => confirmThenDelete()} />,
                <ActionDropdownItem
                  key="force-delete"
                  label="Force Delete Selected"
                  onSelect={() => confirmThenForceDelete()}
                />,
              ]}
            />
          </SplitItem>
        </Split>
      </PageSection>
      {anarchySubjects.length === 0 ? (
        fetchState?.finished ? (
          <PageSection>
            <EmptyState variant="full">
              <EmptyStateIcon icon={ExclamationTriangleIcon} />
              <Title headingLevel="h1" size="lg">
                No AnarchySubjects found
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
            columns={['Namespace', 'Name', 'AnarchyGovernor', 'State', 'Created At', 'Deleted At']}
            onSelectAll={(isSelected) => {
              if (isSelected) {
                reduceSelectedUids({ type: 'set', items: anarchySubjects });
              } else {
                reduceSelectedUids({ type: 'clear' });
              }
            }}
            rows={anarchySubjects.map((anarchySubject: AnarchySubject) => {
              return {
                cells: [
                  <>
                    {anarchySubject.metadata.namespace}
                    <OpenshiftConsoleLink key="console" resource={anarchySubject} linkToNamespace={true} />
                  </>,
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
                    <Link
                      key="admin"
                      to={`/admin/anarchygovernors/${anarchySubject.metadata.namespace}/${anarchySubject.spec.governor}`}
                    >
                      {anarchySubject.spec.governor}
                    </Link>
                    <OpenshiftConsoleLink
                      key="console"
                      reference={{
                        apiVersion: anarchySubject.apiVersion,
                        kind: anarchySubject.kind,
                        name: anarchySubject.spec.governor,
                        namespace: anarchySubject.metadata.namespace,
                      }}
                    />
                  </>,
                  anarchySubject.spec.vars?.current_state || <p>-</p>,
                  <>
                    <LocalTimestamp key="timestamp" timestamp={anarchySubject.metadata.creationTimestamp} />
                    <span key="interval" style={{ padding: '0 6px' }}>
                      (<TimeInterval key="time-interval" toTimestamp={anarchySubject.metadata.creationTimestamp} />)
                    </span>
                  </>,
                  anarchySubject.metadata.deletionTimestamp ? (
                    <>
                      <LocalTimestamp key="timestamp" timestamp={anarchySubject.metadata.deletionTimestamp} />
                      <span key="interval" style={{ padding: '0 6px' }}>
                        (<TimeInterval key="time-interval" toTimestamp={anarchySubject.metadata.deletionTimestamp} />)
                      </span>
                    </>
                  ) : (
                    <p>-</p>
                  ),
                ],
                onSelect: (isSelected) =>
                  reduceSelectedUids({
                    type: isSelected ? 'add' : 'remove',
                    items: [anarchySubject],
                  }),
                selected: selectedUids.includes(anarchySubject.metadata.uid),
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

export default AnarchySubjects;
