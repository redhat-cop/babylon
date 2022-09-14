import React, { useCallback, useMemo, useReducer } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  EmptyState,
  EmptyStateIcon,
  PageSection,
  PageSectionVariants,
  Split,
  SplitItem,
  Title,
} from '@patternfly/react-core';
import useSWRInfinite from 'swr/infinite';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';
import { apiPaths, deleteResourcePool, fetcher } from '@app/api';
import { selectedUidsReducer } from '@app/reducers';
import { ResourcePool, ResourcePoolList } from '@app/types';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import KeywordSearchInput from '@app/components/KeywordSearchInput';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';
import ResourcePoolMinAvailableInput from './ResourcePoolMinAvailableInput';
import { compareK8sObjects, FETCH_BATCH_LIMIT } from '@app/util';
import useMatchMutate from '@app/utils/useMatchMutate';

import './admin.css';

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

const ResourcePools: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const matchMutate = useMatchMutate();
  const urlSearchParams = new URLSearchParams(location.search);
  const keywordFilter = urlSearchParams.has('search')
    ? urlSearchParams
        .get('search')
        .trim()
        .split(/ +/)
        .filter((w) => w != '')
    : null;
  const [selectedUids, reduceSelectedUids] = useReducer(selectedUidsReducer, []);

  const {
    data: resourcePoolsPages,
    mutate,
    size,
    setSize,
  } = useSWRInfinite<ResourcePoolList>(
    (index, previousPageData: ResourcePoolList) => {
      if (previousPageData && !previousPageData.metadata?.continue) {
        return null;
      }
      const continueId = index === 0 ? '' : previousPageData.metadata?.continue;
      return apiPaths.RESOURCE_POOLS({ limit: FETCH_BATCH_LIMIT, continueId });
    },
    fetcher,
    {
      refreshInterval: 8000,
      revalidateFirstPage: true,
      revalidateAll: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      compare: (currentData: any, newData: any) => {
        if (currentData === newData) return true;
        if (!currentData || currentData.length === 0) return false;
        if (!newData || newData.length === 0) return false;
        if (currentData.length !== newData.length) return false;
        for (let i = 0; i < currentData.length; i++) {
          if (!compareK8sObjects(currentData[i].items, newData[i].items)) return false;
        }
        return true;
      },
    }
  );

  const revalidate = useCallback(
    ({ updatedItems, action }: { updatedItems: ResourcePool[]; action: 'update' | 'delete' }) => {
      const resourcePoolsPagesCpy: ResourcePoolList[] = JSON.parse(JSON.stringify(resourcePoolsPages));
      let p: ResourcePoolList;
      let i: number;
      for ([i, p] of resourcePoolsPagesCpy.entries()) {
        for (const updatedItem of updatedItems) {
          const foundIndex = p.items.findIndex((r) => r.metadata.uid === updatedItem.metadata.uid);
          if (foundIndex > -1) {
            if (action === 'delete') {
              resourcePoolsPagesCpy[i].items.splice(foundIndex, 1);
              matchMutate([
                {
                  name: 'RESOURCE_POOL',
                  arguments: { resourcePoolName: resourcePoolsPagesCpy[i].items[foundIndex].metadata.name },
                  data: undefined,
                },
              ]);
            } else if (action === 'update') {
              resourcePoolsPagesCpy[i].items[foundIndex] = updatedItem;
              matchMutate([
                {
                  name: 'RESOURCE_POOL',
                  arguments: { resourcePoolName: resourcePoolsPagesCpy[i].items[foundIndex].metadata.name },
                  data: updatedItem,
                },
              ]);
            }
            mutate(resourcePoolsPagesCpy);
          }
        }
      }
    },
    [matchMutate, mutate, resourcePoolsPages]
  );

  const isReachingEnd = resourcePoolsPages && !resourcePoolsPages[resourcePoolsPages.length - 1].metadata.continue;
  const isLoadingInitialData = !resourcePoolsPages;
  const isLoadingMore =
    isLoadingInitialData || (size > 0 && resourcePoolsPages && typeof resourcePoolsPages[size - 1] === 'undefined');

  const filterFunction = useCallback(
    (resourcePool: ResourcePool): boolean => filterResourcePool(resourcePool, keywordFilter),
    [keywordFilter]
  );

  const resourcePools: ResourcePool[] = useMemo(
    () => [].concat(...resourcePoolsPages.map((page) => page.items)).filter(filterFunction) || [],
    [filterFunction, resourcePoolsPages]
  );

  // Trigger continue fetching more resource claims on scroll.
  const scrollHandler = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollable = e.currentTarget;
    const scrollRemaining = scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight;
    if (scrollRemaining < 500 && !isReachingEnd && !isLoadingMore) {
      setSize(size + 1);
    }
  };

  async function confirmThenDelete(): Promise<void> {
    if (confirm('Deleted selected ResourcePools?')) {
      const removedResourcePools: ResourcePool[] = [];
      for (const resourcePoolsPage of resourcePoolsPages) {
        for (const resourcePool of resourcePoolsPage.items) {
          if (selectedUids.includes(resourcePool.metadata.uid)) {
            await deleteResourcePool(resourcePool);
            removedResourcePools.push(resourcePool);
          }
        }
      }
      reduceSelectedUids({ type: 'clear' });
      revalidate({ action: 'delete', updatedItems: removedResourcePools });
    }
  }

  return (
    <div onScroll={scrollHandler} style={{ display: 'flex', flexDirection: 'column', overflow: 'auto', flexGrow: 1 }}>
      <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
        <Split hasGutter>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">
              ResourcePools
            </Title>
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
        <PageSection>
          <EmptyState variant="full">
            <EmptyStateIcon icon={ExclamationTriangleIcon} />
            <Title headingLevel="h1" size="lg">
              No ResourcePools found
            </Title>
          </EmptyState>
        </PageSection>
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
                    <ResourcePoolMinAvailableInput
                      resourcePoolName={resourcePool.metadata.name}
                      minAvailable={resourcePool.spec.minAvailable}
                      mutateFn={(resourcePoolUpdated) =>
                        revalidate({ updatedItems: [resourcePoolUpdated], action: 'update' })
                      }
                    />
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
                onSelect: (isSelected: string) =>
                  reduceSelectedUids({
                    type: isSelected ? 'add' : 'remove',
                    items: [resourcePool],
                  }),
                selected: selectedUids.includes(resourcePool.metadata.uid),
              };
            })}
          />
        </PageSection>
      )}
    </div>
  );
};

export default ResourcePools;
