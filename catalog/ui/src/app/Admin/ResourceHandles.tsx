import React from "react";
import { useEffect, useReducer, useState } from "react";
import { Link, useHistory, useLocation } from 'react-router-dom';
import {
  EmptyState,
  EmptyStateBody,
  EmptyStateIcon,
  PageSection,
  PageSectionVariants,
  Split,
  SplitItem,
  Title,
} from '@patternfly/react-core';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';
import { deleteResourceHandle, listResourceHandles } from '@app/api';
import { cancelFetchState, fetchStateReducer, k8sObjectsReducer, selectedUidsReducer } from '@app/reducers';
import { FetchState, ResourceHandle, ResourceHandleList } from '@app/types';
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

function keywordMatch(resourceHandle:ResourceHandle, keyword:string): boolean {
  if (resourceHandle.metadata.name.includes(keyword)) {
    return true;
  }
  if (resourceHandle.spec.resourcePool && resourceHandle.spec.resourcePool.name.includes(keyword)) {
    return true;
  }
  if (resourceHandle.spec.resourceClaim && (
    resourceHandle.spec.resourceClaim.name.includes(keyword) || resourceHandle.spec.resourceClaim.namespace.includes(keyword)
  )) {
    return true;
  }
  for (const resource of resourceHandle.spec.resources) {
    if (resource.provider.name.includes(keyword)) {
      return true;
    }
  }
  return false;
}

function filterResourceHandle(resourceHandle:ResourceHandle, keywordFilter:string[]): boolean {
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

function pruneResourceHandle(resourceHandle:ResourceHandle): ResourceHandle {
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
        })
      ]
    },
  };
}

