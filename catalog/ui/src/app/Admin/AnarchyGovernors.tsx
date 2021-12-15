import React from "react";
import { useEffect, useReducer, useState } from "react";
import { Link, useHistory, useLocation, useRouteMatch } from 'react-router-dom';
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
import { deleteAnarchyGovernor, listAnarchyGovernors } from '@app/api';
import { cancelFetchState, fetchStateReducer, k8sObjectsReducer, selectedUidsReducer } from '@app/reducers';
import { AnarchyGovernor, AnarchyGovernorList, FetchState } from '@app/types';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import KeywordSearchInput from '@app/components/KeywordSearchInput';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import RefreshButton from '@app/components/RefreshButton';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';
import AnarchyNamespaceSelect from './AnarchyNamespaceSelect';

import './admin.css';

const FETCH_BATCH_LIMIT = 50;

function keywordMatch(anarchyGovernor:AnarchyGovernor, keyword:string): boolean {
  if (anarchyGovernor.metadata.name.includes(keyword)) {
    return true;
  }
  return false;
}

function filterAnarchyGovernor(anarchyGovernor:AnarchyGovernor, keywordFilter:string[]): boolean {
  if (!keywordFilter) {
    return true;
  }
  for (const keyword of keywordFilter) {
    if (!keywordMatch(anarchyGovernor, keyword)) {
      return false;
    }
  }
  return true;
}

function pruneAnarchyGovernor(anarchyGovernor:AnarchyGovernor) {
  return {
    apiVersion: anarchyGovernor.apiVersion,
    kind: anarchyGovernor.kind,
    metadata: {
      creationTimestamp: anarchyGovernor.metadata.creationTimestamp,
      name: anarchyGovernor.metadata.name,
      namespace: anarchyGovernor.metadata.namespace,
      uid: anarchyGovernor.metadata.uid,
    },
    spec: {}
  };
}

