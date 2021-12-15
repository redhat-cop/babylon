import React from "react";
import { useEffect, useState } from "react";
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
import { ResourceHandle } from '@app/types';
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

function pruneResourceHandle(resourceHandle:ResourceHandle) {
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

export interface FetchState {
  aborted?: boolean;
  continue?: string;
  iteration?: number;
  finished?: boolean;
}

const ResourceHandles: React.FunctionComponent = () => {
  const history = useHistory();
  const location = useLocation();
  const urlSearchParams = new URLSearchParams(location.search);
  const keywordFilter = urlSearchParams.has('search') ? urlSearchParams.get('search').trim().split(/ +/).filter(w => w != '') : null;

  const [firstRender, setFirstRender] = useState(true);
  const [resourceHandles, setResourceHandles] = useState<ResourceHandle[]>([]);
  const [selectedUids, setSelectedUids] = React.useState([]);
  const [fetchState, setFetchState] = useState<FetchState>({iteration: 0});
  const [fetchLimit, setFetchLimit] = useState(FETCH_BATCH_LIMIT * 2);

  const primaryAppContainer = document.getElementById('primary-app-container');
  primaryAppContainer.onscroll = (e) => {
    const scrollable = e.target as any;
    const scrollRemaining = scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight;
    if (scrollRemaining < 500 && fetchState?.continue && fetchLimit <= resourceHandles.length) {
      setFetchLimit((limit) => limit + FETCH_BATCH_LIMIT);
    }
  }

  async function confirmThenDelete() {
    if (confirm("Deleted selected ResourceHandles?")) {
      for (const resourceHandle of resourceHandles) {
        if (selectedUids.includes(resourceHandle.metadata.uid)) {
          await deleteResourceHandle(resourceHandle);
        }
      }
      reloadResourceHandles();
    }
  }

  async function fetchResourceHandles() {
    const resourceHandleList = await listResourceHandles({
      continue: fetchState.continue,
      limit: FETCH_BATCH_LIMIT,
    });
    if (fetchState.aborted) { 
      return
    }
    const resourceHandles = (resourceHandleList.items || [])
      .filter((resourceHandle) => filterResourceHandle(resourceHandle, keywordFilter))
      .map(pruneResourceHandle);
    setResourceHandles((current:ResourceHandle[]) => [...(current || []), ...resourceHandles]);
    setFetchState((current) => {
      if (current.iteration != fetchState.iteration) {
        console.warn("fetchState changed unexpectedly after fetch!");
        return current;
      }
      return {
        continue: resourceHandleList.metadata.continue,
        iteration: current.iteration + 1,
        finished: !resourceHandleList.metadata.continue,
      };
    });
  }

  function reloadResourceHandles() {
    setResourceHandles([]);
    if(fetchState) {
      fetchState.aborted = true;
    }
    setFetchState((current) => {
      if (current.iteration != fetchState.iteration) {
        console.warn("fetchState changed unexpectedly for reload!");
        return current;
      }
      return {
        iteration: current.iteration + 1,
      };
    });
    setSelectedUids([]);
  }

  // Fetch or continue fetching
  useEffect(() => {
    if (!fetchState.finished && resourceHandles.length < fetchLimit) {
      fetchResourceHandles();
      return () => {
        fetchState.aborted = true;
      }
    } else {
      return null;
    }
  }, [fetchState?.iteration, fetchLimit]);

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
              setSelectedUids(resourceHandles.map(resourceHandle => resourceHandle.metadata.uid));
            } else {
              setSelectedUids([]);
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
              onSelect: (isSelected) => setSelectedUids(uids => {
                if (isSelected) {
                  if (uids.includes(resourceHandle.metadata.uid)) {
                    return uids;
                  } else {
                    return [...uids, resourceHandle.metadata.uid];
                  }
                } else {
                  return uids.filter(uid => uid !== resourceHandle.metadata.uid);
                }
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
