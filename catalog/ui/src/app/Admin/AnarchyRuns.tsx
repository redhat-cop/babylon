import React, { useEffect, useReducer, useRef, useState } from 'react';
import { Link, useNavigate, useLocation, useParams } from 'react-router-dom';
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
import { deleteAnarchyRun, listAnarchyRuns, listAnarchyRunners } from '@app/api';
import { cancelFetchActivity, k8sFetchStateReducer } from '@app/K8sFetchState';
import { selectedUidsReducer } from '@app/reducers';
import { AnarchyRun, AnarchyRunList, AnarchyRunner, AnarchyRunnerList, K8sObject } from '@app/types';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import KeywordSearchInput from '@app/components/KeywordSearchInput';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import RefreshButton from '@app/components/RefreshButton';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';
import AnarchyNamespaceSelect from './AnarchyNamespaceSelect';
import AnarchyRunnerStateSelect from './AnarchyRunnerStateSelect';

import './admin.css';

const FETCH_BATCH_LIMIT = 20;

function keywordMatch(anarchyRun: AnarchyRun, keyword: string): boolean {
  if (anarchyRun.metadata.name.includes(keyword)) {
    return true;
  }
  if (anarchyRun.spec.action && anarchyRun.spec.action.name.includes(keyword)) {
    return true;
  }
  if (anarchyRun.spec.actionConfig && anarchyRun.spec.actionConfig.name.includes(keyword)) {
    return true;
  }
  if (anarchyRun.spec.governor.name.includes(keyword)) {
    return true;
  }
  if (anarchyRun.spec.subject.name.includes(keyword)) {
    return true;
  }
  return false;
}

function filterAnarchyRun(anarchyRun: AnarchyRun, keywordFilter: string[]): boolean {
  if (!keywordFilter) {
    return true;
  }
  for (const keyword of keywordFilter) {
    if (!keywordMatch(anarchyRun, keyword)) {
      return false;
    }
  }
  return true;
}

/*
function pruneAnarchyRun(anarchyRun: AnarchyRun) {
  return {
    apiVersion: anarchyRun.apiVersion,
    kind: anarchyRun.kind,
    metadata: {
      creationTimestamp: anarchyRun.metadata.creationTimestamp,
      labels: anarchyRun.metadata.labels,
      name: anarchyRun.metadata.name,
      namespace: anarchyRun.metadata.namespace,
      uid: anarchyRun.metadata.uid,
    },
    spec: {
      action: {
        apiVersion: anarchyRun.spec.action?.apiVersion,
        kind: anarchyRun.spec.action?.kind,
        name: anarchyRun.spec.action?.name,
        namespace: anarchyRun.spec.action?.namespace,
      },
      actionConfig: {
        name: anarchyRun.spec.actionConfig?.name,
      },
      governor: {
        apiVersion: anarchyRun.spec.governor?.apiVersion,
        kind: anarchyRun.spec.governor?.kind,
        name: anarchyRun.spec.governor?.name,
        namespace: anarchyRun.spec.governor?.namespace,
      },
      handler: {
        name: anarchyRun.spec.handler?.name,
      },
      subject: {
        apiVersion: anarchyRun.spec.subject?.apiVersion,
        kind: anarchyRun.spec.subject?.kind,
        name: anarchyRun.spec.subject?.name,
        namespace: anarchyRun.spec.subject?.namespace,
      },
    },
    status: {
      result: {
        status: anarchyRun.spec?.result?.status,
      },
      runPostTimestamp: {
        status: anarchyRun.spec?.runPostTimestamp,
      },
      runner: anarchyRun.spec?.runner,
      runnerPod: anarchyRun.spec?.runnerPod,
    },
  };
}
*/

