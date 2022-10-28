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
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import { apiPaths, deleteResourceProvider, fetcher } from '@app/api';
import useSWRInfinite from 'swr/infinite';
import { selectedUidsReducer } from '@app/reducers';
import { ResourceProvider, ResourceProviderList } from '@app/types';
import Footer from '@app/components/Footer';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import KeywordSearchInput from '@app/components/KeywordSearchInput';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';
import { compareK8sObjects, FETCH_BATCH_LIMIT } from '@app/util';
import useMatchMutate from '@app/utils/useMatchMutate';

import './admin.css';

function keywordMatch(resourceProvider: ResourceProvider, keyword: string): boolean {
  if (resourceProvider.metadata.name.includes(keyword)) {
    return true;
  }
  return false;
}

const ResourceProviders: React.FC = () => {
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

  const {
    data: resourceProvidersPages,
    mutate,
    size,
    setSize,
  } = useSWRInfinite<ResourceProviderList>(
    (index, previousPageData: ResourceProviderList) => {
      if (previousPageData && !previousPageData.metadata?.continue) {
        return null;
      }
      const continueId = index === 0 ? '' : previousPageData.metadata?.continue;
      return apiPaths.RESOURCE_PROVIDERS({ limit: FETCH_BATCH_LIMIT, continueId });
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
    ({ updatedItems, action }: { updatedItems: ResourceProvider[]; action: 'update' | 'delete' }) => {
      const resourceProvidersPagesCpy = JSON.parse(JSON.stringify(resourceProvidersPages));
      let p: ResourceProviderList;
      let i: number;
      for ([i, p] of resourceProvidersPagesCpy.entries()) {
        for (const updatedItem of updatedItems) {
          const foundIndex = p.items.findIndex((r) => r.metadata.uid === updatedItem.metadata.uid);
          if (foundIndex > -1) {
            if (action === 'update') {
              matchMutate([
                {
                  name: 'RESOURCE_POOL',
                  arguments: { resourceProviderName: resourceProvidersPagesCpy[i].items[foundIndex].metadata.name },
                  data: updatedItem,
                },
              ]);
              resourceProvidersPagesCpy[i].items[foundIndex] = updatedItem;
            } else if (action === 'delete') {
              matchMutate([
                {
                  name: 'RESOURCE_PROVIDER',
                  arguments: { resourceProviderName: resourceProvidersPagesCpy[i].items[foundIndex].metadata.name },
                  data: undefined,
                },
              ]);
              resourceProvidersPagesCpy[i].items.splice(foundIndex, 1);
            }
            mutate(resourceProvidersPagesCpy);
          }
        }
      }
    },
    [matchMutate, mutate, resourceProvidersPages]
  );

  const [selectedUids, reduceSelectedUids] = useReducer(selectedUidsReducer, []);
  const isReachingEnd =
    resourceProvidersPages && !resourceProvidersPages[resourceProvidersPages.length - 1].metadata.continue;
  const isLoadingInitialData = !resourceProvidersPages;
  const isLoadingMore =
    isLoadingInitialData ||
    (size > 0 && resourceProvidersPages && typeof resourceProvidersPages[size - 1] === 'undefined');

  const filterFunction = useCallback(
    (resourceProvider: ResourceProvider) => {
      if (!keywordFilter) {
        return true;
      }
      for (const keyword of keywordFilter) {
        if (!keywordMatch(resourceProvider, keyword)) {
          return false;
        }
      }
      return true;
    },
    [keywordFilter]
  );

  const resourceProviders: ResourceProvider[] = useMemo(
    () => [].concat(...resourceProvidersPages.map((page) => page.items)).filter(filterFunction) || [],
    [filterFunction, resourceProvidersPages]
  );

  // Trigger continue fetching more resource claims on scroll.
  const scrollHandler = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollable = e.currentTarget;
    const scrollRemaining = scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight;
    if (scrollRemaining < 500 && !isReachingEnd && !isLoadingMore) {
      setSize(size + 1);
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
      revalidate({ updatedItems: removedResourceProviders, action: 'delete' });
    }
  }

  // Fetch all if keywordFilter is defined.
  if (
    keywordFilter &&
    resourceProvidersPages.length > 0 &&
    resourceProvidersPages[resourceProvidersPages.length - 1].metadata.continue
  ) {
    if (!isLoadingMore) {
      if (resourceProviders.length > 0) {
        setTimeout(() => {
          setSize(size + 1);
        }, 5000);
      } else {
        setSize(size + 1);
      }
    }
  }

  return (
    <div onScroll={scrollHandler} style={{ display: 'flex', flexDirection: 'column', overflow: 'auto', flexGrow: 1 }}>
      <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
        <Split hasGutter>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">
              ResourceProviders
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
      {resourceProviders.length === 0 ? (
        <PageSection>
          <EmptyState variant="full">
            <EmptyStateIcon icon={ExclamationTriangleIcon} />
            <Title headingLevel="h1" size="lg">
              No ResourceProviders found
            </Title>
          </EmptyState>
        </PageSection>
      ) : (
        <PageSection key="body" variant={PageSectionVariants.light} className="admin-body">
          <SelectableTable
            columns={['Name', 'Created At']}
            onSelectAll={(isSelected: boolean) => {
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
                onSelect: (isSelected: boolean) =>
                  reduceSelectedUids({
                    type: isSelected ? 'add' : 'remove',
                    items: [resourceProvider],
                  }),
                selected: selectedUids.includes(resourceProvider.metadata.uid),
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
    </div>
  );
};

export default ResourceProviders;
