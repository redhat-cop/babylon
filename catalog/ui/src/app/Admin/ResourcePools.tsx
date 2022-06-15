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
import { deleteResourcePool, listResourcePools } from '@app/api';
import { cancelFetchActivity, k8sFetchStateReducer } from '@app/K8sFetchState';
import { selectedUidsReducer } from '@app/reducers';
import { K8sObject, ResourcePool, ResourcePoolList } from '@app/types';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import KeywordSearchInput from '@app/components/KeywordSearchInput';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import RefreshButton from '@app/components/RefreshButton';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';
import ResourcePoolMinAvailableInput from './ResourcePoolMinAvailableInput';

import './admin.css';

const FETCH_BATCH_LIMIT = 50;

function keywordMatch(resourcePool: ResourcePool, keyword: string): boolean {
  if (resourcePool.metadata.name.includes(keyword)) {
    return true;
  }
  for (const resource of resourcePool.spec.resources) {
    if (resource.provider.name.includes(keyword)) {
      return true;
    }
  }
  return false;
}

function filterResourcePool(resourcePool: ResourcePool, keywordFilter: string[]): boolean {
  if (!keywordFilter) {
    return true;
  }
  for (const keyword of keywordFilter) {
    if (!keywordMatch(resourcePool, keyword)) {
      return false;
    }
  }
  return true;
}

function pruneResourcePool(resourcePool: ResourcePool): ResourcePool {
  return {
    apiVersion: resourcePool.apiVersion,
    kind: resourcePool.kind,
    metadata: {
      creationTimestamp: resourcePool.metadata.creationTimestamp,
      name: resourcePool.metadata.name,
      namespace: resourcePool.metadata.namespace,
      uid: resourcePool.metadata.uid,
    },
    spec: {
      minAvailable: resourcePool.spec.minAvailable,
      resources: [
        ...resourcePool.spec.resources.map((resource) => {
          return {
            name: resource.name,
            provider: resource.provider,
          };
        }),
      ],
    },
  };
}

const ResourcePools: React.FC = () => {
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

  const resourcePools: ResourcePool[] = (fetchState?.filteredItems as ResourcePool[]) || [];

  const filterFunction = keywordFilter
    ? (resourcePool: K8sObject): boolean => filterResourcePool(resourcePool as ResourcePool, keywordFilter)
    : null;

  const primaryAppContainer = document.getElementById('primary-app-container');
  primaryAppContainer.onscroll = (e) => {
    const scrollable = e.target as any;
    const scrollRemaining = scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight;
    if (scrollRemaining < 500 && !fetchState?.finished && fetchState.limit <= resourcePools.length) {
      reduceFetchState({
        type: 'modify',
        limit: fetchState.limit + FETCH_BATCH_LIMIT,
      });
    }
  };

  async function confirmThenDelete(): Promise<void> {
    if (confirm('Deleted selected ResourcePools?')) {
      const removedResourcePools: ResourcePool[] = [];
      for (const resourcePool of resourcePools) {
        if (selectedUids.includes(resourcePool.metadata.uid)) {
          await deleteResourcePool(resourcePool);
          removedResourcePools.push(resourcePool);
        }
      }
      reduceSelectedUids({ type: 'clear' });
      reduceFetchState({ type: 'removeItems', items: removedResourcePools });
    }
  }

  async function fetchResourcePools(): Promise<void> {
    const resourcePoolList: ResourcePoolList = await listResourcePools({
      continue: fetchState.continue,
      limit: FETCH_BATCH_LIMIT,
    });
    if (!fetchState.activity.canceled) {
      reduceFetchState({
        type: 'post',
        k8sObjectList: resourcePoolList,
        refreshInterval: 15000,
        refresh: (): void => {
          reduceFetchState({ type: 'startRefresh' });
        },
      });
    }
  }

  function onResourcePoolChange(resourcePool: ResourcePool): void {
    reduceFetchState({
      type: 'updateItems',
      items: [resourcePool],
    });
  }

  function reloadResourcePools(): void {
    reduceFetchState({
      type: 'startFetch',
      filter: filterFunction,
      limit: FETCH_BATCH_LIMIT,
      prune: pruneResourcePool,
    });
    reduceSelectedUids({ type: 'clear' });
  }

  // First render and detect unmount
  useEffect(() => {
    reloadResourcePools();
    return () => {
      componentWillUnmount.current = true;
    };
  }, []);

  // Fetch or continue fetching
  useEffect(() => {
    if (fetchState?.canContinue && (fetchState.refreshing || fetchState.filteredItems.length < fetchState.limit)) {
      fetchResourcePools();
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
              ResourcePools
            </Title>
          </SplitItem>
          <SplitItem>
            <RefreshButton onClick={() => reloadResourcePools()} />
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
      {resourcePools.length === 0 ? (
        fetchState?.finished ? (
          <PageSection>
            <EmptyState variant="full">
              <EmptyStateIcon icon={ExclamationTriangleIcon} />
              <Title headingLevel="h1" size="lg">
                No ResourcePools found
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
            columns={['Name', 'Minimum Available', 'ResourceProvider(s)', 'Created At']}
            onSelectAll={(isSelected) => {
              if (isSelected) {
                reduceSelectedUids({ type: 'set', items: resourcePools });
              } else {
                reduceSelectedUids({ type: 'clear' });
              }
            }}
            rows={resourcePools.map((resourcePool: ResourcePool) => {
              return {
                cells: [
                  <>
                    <Link key="admin" to={`/admin/resourcepools/${resourcePool.metadata.name}`}>
                      {resourcePool.metadata.name}
                    </Link>
                    <OpenshiftConsoleLink key="console" resource={resourcePool} />
                  </>,
                  <>
                    <ResourcePoolMinAvailableInput onChange={onResourcePoolChange} resourcePool={resourcePool} />
                  </>,
                  <>
                    {resourcePool.spec.resources.map((resourcePoolSpecResource, idx) => (
                      <div key={idx}>
                        <Link key="admin" to={`/admin/resourceproviders/${resourcePoolSpecResource.provider.name}`}>
                          {resourcePoolSpecResource.provider.name}
                        </Link>
                        <OpenshiftConsoleLink key="console" reference={resourcePoolSpecResource.provider} />
                      </div>
                    ))}
                  </>,
                  <>
                    <LocalTimestamp key="timestamp" timestamp={resourcePool.metadata.creationTimestamp} />
                    <span key="interval" style={{ padding: '0 6px' }}>
                      (<TimeInterval key="time-interval" toTimestamp={resourcePool.metadata.creationTimestamp} />)
                    </span>
                  </>,
                ],
                onSelect: (isSelected) =>
                  reduceSelectedUids({
                    type: isSelected ? 'add' : 'remove',
                    items: [resourcePool],
                  }),
                selected: selectedUids.includes(resourcePool.metadata.uid),
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

export default ResourcePools;
