import React, { useEffect, useReducer, useRef } from 'react';
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
import { deleteAnarchyGovernor, listAnarchyGovernors } from '@app/api';
import { cancelFetchActivity, k8sFetchStateReducer } from '@app/K8sFetchState';
import { selectedUidsReducer } from '@app/reducers';
import { AnarchyGovernor, AnarchyGovernorList, K8sObject } from '@app/types';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import KeywordSearchInput from '@app/components/KeywordSearchInput';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import RefreshButton from '@app/components/RefreshButton';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';
import AnarchyNamespaceSelect from './AnarchyNamespaceSelect';

import './admin.css';

const FETCH_BATCH_LIMIT = 50;

function keywordMatch(anarchyGovernor: AnarchyGovernor, keyword: string): boolean {
  if (anarchyGovernor.metadata.name.includes(keyword)) {
    return true;
  }
  return false;
}

function filterAnarchyGovernor(anarchyGovernor: AnarchyGovernor, keywordFilter: string[]): boolean {
  if (!keywordFilter) {
    return true;
  }
  for (const keyword of keywordFilter) {
    if (!keywordMatch(anarchyGovernor, keyword)) {
      return false;
    }
  }
  return true;
}

/*
function pruneAnarchyGovernor(anarchyGovernor: AnarchyGovernor) {
  return {
    apiVersion: anarchyGovernor.apiVersion,
    kind: anarchyGovernor.kind,
    metadata: {
      creationTimestamp: anarchyGovernor.metadata.creationTimestamp,
      name: anarchyGovernor.metadata.name,
      namespace: anarchyGovernor.metadata.namespace,
      uid: anarchyGovernor.metadata.uid,
    },
    spec: {},
  };
}
*/

const AnarchyGovernors: React.FC = () => {
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

  const [fetchState, reduceFetchState] = useReducer(k8sFetchStateReducer, null);
  const [selectedUids, reduceSelectedUids] = useReducer(selectedUidsReducer, []);

  const anarchyGovernors: AnarchyGovernor[] = (fetchState?.filteredItems as AnarchyGovernor[]) || [];

  const filterFunction = keywordFilter
    ? (anarchyGovernor: K8sObject): boolean => filterAnarchyGovernor(anarchyGovernor as AnarchyGovernor, keywordFilter)
    : null;

  const primaryAppContainer = document.getElementById('primary-app-container');
  primaryAppContainer.onscroll = (e) => {
    const scrollable = e.target as any;
    const scrollRemaining = scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight;
    if (scrollRemaining < 500 && fetchState.continue && fetchState.limit <= anarchyGovernors.length) {
      reduceFetchState({
        type: 'modify',
        limit: fetchState.limit + FETCH_BATCH_LIMIT,
      });
    }
  };

  async function confirmThenDelete(): Promise<void> {
    if (confirm('Deleted selected AnarchyGovernors?')) {
      const removedAnarchyGovernors: AnarchyGovernor[] = [];
      for (const anarchyGovernor of anarchyGovernors) {
        if (selectedUids.includes(anarchyGovernor.metadata.uid)) {
          await deleteAnarchyGovernor(anarchyGovernor);
          removedAnarchyGovernors.push(anarchyGovernor);
        }
      }
      reduceSelectedUids({ type: 'clear' });
      reduceFetchState({ type: 'removeItems', items: removedAnarchyGovernors });
    }
  }

  async function fetchAnarchyGovernors(): Promise<void> {
    const anarchyGovernorList: AnarchyGovernorList = await listAnarchyGovernors({
      continue: fetchState.continue,
      limit: FETCH_BATCH_LIMIT,
      namespace: anarchyNamespace,
    });
    if (!fetchState.activity.canceled) {
      reduceFetchState({
        type: 'post',
        k8sObjectList: anarchyGovernorList,
        refreshInterval: 60000,
        refresh: (): void => {
          reduceFetchState({ type: 'startRefresh' });
        },
      });
    }
  }

  function reloadAnarchyGovernors(): void {
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

  // Fetch or continue fetching
  useEffect(() => {
    if (fetchState?.canContinue && (fetchState.refreshing || fetchState.filteredItems.length < fetchState.limit)) {
      fetchAnarchyGovernors();
    }
    return () => {
      if (componentWillUnmount.current) {
        cancelFetchActivity(fetchState);
      }
    };
  }, [fetchState]);

  // Start fetch and reload on namespace change
  useEffect(() => {
    reloadAnarchyGovernors();
  }, [anarchyNamespace]);

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
              AnarchyGovernors
            </Title>
          </SplitItem>
          <SplitItem>
            <RefreshButton onClick={() => reloadAnarchyGovernors()} />
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
            <AnarchyNamespaceSelect
              namespace={anarchyNamespace}
              onSelect={(namespaceName) => {
                if (namespaceName) {
                  navigate(`/admin/anarchygovernors/${namespaceName}${location.search}`);
                } else {
                  navigate(`/admin/anarchygovernors${location.search}`);
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
      {anarchyGovernors.length === 0 ? (
        fetchState?.finished ? (
          <PageSection>
            <EmptyState variant="full">
              <EmptyStateIcon icon={ExclamationTriangleIcon} />
              <Title headingLevel="h1" size="lg">
                No AnarchyGovernors found
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
            columns={['Namespace', 'Name', 'Created At']}
            onSelectAll={(isSelected) => {
              if (isSelected) {
                reduceSelectedUids({ type: 'set', items: anarchyGovernors });
              } else {
                reduceSelectedUids({ type: 'clear' });
              }
            }}
            rows={anarchyGovernors.map((anarchyGovernor: AnarchyGovernor) => {
              return {
                cells: [
                  <>
                    {anarchyGovernor.metadata.namespace}
                    <OpenshiftConsoleLink key="console" resource={anarchyGovernor} linkToNamespace={true} />
                  </>,
                  <>
                    <Link
                      key="admin"
                      to={`/admin/anarchygovernors/${anarchyGovernor.metadata.namespace}/${anarchyGovernor.metadata.name}`}
                    >
                      {anarchyGovernor.metadata.name}
                    </Link>
                    <OpenshiftConsoleLink key="console" resource={anarchyGovernor} />
                  </>,
                  <>
                    <LocalTimestamp key="timestamp" timestamp={anarchyGovernor.metadata.creationTimestamp} />
                    <span key="interval" style={{ padding: '0 6px' }}>
                      (<TimeInterval key="time-interval" toTimestamp={anarchyGovernor.metadata.creationTimestamp} />)
                    </span>
                  </>,
                ],
                onSelect: (isSelected) =>
                  reduceSelectedUids({
                    type: isSelected ? 'add' : 'remove',
                    items: [anarchyGovernor],
                  }),
                selected: selectedUids.includes(anarchyGovernor.metadata.uid),
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

export default AnarchyGovernors;
