import React, { useEffect, useReducer, useRef } from 'react';
import { Link, useHistory, useLocation } from 'react-router-dom';
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
import { deleteResourceProvider, listResourceProviders } from '@app/api';
import { cancelFetchActivity, k8sFetchStateReducer } from '@app/K8sFetchState';
import { selectedUidsReducer } from '@app/reducers';
import { K8sObject, ResourceProvider, ResourceProviderList } from '@app/types';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import KeywordSearchInput from '@app/components/KeywordSearchInput';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import RefreshButton from '@app/components/RefreshButton';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';

import './admin.css';

const FETCH_BATCH_LIMIT = 50;

function keywordMatch(resourceProvider: ResourceProvider, keyword: string): boolean {
  if (resourceProvider.metadata.name.includes(keyword)) {
    return true;
  }
  return false;
}

function filterResourceProvider(resourceProvider: ResourceProvider, keywordFilter: string[]): boolean {
  if (!keywordFilter) {
    return true;
  }
  for (const keyword of keywordFilter) {
    if (!keywordMatch(resourceProvider, keyword)) {
      return false;
    }
  }
  return true;
}

function pruneResourceProvider(resourceProvider: ResourceProvider) {
  return {
    apiVersion: resourceProvider.apiVersion,
    kind: resourceProvider.kind,
    metadata: {
      creationTimestamp: resourceProvider.metadata.creationTimestamp,
      name: resourceProvider.metadata.name,
      namespace: resourceProvider.metadata.namespace,
      uid: resourceProvider.metadata.uid,
    },
    spec: {
      override: resourceProvider.spec.override,
    },
  };
}

const ResourceProviders: React.FC = () => {
  const history = useHistory();
  const location = useLocation();
  const componentWillUnmount = useRef(false);
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

  const resourceProviders: ResourceProvider[] = (fetchState?.filteredItems as ResourceProvider[]) || [];

  const filterFunction = keywordFilter
    ? (resourceProvider: K8sObject): boolean =>
        filterResourceProvider(resourceProvider as ResourceProvider, keywordFilter)
    : null;

  const primaryAppContainer = document.getElementById('primary-app-container');
  primaryAppContainer.onscroll = (e) => {
    const scrollable = e.target as any;
    const scrollRemaining = scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight;
    if (scrollRemaining < 500 && !fetchState?.finished && fetchState.limit <= resourceProviders.length) {
      reduceFetchState({
        type: 'modify',
        limit: fetchState.limit + FETCH_BATCH_LIMIT,
      });
    }
  };

  async function confirmThenDelete() {
    if (confirm('Deleted selected ResourceProviders?')) {
      const removedResourceProviders: ResourceProvider[] = [];
      for (const resourceProvider of resourceProviders) {
        if (selectedUids.includes(resourceProvider.metadata.uid)) {
          await deleteResourceProvider(resourceProvider);
          removedResourceProviders.push(resourceProvider);
        }
      }
      reduceSelectedUids({ type: 'clear' });
      reduceFetchState({ type: 'removeItems', items: removedResourceProviders });
    }
  }

  async function fetchResourceProviders(): Promise<void> {
    const resourceProviderList: ResourceProviderList = await listResourceProviders({
      continue: fetchState.continue,
      limit: FETCH_BATCH_LIMIT,
    });
    if (!fetchState.activity.canceled) {
      reduceFetchState({
        type: 'post',
        k8sObjectList: resourceProviderList,
        refreshInterval: 60000,
        refresh: (): void => {
          reduceFetchState({ type: 'startRefresh' });
        },
      });
    }
  }

  function reloadResourceProviders(): void {
    reduceFetchState({
      type: 'startFetch',
      filter: filterFunction,
      limit: FETCH_BATCH_LIMIT,
      prune: pruneResourceProvider,
    });
    reduceSelectedUids({ type: 'clear' });
  }

  // First render and detect unmount
  useEffect(() => {
    reloadResourceProviders();
    return () => {
      componentWillUnmount.current = true;
    };
  }, []);

  // Fetch or continue fetching
  useEffect(() => {
    if (fetchState?.canContinue && (fetchState.refreshing || fetchState.filteredItems.length < fetchState.limit)) {
      fetchResourceProviders();
    }
    return () => {
      if (componentWillUnmount.current) {
        cancelFetchActivity(fetchState);
      }
    };
  }, [fetchState]);

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
              ResourceProviders
            </Title>
          </SplitItem>
          <SplitItem>
            <RefreshButton onClick={() => reloadResourceProviders()} />
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
                history.push(`${location.pathname}?${urlSearchParams.toString()}`);
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
      {resourceProviders.length === 0 ? (
        fetchState?.finished ? (
          <PageSection>
            <EmptyState variant="full">
              <EmptyStateIcon icon={ExclamationTriangleIcon} />
              <Title headingLevel="h1" size="lg">
                No ResourceProviders found
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
            columns={['Name', 'Created At']}
            onSelectAll={(isSelected) => {
              if (isSelected) {
                reduceSelectedUids({ type: 'set', items: resourceProviders });
              } else {
                reduceSelectedUids({ type: 'clear' });
              }
            }}
            rows={resourceProviders.map((resourceProvider: ResourceProvider) => {
              return {
                cells: [
                  <>
                    <Link key="admin" to={`/admin/resourceproviders/${resourceProvider.metadata.name}`}>
                      {resourceProvider.metadata.name}
                    </Link>
                    <OpenshiftConsoleLink key="console" resource={resourceProvider} />
                  </>,
                  <>
                    <LocalTimestamp key="timestamp" timestamp={resourceProvider.metadata.creationTimestamp} />
                    <span style={{ padding: '0 6px' }}>
                      (<TimeInterval key="interval" toTimestamp={resourceProvider.metadata.creationTimestamp} />)
                    </span>
                  </>,
                ],
                onSelect: (isSelected) =>
                  reduceSelectedUids({
                    type: isSelected ? 'add' : 'remove',
                    items: [resourceProvider],
                  }),
                selected: selectedUids.includes(resourceProvider.metadata.uid),
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

export default ResourceProviders;