const ResourceHandles: React.FunctionComponent = () => {
  const history = useHistory();
  const location = useLocation();
  const urlSearchParams = new URLSearchParams(location.search);
  const keywordFilter = urlSearchParams.has('search') ? urlSearchParams.get('search').trim().split(/ +/).filter(w => w != '') : null;

  const [fetchLimit, setFetchLimit] = useState(FETCH_BATCH_LIMIT * 2);
  const [fetchState, reduceFetchState] = useReducer(fetchStateReducer, {});
  const [firstRender, setFirstRender] = useState(true);
  const [resourceHandles, reduceResourceHandles] = useReducer(k8sObjectsReducer, []);
  const [selectedUids, reduceSelectedUids] = useReducer(selectedUidsReducer, []);

  const primaryAppContainer = document.getElementById('primary-app-container');
  primaryAppContainer.onscroll = (e) => {
    const scrollable = e.target as any;
    const scrollRemaining = scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight;
    if (scrollRemaining < 500 && fetchState?.continue && fetchLimit <= resourceHandles.length) {
      setFetchLimit((limit) => limit + FETCH_BATCH_LIMIT);
    }
  }

  async function confirmThenDelete(): Promise<void> {
    if (confirm("Deleted selected ResourceHandles?")) {
      const removedResourceHandles:ResourceHandle[] = [];
      for (const resourceHandle of resourceHandles) {
        if (selectedUids.includes(resourceHandle.metadata.uid)) {
          await deleteResourceHandle(resourceHandle);
          removedResourceHandles.push(resourceHandle);
        }
      }
      reduceSelectedUids({type: 'clear'});
      reduceResourceHandles({type: 'remove', items: removedResourceHandles});
    }
  }

  async function fetchResourceHandles(): Promise<void> {
    const resourceHandleList:ResourceHandleList = await listResourceHandles({
      continue: fetchState.continue,
      limit: FETCH_BATCH_LIMIT,
    });
    if (!fetchState.canceled) {
      const resourceHandles:ResourceHandle[] = resourceHandleList.items
        .filter((resourceHandle) => filterResourceHandle(resourceHandle, keywordFilter))
        .map(pruneResourceHandle);
      reduceResourceHandles({
        type: fetchState.isRefresh ? 'refresh' : 'append',
        items: resourceHandles,
        refreshComplete: fetchState.isRefresh && resourceHandleList.metadata.continue ? false : true,
        refreshedUids: fetchState.isRefresh ? fetchState.fetchedUids : null,
      });
      reduceFetchState({
        type: 'finish',
        continue: resourceHandleList.metadata.continue,
        items: resourceHandles,
      });
    }
  }

  function reloadResourceHandles(): void {
    reduceResourceHandles({type: 'clear'});
    reduceFetchState({type: 'start'});
    reduceSelectedUids({type: 'clear'});
  }

  // Fetch or continue fetching
  useEffect(() => {
    if (!fetchState.finished && resourceHandles.length < fetchLimit) {
      fetchResourceHandles();
      return () => cancelFetchState(fetchState);
    } else {
      return null;
    }
  }, [fetchState, fetchLimit]);

  // Reload on filter change
  useEffect(() => {
    if(!firstRender) {
      reloadResourceHandles();
    }
  }, [JSON.stringify(keywordFilter)]);

  // Track first render
  useEffect(() => {
    if(firstRender) {
      setFirstRender(false);
    }
  }, [firstRender]);

  return (<>
    <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
      <Split hasGutter>
        <SplitItem isFilled>
          <Title headingLevel="h4" size="xl">ResourceHandles</Title>
        </SplitItem>
        <SplitItem>
          <RefreshButton onClick={() => reloadResourceHandles()}/>
        </SplitItem>
        <SplitItem>
          <KeywordSearchInput
            initialValue={keywordFilter}
            onSearch={(value) => {
              if (value) {
                urlSearchParams.set('search', value.join(' '));
              } else if(urlSearchParams.has('search')) {
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
              <ActionDropdownItem
                key="delete"
                label="Delete Selected"
                onSelect={() => confirmThenDelete()}
              />,
            ]}
          />
        </SplitItem>
      </Split>
    </PageSection>
    { resourceHandles.length === 0 ? (
      fetchState.finished ? (
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
          columns={['Name', 'ResourcePool', 'Service Namespace', 'ResourceClaim', 'ResourceProvider(s)', 'Created At']}
          onSelectAll={(isSelected) => {
            if (isSelected) {
              reduceSelectedUids({type: 'set', items: resourceHandles});
            } else {
              reduceSelectedUids({type: 'clear'});
            }
          }}
          rows={resourceHandles.map((resourceHandle:ResourceHandle) => {
            return {
              cells: [
                <>
                  <Link
                    key="admin"
                    to={`/admin/resourcehandles/${resourceHandle.metadata.name}`}
                  >{resourceHandle.metadata.name}</Link>
                  <OpenshiftConsoleLink key="console" resource={resourceHandle}/>
                </>,
                resourceHandle.spec.resourcePool ? (
                  <>
                    <Link key="admin" to={`/admin/resourcepools/${resourceHandle.spec.resourcePool.name}`}>{resourceHandle.spec.resourcePool.name}</Link>
                    <OpenshiftConsoleLink key="console" reference={resourceHandle.spec.resourcePool}/>
                  </>
                ) : '-',
                resourceHandle.spec.resourceClaim ? (
                  <>
                    <Link key="admin" to={`/services/${resourceHandle.spec.resourceClaim.namespace}`}>{resourceHandle.spec.resourceClaim.namespace}</Link>
                    <OpenshiftConsoleLink key="console" reference={resourceHandle.spec.resourceClaim} linkToNamespace={true}/>
                  </>
                ) : '-',
                resourceHandle.spec.resourceClaim ? (
                  <>
                    <Link key="admin" to={`/services/${resourceHandle.spec.resourceClaim.namespace}/${resourceHandle.spec.resourceClaim.name}`}>{resourceHandle.spec.resourceClaim.name}</Link>
                    <OpenshiftConsoleLink key="console" reference={resourceHandle.spec.resourceClaim}/>
                  </>
                ) : '-',
                <>
                  { resourceHandle.spec.resources.map((resourceHandleSpecResource, idx) =>
                    <div key={idx}>
                      <Link key="admin" to={`/admin/resourceproviders/${resourceHandleSpecResource.provider.name}`}>{resourceHandleSpecResource.provider.name}</Link>
                      <OpenshiftConsoleLink key="console" reference={resourceHandleSpecResource.provider}/>
                    </div>
                  )}
                </>,
                <>
                  <LocalTimestamp key="timestamp" timestamp={resourceHandle.metadata.creationTimestamp}/>
                  {' '}
                  (<TimeInterval key="interval" toTimestamp={resourceHandle.metadata.creationTimestamp}/>)
                </>,
              ],
              onSelect: (isSelected) => reduceSelectedUids({
                type: isSelected ? 'add' : 'remove',
                items: [resourceHandle],
              }),
              selected: selectedUids.includes(resourceHandle.metadata.uid),
            };
          })}
        />
        { fetchState?.continue ? (
          <EmptyState variant="full">
            <EmptyStateIcon icon={LoadingIcon} />
          </EmptyState>
        ) : null }
      </PageSection>
    )}
  </>);
}

export default ResourceHandles;
