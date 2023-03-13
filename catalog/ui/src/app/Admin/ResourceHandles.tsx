import React, { useCallback, useMemo, useReducer } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import useSWRInfinite from 'swr/infinite';
import {
  EmptyState,
  EmptyStateIcon,
  PageSection,
  PageSectionVariants,
  Split,
  SplitItem,
  Title,
} from '@patternfly/react-core';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import { apiPaths, deleteResourceHandle, fetcher } from '@app/api';
import { selectedUidsReducer } from '@app/reducers';
import { ResourceHandle, ResourceHandleList } from '@app/types';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import KeywordSearchInput from '@app/components/KeywordSearchInput';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';
import Footer from '@app/components/Footer';
import { compareK8sObjectsArr } from '@app/util';

import './admin.css';

const FETCH_BATCH_LIMIT = 50;

function keywordMatch(resourceHandle: ResourceHandle, keyword: string): boolean {
  if (resourceHandle.metadata.name.includes(keyword)) {
    return true;
  }
  if (resourceHandle.spec.resourcePool && resourceHandle.spec.resourcePool.name.includes(keyword)) {
    return true;
  }
  if (
    resourceHandle.spec.resourceClaim &&
    (resourceHandle.spec.resourceClaim.name.includes(keyword) ||
      resourceHandle.spec.resourceClaim.namespace.includes(keyword))
  ) {
    return true;
  }
  for (const resource of resourceHandle.spec.resources) {
    if (resource.provider.name.includes(keyword)) {
      return true;
    }
  }
  return false;
}