const AnarchyRuns: React.FC = () => {
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
  const stateUrlParam = urlSearchParams.has('state') ? urlSearchParams.get('state') : null;

  const [selectedUids, reduceSelectedUids] = useReducer(selectedUidsReducer, []);
  const [fetchState, reduceFetchState] = useReducer(k8sFetchStateReducer, null);
  const [anarchyRunnerFetchState, reduceAnarchyRunnerFetchState] = useReducer(k8sFetchStateReducer, null);
  const [stateFilter, setStateFilter] = useState<string[] | undefined>(undefined);

  const anarchyRuns: AnarchyRun[] = (fetchState?.filteredItems as AnarchyRun[]) || [];

  const filterFunction = keywordFilter
    ? (anarchyRun: K8sObject): boolean => filterAnarchyRun(anarchyRun as AnarchyRun, keywordFilter)
    : null;

  const primaryAppContainer = document.getElementById('primary-app-container');
  primaryAppContainer.onscroll = (e) => {
    const scrollable = e.target as any;
    const scrollRemaining = scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight;
    if (scrollRemaining < 500 && fetchState?.continue && fetchState.limit <= anarchyRuns.length) {
      reduceFetchState({
        type: 'modify',
        limit: fetchState.limit + FETCH_BATCH_LIMIT,
      });
    }
  };

  async function confirmThenDelete(): Promise<void> {
    if (confirm('Deleted selected AnarchyRuns?')) {
      const removedAnarchyRuns: AnarchyRun[] = [];
      for (const anarchyRun of anarchyRuns) {
        if (selectedUids.includes(anarchyRun.metadata.uid)) {
          await deleteAnarchyRun(anarchyRun);
          removedAnarchyRuns.push(anarchyRun);
        }
      }
      reduceSelectedUids({ type: 'clear' });
      reduceFetchState({ type: 'removeItems', items: removedAnarchyRuns });
    }
  }

  async function fetchAnarchyRuns(): Promise<void> {
    const labelSelectors = [];
    if (stateFilter) {
      if (stateFilter.length === 1) {
        if (stateFilter[0] === 'incomplete') {
          labelSelectors.push(`anarchy.gpte.redhat.com/runner!=successful`);
        } else {
          labelSelectors.push(`anarchy.gpte.redhat.com/runner=${stateFilter[0]}`);
        }
      } else {
        labelSelectors.push(`anarchy.gpte.redhat.com/runner in (${stateFilter.join(', ')})`);
      }
    }
    const anarchyRunList: AnarchyRunList = await listAnarchyRuns({
      continue: fetchState.continue,
      labelSelector: labelSelectors.length > 0 ? labelSelectors.join(',') : null,
      limit: FETCH_BATCH_LIMIT,
      namespace: anarchyNamespace,
    });
    if (!fetchState.activity.canceled) {
      reduceFetchState({
        type: 'post',
        k8sObjectList: anarchyRunList,
        refreshInterval: 10000,
        refresh: (): void => {
          reduceFetchState({ type: 'startRefresh' });
        },
      });
    }
  }

  async function fetchAnarchyRunners(): Promise<void> {
    const anarchyRunnerList: AnarchyRunnerList = await listAnarchyRunners();
    if (!anarchyRunnerFetchState.activity.canceled) {
      reduceAnarchyRunnerFetchState({
        type: 'post',
        k8sObjectList: anarchyRunnerList,
        refreshInterval: 20000,
        refresh: (): void => {
          reduceFetchState({ type: 'startRefresh' });
        },
      });
    }
  }

  function reloadAnarchyRuns(): void {
    reduceFetchState({
      type: 'startFetch',
      filter: filterFunction,
      limit: FETCH_BATCH_LIMIT,
    });
    reduceSelectedUids({ type: 'clear' });
  }

  useEffect(() => {
    return () => {
      componentWillUnmount.current = true;
    };
  }, []);

  // Translate stateUrlParam to set stateFilter
  useEffect(() => {
    if (stateUrlParam === 'running') {
      const anarchyRunners: AnarchyRunner[] = (anarchyRunnerFetchState?.items as AnarchyRunner[]) || [];
      const anarchyRunnerPodNames: string[] = [];
      for (const anarchyRunner of anarchyRunners) {
        anarchyRunnerPodNames.push(...(anarchyRunner.status?.pods || []).map((p) => p.name));
      }
      setStateFilter(anarchyRunnerPodNames);
    } else if (stateUrlParam) {
      setStateFilter([stateUrlParam]);
    } else {
      setStateFilter(null);
    }
  }, [stateUrlParam, anarchyRunnerFetchState]);

  // Fetch or continue fetching
  useEffect(() => {
    if (fetchState?.canContinue && (fetchState.refreshing || fetchState.filteredItems.length < fetchState.limit)) {
      fetchAnarchyRuns();
    }
    return () => {
      if (componentWillUnmount.current) {
        cancelFetchActivity(fetchState);
      }
    };
  }, [fetchState]);

  useEffect(() => {
    if (!anarchyRunnerFetchState) {
      reduceAnarchyRunnerFetchState({ type: 'startFetch' });
    } else if (anarchyRunnerFetchState?.canContinue) {
      fetchAnarchyRunners();
    }
    return () => {
      if (componentWillUnmount.current) {
        cancelFetchActivity(anarchyRunnerFetchState);
      }
    };
  }, [anarchyRunnerFetchState]);

  // Start fetch and reload on k8s namespace or label filter
  useEffect(() => {
    reloadAnarchyRuns();
  }, [anarchyNamespace, stateFilter]);

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
              AnarchyRuns
            </Title>
          </SplitItem>
          <SplitItem>
            <RefreshButton onClick={() => reloadAnarchyRuns()} />
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
                navigate(`${location.pathname}?${urlSearchParams.toString()}`);
              }}
            />
          </SplitItem>
          <SplitItem>
            <AnarchyRunnerStateSelect
              runnerState={stateUrlParam}
              onSelect={(state) => {
                if (state) {
                  urlSearchParams.set('state', state);
                } else if (urlSearchParams.has('state')) {
                  urlSearchParams.delete('state');
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
                  navigate(`/admin/anarchyruns/${namespaceName}${location.search}`);
                } else {
                  navigate(`/admin/anarchyruns${location.search}`);
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
      {anarchyRuns.length === 0 ? (
        fetchState?.finished ? (
          <PageSection>
            <EmptyState variant="full">
              <EmptyStateIcon icon={ExclamationTriangleIcon} />
              <Title headingLevel="h1" size="lg">
                No AnarchyRuns found
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
            columns={['Namespace', 'Name', 'Runner State', 'AnarchySubject', 'AnarchyAction', 'Created At']}
            onSelectAll={(isSelected) => {
              if (isSelected) {
                reduceSelectedUids({ type: 'set', items: anarchyRuns });
              } else {
                reduceSelectedUids({ type: 'clear' });
              }
            }}
            rows={anarchyRuns.map((anarchyRun: AnarchyRun) => {
              return {
                cells: [
                  <>
                    {anarchyRun.metadata.namespace}
                    <OpenshiftConsoleLink key="console" resource={anarchyRun} linkToNamespace={true} />
                  </>,
                  <>
                    <Link
                      key="admin"
                      to={`/admin/anarchyruns/${anarchyRun.metadata.namespace}/${anarchyRun.metadata.name}`}
                    >
                      {anarchyRun.metadata.name}
                    </Link>
                    <OpenshiftConsoleLink key="console" resource={anarchyRun} />
                  </>,
                  <>{anarchyRun.metadata.labels?.['anarchy.gpte.redhat.com/runner'] || <p>-</p>}</>,
                  <>
                    <Link
                      key="admin"
                      to={`/admin/anarchysubjects/${anarchyRun.spec.subject.namespace}/${anarchyRun.spec.subject.name}`}
                    >
                      {anarchyRun.spec.subject.name}
                    </Link>
                    <OpenshiftConsoleLink key="console" reference={anarchyRun.spec.subject} />
                  </>,
                  anarchyRun.spec.action ? (
                    <>
                      <Link
                        key="admin"
                        to={`/admin/anarchyactions/${anarchyRun.spec.action.namespace}/${anarchyRun.spec.action.name}`}
                      >
                        {anarchyRun.spec.action.name}
                      </Link>
                      <OpenshiftConsoleLink key="console" reference={anarchyRun.spec.subject} />
                    </>
                  ) : (
                    <p>-</p>
                  ),
                  <>
                    <LocalTimestamp key="timestamp" timestamp={anarchyRun.metadata.creationTimestamp} />
                    <span key="interval" style={{ padding: '0 6px' }}>
                      (<TimeInterval key="time-interval" toTimestamp={anarchyRun.metadata.creationTimestamp} />)
                    </span>
                  </>,
                ],
                onSelect: (isSelected) =>
                  reduceSelectedUids({
                    type: isSelected ? 'add' : 'remove',
                    items: [anarchyRun],
                  }),
                selected: selectedUids.includes(anarchyRun.metadata.uid),
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

export default AnarchyRuns;
