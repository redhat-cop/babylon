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
import { deleteResourceProvider, listResourceProviders } from '@app/api';
import { cancelFetchState, fetchStateReducer, k8sObjectsReducer, selectedUidsReducer } from '@app/reducers';
import { FetchState, ResourceProvider, ResourceProviderList } from '@app/types';
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

function keywordMatch(resourceProvider:ResourceProvider, keyword:string): boolean {
  if (resourceProvider.metadata.name.includes(keyword)) {
    return true;
  }
  return false;
}

function filterResourceProvider(resourceProvider:ResourceProvider, keywordFilter:string[]): boolean {
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

function pruneResourceProvider(resourceProvider:ResourceProvider) {
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

const ResourceProviders: React.FunctionComponent = () => {
  const history = useHistory();
  const location = useLocation();
  const urlSearchParams = new URLSearchParams(location.search);
  const keywordFilter = urlSearchParams.has('search') ? urlSearchParams.get('search').trim().split(/ +/).filter(w => w != '') : null;

  const [fetchLimit, setFetchLimit] = useState(FETCH_BATCH_LIMIT * 2);
  const [fetchState, reduceFetchState] = useReducer(fetchStateReducer, {});
  const [firstRender, setFirstRender] = useState(true);
  const [resourceProviders, reduceResourceProviders] = useReducer(k8sObjectsReducer, []);
  const [selectedUids, reduceSelectedUids] = useReducer(selectedUidsReducer, []);

  const primaryAppContainer = document.getElementById('primary-app-container');
  primaryAppContainer.onscroll = (e) => {
    const scrollable = e.target as any;
    const scrollRemaining = scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight;
    if (scrollRemaining < 500 && fetchState?.continue && fetchLimit <= resourceProviders.length) {
      setFetchLimit((limit) => limit + FETCH_BATCH_LIMIT);
    }
  }

  async function confirmThenDelete() {
    if (confirm("Deleted selected ResourceProviders?")) {
      const removedResourceProviders:ResourceProvider[] = [];
      for (const resourceProvider of resourceProviders) {
        if (selectedUids.includes(resourceProvider.metadata.uid)) {
          await deleteResourceProvider(resourceProvider);
          removedResourceProviders.push(resourceProvider);
        }
      }
      reduceSelectedUids({type: 'clear'});
      reduceResourceProviders({type: 'remove', items: removedResourceProviders});
    }
  }

  async function fetchResourceProviders() {
    const resourceProviderList:ResourceProviderList = await listResourceProviders({
      continue: fetchState.continue,
      limit: FETCH_BATCH_LIMIT,
    });
    if (!fetchState.canceled) {
      const resourceProviders:ResourceProvider[] = resourceProviderList.items
        .filter((resourceProvider) => filterResourceProvider(resourceProvider, keywordFilter))
        .map(pruneResourceProvider);
      reduceResourceProviders({
        type: fetchState.isRefresh ? 'refresh' : 'append',
        items: resourceProviders,
        refreshComplete: fetchState.isRefresh && resourceProviderList.metadata.continue ? false : true,
        refreshedUids: fetchState.isRefresh ? fetchState.fetchedUids : null,
      });
      reduceFetchState({
        type: 'finish',
        continue: resourceProviderList.metadata.continue,
        items: resourceProviders,
      });
    }
  }

  function reloadResourceProviders(): void {
    reduceResourceProviders({type: 'clear'});
    reduceFetchState({type: 'start'});
    reduceSelectedUids({type: 'clear'});
  }

  // Fetch or continue fetching
  useEffect(() => {
    if (!fetchState.finished && resourceProviders.length < fetchLimit) {
      fetchResourceProviders();
      return () => cancelFetchState(fetchState);
    } else {
      return null;
    }
  }, [fetchState, fetchLimit]);

  // Reload on filter change
  useEffect(() => {
    if(!firstRender) {
      reloadResourceProviders();
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
          <Title headingLevel="h4" size="xl">ResourceProviders</Title>
        </SplitItem>
        <SplitItem>
          <RefreshButton onClick={() => reloadResourceProviders()}/>
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
    { resourceProviders.length === 0 ? (
      fetchState.finished ? (
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
              reduceSelectedUids({type: 'set', items: resourceProviders});
            } else {
              reduceSelectedUids({type: 'clear'});
            }
          }}
          rows={resourceProviders.map((resourceProvider:ResourceProvider) => {
            return {
              cells: [
                <>
                  <Link
                    key="admin"
                    to={`/admin/resourceproviders/${resourceProvider.metadata.name}`}
                  >{resourceProvider.metadata.name}</Link>
                  <OpenshiftConsoleLink key="console" resource={resourceProvider}/>
                </>,
                <>
                  <LocalTimestamp key="timestamp" timestamp={resourceProvider.metadata.creationTimestamp}/>
                  {' '}
                  (<TimeInterval key="interval" toTimestamp={resourceProvider.metadata.creationTimestamp}/>)
                </>,
              ],
              onSelect: (isSelected) => reduceSelectedUids({
                type: isSelected ? 'add' : 'remove',
                items: [resourceProvider],
              }),
              selected: selectedUids.includes(resourceProvider.metadata.uid),
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

export default ResourceProviders;