const ResourceHandles: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const keywordFilter = useMemo(
    () =>
      searchParams.has('search')
        ? searchParams
            .get('search')
            .trim()
            .split(/ +/)
            .filter((w) => w != '')
        : null,
    [searchParams.get('search')]
  );
  const [selectedUids, reduceSelectedUids] = useReducer(selectedUidsReducer, []);

  const {
    data: resourceHandlesPages,
    mutate,
    size,
    setSize,
  } = useSWRInfinite<ResourceHandleList>(
    (index, previousPageData: ResourceHandleList) => {
      if (previousPageData && !previousPageData.metadata?.continue) {
        return null;
      }
      const continueId = index === 0 ? '' : previousPageData.metadata?.continue;
      return apiPaths.RESOURCE_HANDLES({
        limit: FETCH_BATCH_LIMIT,
        continueId,
      });
    },
    fetcher,
    {
      refreshInterval: 8000,
      revalidateFirstPage: true,
      revalidateAll: true,
      compare: (currentData, newData) => {
        if (currentData === newData) return true;
        if (!currentData || currentData.length === 0) return false;
        if (!newData || newData.length === 0) return false;
        if (currentData.length !== newData.length) return false;
        for (let i = 0; i < currentData.length; i++) {
          if (!compareK8sObjectsArr(currentData[i].items, newData[i].items)) return false;
        }
        return true;
      },
    }
  );

  const revalidate = useCallback(
    ({ updatedItems, action }: { updatedItems: ResourceHandle[]; action: 'update' | 'delete' }) => {
      const resourceHandlesPagesCpy = JSON.parse(JSON.stringify(resourceHandlesPages));
      let p: ResourceHandleList;
      let i: number;
      for ([i, p] of resourceHandlesPagesCpy.entries()) {
        for (const updatedItem of updatedItems) {
          const foundIndex = p.items.findIndex((r) => r.metadata.uid === updatedItem.metadata.uid);
          if (foundIndex > -1) {
            if (action === 'update') {
              resourceHandlesPagesCpy[i].items[foundIndex] = updatedItem;
            } else if (action === 'delete') {
              resourceHandlesPagesCpy[i].items.splice(foundIndex, 1);
            }
            mutate(resourceHandlesPagesCpy);
          }
        }
      }
    },
    [mutate, resourceHandlesPages]
  );

  const isReachingEnd =
    resourceHandlesPages && !resourceHandlesPages[resourceHandlesPages.length - 1].metadata.continue;
  const isLoadingInitialData = !resourceHandlesPages;
  const isLoadingMore =
    isLoadingInitialData || (size > 0 && resourceHandlesPages && typeof resourceHandlesPages[size - 1] === 'undefined');

  const filterResourceHandle = useCallback(
    (resourceHandle: ResourceHandle) => {
      if (!keywordFilter) {
        return true;
      }
      for (const keyword of keywordFilter) {
        if (!keywordMatch(resourceHandle, keyword)) {
          return false;
        }
      }
      return true;
    },
    [keywordFilter]
  );

  const resourceHandles: ResourceHandle[] = useMemo(
    () => [].concat(...resourceHandlesPages.map((page) => page.items)).filter(filterResourceHandle) || [],
    [filterResourceHandle, resourceHandlesPages]
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
    if (confirm('Deleted selected ResourceHandles?')) {
      const removedResourceHandles: ResourceHandle[] = [];
      for (const resourceHandle of resourceHandles) {
        if (selectedUids.includes(resourceHandle.metadata.uid)) {
          await deleteResourceHandle(resourceHandle);
          removedResourceHandles.push(resourceHandle);
        }
      }
      reduceSelectedUids({ type: 'clear' });
      revalidate({ action: 'delete', updatedItems: removedResourceHandles });
    }
  }

  // Fetch all if keywordFilter is defined.
  if (
    keywordFilter &&
    resourceHandlesPages.length > 0 &&
    resourceHandlesPages[resourceHandlesPages.length - 1].metadata.continue
  ) {
    if (!isLoadingMore) {
      if (resourceHandles.length > 0) {
        setTimeout(() => {
          setSize(size + 1);
        }, 5000);
      } else {
        setSize(size + 1);
      }
    }
  }

  return (
    <>
      <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
        <Split hasGutter>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">
              ResourceHandles
            </Title>
          </SplitItem>
          <SplitItem>
            <KeywordSearchInput
              initialValue={keywordFilter}
              onSearch={(value) => {
                if (value) {
                  searchParams.set('search', value.join(' '));
                } else if (searchParams.has('search')) {
                  searchParams.delete('search');
                }
                setSearchParams(searchParams);
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
      {resourceHandles.length === 0 ? (
        <PageSection>
          <EmptyState variant="full">
            <EmptyStateIcon icon={ExclamationTriangleIcon} />
            <Title headingLevel="h1" size="lg">
              No ResourceHandles found
            </Title>
          </EmptyState>
        </PageSection>
      ) : (
        <PageSection key="body" variant={PageSectionVariants.light} className="admin-body">
          <SelectableTable
            columns={[
              'Name',
              'ResourcePool',
              'Service Namespace',
              'ResourceClaim',
              'ResourceProvider(s)',
              'Created At',
            ]}
            onSelectAll={(isSelected: boolean) => {
              if (isSelected) {
                reduceSelectedUids({ type: 'set', items: resourceHandles });
              } else {
                reduceSelectedUids({ type: 'clear' });
              }
            }}
            rows={resourceHandles.map((resourceHandle) => {
              return {
                cells: [
                  <>
                    <Link key="admin" to={`/admin/resourcehandles/${resourceHandle.metadata.name}`}>
                      {resourceHandle.metadata.name}
                    </Link>
                    <OpenshiftConsoleLink key="console" resource={resourceHandle} />
                  </>,
                  resourceHandle.spec.resourcePool ? (
                    <>
                      <Link key="admin" to={`/admin/resourcepools/${resourceHandle.spec.resourcePool.name}`}>
                        {resourceHandle.spec.resourcePool.name}
                      </Link>
                      <OpenshiftConsoleLink key="console" reference={resourceHandle.spec.resourcePool} />
                    </>
                  ) : (
                    <p>-</p>
                  ),
                  resourceHandle.spec.resourceClaim ? (
                    <>
                      <Link key="admin" to={`/services/${resourceHandle.spec.resourceClaim.namespace}`}>
                        {resourceHandle.spec.resourceClaim.namespace}
                      </Link>
                      <OpenshiftConsoleLink
                        key="console"
                        reference={resourceHandle.spec.resourceClaim}
                        linkToNamespace={true}
                      />
                    </>
                  ) : (
                    <p>-</p>
                  ),
                  resourceHandle.spec.resourceClaim ? (
                    <>
                      <Link
                        key="admin"
                        to={`/services/${resourceHandle.spec.resourceClaim.namespace}/${resourceHandle.spec.resourceClaim.name}`}
                      >
                        {resourceHandle.spec.resourceClaim.name}
                      </Link>
                      <OpenshiftConsoleLink key="console" reference={resourceHandle.spec.resourceClaim} />
                    </>
                  ) : (
                    <p>-</p>
                  ),
                  <>
                    {resourceHandle.spec.resources.map((resourceHandleSpecResource, idx) => (
                      <div key={idx}>
                        <Link key="admin" to={`/admin/resourceproviders/${resourceHandleSpecResource.provider.name}`}>
                          {resourceHandleSpecResource.provider.name}
                        </Link>
                        <OpenshiftConsoleLink key="console" reference={resourceHandleSpecResource.provider} />
                      </div>
                    ))}
                  </>,
                  <>
                    <LocalTimestamp key="timestamp" timestamp={resourceHandle.metadata.creationTimestamp} />
                    <span key="interval" style={{ padding: '0 6px' }}>
                      (<TimeInterval key="time-interval" toTimestamp={resourceHandle.metadata.creationTimestamp} />)
                    </span>
                  </>,
                ],
                onSelect: (isSelected: boolean) =>
                  reduceSelectedUids({
                    type: isSelected ? 'add' : 'remove',
                    items: [resourceHandle],
                  }),
                selected: selectedUids.includes(resourceHandle.metadata.uid),
              };
            })}
          />
          {!isReachingEnd ? (
            <EmptyState variant="full">
              <EmptyStateIcon icon={LoadingIcon} />
            </EmptyState>
          ) : null}
        </PageSection>
      )}
      <Footer />
    </>
  );
};

export default ResourceHandles;
