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
import { deleteResourcePool, listResourcePools } from '@app/api';
import { cancelFetchState, fetchStateReducer, k8sObjectsReducer, selectedUidsReducer } from '@app/reducers';
import { FetchState, ResourcePool, ResourcePoolList } from '@app/types';
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

function keywordMatch(resourcePool:ResourcePool, keyword:string): boolean {
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


function filterResourcePool(resourcePool:ResourcePool, keywordFilter:string[]): boolean {
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

function pruneResourcePool(resourcePool:ResourcePool): ResourcePool {
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
        })
      ]
    },
  };
}

const ResourcePools: React.FunctionComponent = () => {
  const history = useHistory();
  const location = useLocation();
  const urlSearchParams = new URLSearchParams(location.search);
  const keywordFilter = urlSearchParams.has('search') ? urlSearchParams.get('search').trim().split(/ +/).filter(w => w != '') : null;

  const [fetchLimit, setFetchLimit] = useState(FETCH_BATCH_LIMIT * 2);
  const [fetchState, reduceFetchState] = useReducer(fetchStateReducer, {});
  const [firstRender, setFirstRender] = useState(true);
  const [resourcePools, reduceResourcePools] = useReducer(k8sObjectsReducer, []);
  const [selectedUids, reduceSelectedUids] = useReducer(selectedUidsReducer, []);

  const primaryAppContainer = document.getElementById('primary-app-container');
  primaryAppContainer.onscroll = (e) => {
    const scrollable = e.target as any;
    const scrollRemaining = scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight;
    if (scrollRemaining < 500 && fetchState?.continue && fetchLimit <= resourcePools.length) {
      setFetchLimit((limit) => limit + FETCH_BATCH_LIMIT);
    }
  }

  async function confirmThenDelete(): Promise<void> {
    if (confirm("Deleted selected ResourcePools?")) {
      const removedResourcePools:ResourcePool[] = [];
      for (const resourcePool of resourcePools) {
        if (selectedUids.includes(resourcePool.metadata.uid)) {
          await deleteResourcePool(resourcePool);
          removedResourcePools.push(resourcePool);
        }
      }
      reduceSelectedUids({type: 'clear'});
      reduceResourcePools({type: 'remove', items: removedResourcePools});
    }
  }

  async function fetchResourcePools(): Promise<void> {
    const resourcePoolList:ResourcePoolList = await listResourcePools({
      continue: fetchState.continue,
      limit: FETCH_BATCH_LIMIT,
    });
    if (!fetchState.canceled) {
      const resourcePools:ResourcePool[] = resourcePoolList.items
        .filter((resourcePool) => filterResourcePool(resourcePool, keywordFilter))
        .map(pruneResourcePool);
      reduceResourcePools({
        type: fetchState.isRefresh ? 'refresh' : 'append',
        items: resourcePools,
        refreshComplete: fetchState.isRefresh && resourcePoolList.metadata.continue ? false : true,
        refreshedUids: fetchState.isRefresh ? fetchState.fetchedUids : null,
      });
      reduceFetchState({
        type: 'finish',
        continue: resourcePoolList.metadata.continue,
        items: resourcePools,
      });
    }
  }

  function reloadResourcePools() {
    reduceResourcePools({type: 'clear'});
    reduceFetchState({type: 'start'});
    reduceSelectedUids({type: 'clear'});
  }

  // Fetch or continue fetching
  useEffect(() => {
    if (!fetchState.finished && resourcePools.length < fetchLimit) {
      fetchResourcePools();
      return () => cancelFetchState(fetchState);
    } else {
      return null;
    }
  }, [fetchState, fetchLimit]);

  // Reload on filter change
  useEffect(() => {
    if(!firstRender) {
      reloadResourcePools();
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
          <Title headingLevel="h4" size="xl">ResourcePools</Title>
        </SplitItem>
        <SplitItem>
          <RefreshButton onClick={() => reloadResourcePools()}/>
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
    { resourcePools.length === 0 ? (
      fetchState.finished ? (
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
              reduceSelectedUids({type: 'set', items: resourcePools});
            } else {
              reduceSelectedUids({type: 'clear'});
            }
          }}
          rows={resourcePools.map((resourcePool:ResourcePool) => {
            return {
              cells: [
                <>
                  <Link
                    key="admin"
                    to={`/admin/resourcepools/${resourcePool.metadata.name}`}
                  >{resourcePool.metadata.name}</Link>
                  <OpenshiftConsoleLink key="console" resource={resourcePool}/>
                </>,
                <>
                  <ResourcePoolMinAvailableInput resourcePool={resourcePool}/>
                </>,
                <>
                  { resourcePool.spec.resources.map((resourcePoolSpecResource, idx) =>
                    <div key={idx}>
                      <Link key="admin" to={`/admin/resourceproviders/${resourcePoolSpecResource.provider.name}`}>{resourcePoolSpecResource.provider.name}</Link>
                      <OpenshiftConsoleLink key="console" reference={resourcePoolSpecResource.provider}/>
                    </div>
                  )}
                </>,
                <>
                  <LocalTimestamp key="timestamp" timestamp={resourcePool.metadata.creationTimestamp}/>
                  {' '}
                  (<TimeInterval key="interval" toTimestamp={resourcePool.metadata.creationTimestamp}/>)
                </>,
              ],
              onSelect: (isSelected) => reduceSelectedUids({
                type: isSelected ? 'add' : 'remove',
                items: [resourcePool],
              }),
              selected: selectedUids.includes(resourcePool.metadata.uid),
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

export default ResourcePools;
