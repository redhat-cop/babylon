import React, { useEffect, useReducer, useRef } from 'react';
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
import { ExclamationTriangleIcon } from '@patternfly/react-icons';
import { deleteResourceHandle, listResourceHandles } from '@app/api';
import { cancelFetchActivity, k8sFetchStateReducer } from '@app/K8sFetchState';
import { selectedUidsReducer } from '@app/reducers';
import { K8sObject, ResourceHandle, ResourceHandleList } from '@app/types';
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

function filterResourceHandle(resourceHandle: ResourceHandle, keywordFilter: string[]): boolean {
  if (!keywordFilter) {
    return true;
  }
  for (const keyword of keywordFilter) {
    if (!keywordMatch(resourceHandle, keyword)) {
      return false;
    }
  }
  return true;
}

function pruneResourceHandle(resourceHandle: ResourceHandle): ResourceHandle {
  return {
    apiVersion: resourceHandle.apiVersion,
    kind: resourceHandle.kind,
    metadata: {
      creationTimestamp: resourceHandle.metadata.creationTimestamp,
      name: resourceHandle.metadata.name,
      namespace: resourceHandle.metadata.namespace,
      uid: resourceHandle.metadata.uid,
    },
    spec: {
      lifespan: resourceHandle.spec.lifespan,
      resourceClaim: resourceHandle.spec.resourceClaim,
      resourcePool: resourceHandle.spec.resourcePool,
      resources: [
        ...resourceHandle.spec.resources.map((resource) => {
          return {
            name: resource.name,
            provider: resource.provider,
            reference: resource.reference,
          };
        }),
      ],
    },
  };
}

const ResourceHandles: React.FC = () => {
  const navigate = useNavigate();
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

  const resourceHandles: ResourceHandle[] = (fetchState?.filteredItems as ResourceHandle[]) || [];

  const filterFunction = keywordFilter
    ? (resourceHandle: K8sObject): boolean => filterResourceHandle(resourceHandle as ResourceHandle, keywordFilter)
    : null;

  const primaryAppContainer = document.getElementById('primary-app-container');
  primaryAppContainer.onscroll = (e) => {
    const scrollable = e.target as any;
    const scrollRemaining = scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight;
    if (scrollRemaining < 500 && !fetchState?.finished && fetchState.limit <= resourceHandles.length) {
      reduceFetchState({
        type: 'modify',
        limit: fetchState.limit + FETCH_BATCH_LIMIT,
      });
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
      reduceFetchState({ type: 'removeItems', items: removedResourceHandles });
    }
  }

  async function fetchResourceHandles(): Promise<void> {
    const resourceHandleList: ResourceHandleList = await listResourceHandles({
      continue: fetchState.continue,
      limit: FETCH_BATCH_LIMIT,
    });
    if (!fetchState.activity.canceled) {
      reduceFetchState({
        type: 'post',
        k8sObjectList: resourceHandleList,
        refreshInterval: 15000,
        refresh: (): void => {
          reduceFetchState({ type: 'startRefresh' });
        },
      });
    }
  }

  function reloadResourceHandles(): void {
    reduceFetchState({
      type: 'startFetch',
      filter: filterFunction,
      limit: FETCH_BATCH_LIMIT,
      prune: pruneResourceHandle,
    });
    reduceSelectedUids({ type: 'clear' });
  }

  // First render and detect unmount
  useEffect(() => {
    reloadResourceHandles();
    return () => {
      componentWillUnmount.current = true;
    };
  }, []);

  // Fetch or continue fetching
  useEffect(() => {
    if (fetchState?.canContinue && (fetchState.refreshing || fetchState.filteredItems.length < fetchState.limit)) {
      fetchResourceHandles();
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
              ResourceHandles
            </Title>
          </SplitItem>
          <SplitItem>
            <RefreshButton onClick={() => reloadResourceHandles()} />
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
      {resourceHandles.length === 0 ? (
        fetchState?.finished ? (
          <PageSection>
            <EmptyState variant="full">
              <EmptyStateIcon icon={ExclamationTriangleIcon} />
              <Title headingLevel="h1" size="lg">
                No ResourceHandles found
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
            columns={[
              'Name',
              'ResourcePool',
              'Service Namespace',
              'ResourceClaim',
              'ResourceProvider(s)',
              'Created At',
            ]}
            onSelectAll={(isSelected) => {
              if (isSelected) {
                reduceSelectedUids({ type: 'set', items: resourceHandles });
              } else {
                reduceSelectedUids({ type: 'clear' });
              }
            }}
            rows={resourceHandles.map((resourceHandle: ResourceHandle) => {
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
                onSelect: (isSelected) =>
                  reduceSelectedUids({
                    type: isSelected ? 'add' : 'remove',
                    items: [resourceHandle],
                  }),
                selected: selectedUids.includes(resourceHandle.metadata.uid),
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

export default ResourceHandles;