const AnarchyGovernors: React.FunctionComponent = () => {
  const history = useHistory();
  const location = useLocation();
  const routeMatch = useRouteMatch<any>('/admin/anarchygovernors/:namespace?');
  const anarchyNamespace = routeMatch.params.namespace;
  const urlSearchParams = new URLSearchParams(location.search);
  const keywordFilter = urlSearchParams.has('search') ? urlSearchParams.get('search').trim().split(/ +/).filter(w => w != '') : null;

  const [anarchyGovernors, reduceAnarchyGovernors] = useReducer(k8sObjectsReducer, []);
  const [selectedUids, reduceSelectedUids] = useReducer(selectedUidsReducer, []);
  const [fetchState, reduceFetchState] = useReducer(fetchStateReducer, {});
  const [fetchLimit, setFetchLimit] = useState<number>(FETCH_BATCH_LIMIT * 2);
  const [firstRender, setFirstRender] = useState<boolean>(true);

  const primaryAppContainer = document.getElementById('primary-app-container');
  primaryAppContainer.onscroll = (e) => {
    const scrollable = e.target as any;
    const scrollRemaining = scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight;
    if (scrollRemaining < 500 && fetchState.continue && fetchLimit <= anarchyGovernors.length) {
      setFetchLimit((limit) => limit + FETCH_BATCH_LIMIT);
    }
  }

  async function confirmThenDelete(): Promise<void> {
    if (confirm("Deleted selected AnarchyGovernors?")) {
      const removedAnarchyGovernors:AnarchyGovernor[] = [];
      for (const anarchyGovernor of anarchyGovernors) {
        if (selectedUids.includes(anarchyGovernor.metadata.uid)) {
          await deleteAnarchyGovernor(anarchyGovernor);
          removedAnarchyGovernors.push(anarchyGovernor);
        }
      }
      reduceSelectedUids({type: 'clear'});
      reduceAnarchyGovernors({type: 'remove', items: removedAnarchyGovernors});
    }
  }

  async function fetchAnarchyGovernors(): Promise<void> {
    const anarchyGovernorList:AnarchyGovernorList = await listAnarchyGovernors({
      continue: fetchState.continue,
      limit: FETCH_BATCH_LIMIT,
      namespace: anarchyNamespace,
    });
    if (!fetchState.canceled) {
      const anarchyGovernors:AnarchyGovernor[] = anarchyGovernorList.items
        .filter((anarchyGovernor) => filterAnarchyGovernor(anarchyGovernor, keywordFilter))
        .map(pruneAnarchyGovernor);
      reduceAnarchyGovernors({
        type: fetchState.isRefresh ? 'refresh' : 'append',
        items: anarchyGovernors,
        refreshComplete: fetchState.isRefresh && anarchyGovernorList.metadata.continue ? false : true,
        refreshedUids: fetchState.isRefresh ? fetchState.fetchedUids : null,
      });
      reduceFetchState({
        type: 'finish',
        continue: anarchyGovernorList.metadata.continue,
        items: anarchyGovernors,
      });
    }
  }

  function reloadAnarchyGovernors(): void {
    reduceAnarchyGovernors({type: 'clear'});
    reduceFetchState({type: 'start'});
    reduceSelectedUids({type: 'clear'});
  }

  // Fetch or continue fetching
  useEffect(() => {
    if (!fetchState.finished && anarchyGovernors.length < fetchLimit) {
      fetchAnarchyGovernors();
      return () => cancelFetchState(fetchState);
    } else {
      return null;
    }
  }, [fetchState, fetchLimit]);

  // Reload on filter change
  useEffect(() => {
    if(!firstRender) {
      reloadAnarchyGovernors();
    }
  }, [anarchyNamespace, JSON.stringify(keywordFilter)]);

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
          <Title headingLevel="h4" size="xl">AnarchyGovernors</Title>
        </SplitItem>
        <SplitItem>
          <RefreshButton onClick={() => reloadAnarchyGovernors()}/>
        </SplitItem>
        <SplitItem>
          <KeywordSearchInput
            initialValue={keywordFilter}
            onSearch={(value) => {
              if (value) {
                urlSearchParams.set('search', value.join(' '));
              } else if(urlSearchParams.has('search')) {
                urlSearchParams.delete('searchs');
              }
              history.push(`${location.pathname}?${urlSearchParams.toString()}`);
            }}
          />
        </SplitItem>
        <SplitItem>
          <AnarchyNamespaceSelect
            namespace={anarchyNamespace}
            onSelect={(namespaceName) => {
              if (namespaceName) {
                history.push(`/admin/anarchygovernors/${namespaceName}${location.search}`);
              } else {
                history.push(`/admin/anarchygovernors${location.search}`);
              }
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
    { anarchyGovernors.length === 0 ? (
      fetchState.finished ? (
        <PageSection>
          <EmptyState variant="full">
            <EmptyStateIcon icon={ExclamationTriangleIcon} />
            <Title headingLevel="h1" size="lg">
              No AnarchyGovernors found
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
          columns={['Namespace', 'Name', 'Created At']}
          onSelectAll={(isSelected) => {
            if (isSelected) {
              reduceSelectedUids({type: 'set', items: anarchyGovernors});
            } else {
              reduceSelectedUids({type: 'clear'});
            }
          }}
          rows={anarchyGovernors.map((anarchyGovernor:AnarchyGovernor) => {
            return {
              cells: [
                <>
                  {anarchyGovernor.metadata.namespace}
                  <OpenshiftConsoleLink key="console" resource={anarchyGovernor} linkToNamespace={true}/>
                </>,
                <>
                  <Link key="admin" to={`/admin/anarchygovernors/${anarchyGovernor.metadata.namespace}/${anarchyGovernor.metadata.name}`}>{anarchyGovernor.metadata.name}</Link>
                  <OpenshiftConsoleLink key="console" resource={anarchyGovernor}/>
                </>,
                <>
                  <LocalTimestamp key="timestamp" timestamp={anarchyGovernor.metadata.creationTimestamp}/>
                  {' '}
                  (<TimeInterval key="interval" toTimestamp={anarchyGovernor.metadata.creationTimestamp}/>)
                </>,
              ],
              onSelect: (isSelected) => reduceSelectedUids({
                type: isSelected ? 'add' : 'remove',
                items: [anarchyGovernor],
              }),
              selected: selectedUids.includes(anarchyGovernor.metadata.uid),
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

export default AnarchyGovernors;
