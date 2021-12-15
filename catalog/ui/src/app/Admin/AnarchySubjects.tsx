import React from "react";
import { useEffect, useState } from "react";
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
import { deleteAnarchySubject, listAnarchySubjects } from '@app/api';
import { AnarchySubject } from '@app/types';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import KeywordSearchInput from '@app/components/KeywordSearchInput';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';
import RefreshButton from '@app/components/RefreshButton';
import AnarchyNamespaceSelect from './AnarchyNamespaceSelect';
import AnarchySubjectStateSelect from './AnarchySubjectStateSelect';

import './admin.css';

const FETCH_BATCH_LIMIT = 50;

function keywordMatch(anarchySubject:AnarchySubject, keyword:string): boolean {
  if (anarchySubject.metadata.name.includes(keyword)) {
    return true;
  }
  if (anarchySubject.spec.governor.name.includes(keyword)) {
    return true;
  }
  return false;
}

function filterAnarchySubject(anarchySubject:AnarchySubject, keywordFilter:string[]): boolean {
  if (!keywordFilter) {
    return true;
  }
  for (const keyword of keywordFilter) {
    if (!keywordMatch(anarchySubject, keyword)) {
      return false;
    }
  }
  return true;
}

function pruneAnarchySubject(anarchySubject:AnarchySubject) {
  return {
    apiVersion: anarchySubject.apiVersion,
    kind: anarchySubject.kind,
    metadata: {
      creationTimestamp: anarchySubject.metadata.creationTimestamp,
      deletionTimestamp: anarchySubject.metadata.deletionTimestamp,
      name: anarchySubject.metadata.name,
      namespace: anarchySubject.metadata.namespace,
      uid: anarchySubject.metadata.uid,
    },
    spec: {
      governor: anarchySubject.spec.governor,
      vars: {
        current_state: anarchySubject.spec.vars?.current_state,
        desired_state: anarchySubject.spec.vars?.desired_state,
      }
    },
  };
}

export interface FetchState {
  aborted?: boolean;
  continue?: string;
  iteration?: number;
  finished?: boolean;
}

const AnarchySubjects: React.FunctionComponent = () => {
  const history = useHistory();
  const location = useLocation();
  const routeMatch = useRouteMatch<any>('/admin/anarchysubjects/:namespace?');
  const anarchyNamespace = routeMatch.params.namespace;
  const urlSearchParams = new URLSearchParams(location.search);
  const keywordFilter = urlSearchParams.has('search') ? urlSearchParams.get('search').trim().split(/ +/).filter(w => w != '') : null;
  const stateFilter = urlSearchParams.has('state') ? urlSearchParams.get('state') : null;

  const [firstRender, setFirstRender] = useState(true);
  const [anarchySubjects, setAnarchySubjects] = useState<AnarchySubject[]>([]);
  const [selectedUids, setSelectedUids] = React.useState([]);
  const [fetchState, setFetchState] = useState<FetchState>({iteration: 0});
  const [fetchLimit, setFetchLimit] = useState(FETCH_BATCH_LIMIT * 2);

  const primaryAppContainer = document.getElementById('primary-app-container');
  primaryAppContainer.onscroll = (e) => {
    const scrollable = e.target as any;
    const scrollRemaining = scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight;
    if (scrollRemaining < 500 && fetchState?.continue && fetchLimit <= anarchySubjects.length) {
      setFetchLimit((limit) => limit + FETCH_BATCH_LIMIT);
    }
  }

  async function confirmThenDelete() {
    if (confirm("Deleted selected AnarchySubjects?")) {
      for (const anarchySubject of anarchySubjects) {
        if (selectedUids.includes(anarchySubject.metadata.uid)) {
          await deleteAnarchySubject(anarchySubject);
        }
      }
      await fetchAnarchySubjects();
    }
  }

  async function fetchAnarchySubjects() {
    const anarchySubjectList = await listAnarchySubjects({
      continue: fetchState.continue,
      labelSelector: stateFilter ? `state=${stateFilter}` : null,
      limit: FETCH_BATCH_LIMIT,
      namespace: anarchyNamespace,
    });
    if (fetchState.aborted) { 
      return
    }
    const anarchySubjects = (anarchySubjectList.items || [])
      .filter((anarchySubject) => filterAnarchySubject(anarchySubject, keywordFilter))
      .map(pruneAnarchySubject);
    setAnarchySubjects((current:AnarchySubject[]) => [...(current || []), ...anarchySubjects]);
    setFetchState((current) => {
      if (current.iteration != fetchState.iteration) {
        console.warn("fetchState changed unexpectedly after fetch!");
        return current;
      }
      return {
        continue: anarchySubjectList.metadata.continue,
        iteration: current.iteration + 1,
        finished: !anarchySubjectList.metadata.continue,
      };
    });
  }

  function reloadAnarchySubjects() {
    setAnarchySubjects([]);
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
    if (!fetchState.finished && anarchySubjects.length < fetchLimit) {
      fetchAnarchySubjects();
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
      reloadAnarchySubjects();
    }
  }, [anarchyNamespace, stateFilter, JSON.stringify(keywordFilter)]);

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
          <Title headingLevel="h4" size="xl">AnarchySubjects</Title>
        </SplitItem>
        <SplitItem>
          <RefreshButton onClick={() => reloadAnarchySubjects()}/>
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
          <AnarchySubjectStateSelect
            state={stateFilter}
            onSelect={(state) => {
              if (state) {
                urlSearchParams.set('state', state);
              } else if(urlSearchParams.has('state')) {
                urlSearchParams.delete('state');
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
                history.push(`/admin/anarchysubjects/${namespaceName}${location.search}`);
              } else {
                history.push(`/admin/anarchysubjects${location.search}`);
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
    { anarchySubjects.length === 0 ? (
      fetchState.finished ? (
        <PageSection>
          <EmptyState variant="full">
            <EmptyStateIcon icon={ExclamationTriangleIcon} />
            <Title headingLevel="h1" size="lg">
              No AnarchySubjects found
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
          columns={['Namespace', 'Name', 'AnarchyGovernor', 'State', 'Created At', 'Deleted At']}
          onSelectAll={(isSelected) => {
            if (isSelected) {
              setSelectedUids(anarchySubjects.map(anarchySubject => anarchySubject.metadata.uid));
            } else {
              setSelectedUids([]);
            }
          }}
          rows={anarchySubjects.map((anarchySubject:AnarchySubject) => {
            return {
              cells: [
                <>
                  {anarchySubject.metadata.namespace}
                  <OpenshiftConsoleLink key="console" resource={anarchySubject} linkToNamespace={true}/>
                </>,
                <>
                  <Link key="admin" to={`/admin/anarchysubjects/${anarchySubject.metadata.namespace}/${anarchySubject.metadata.name}`}>{anarchySubject.metadata.name}</Link>
                  <OpenshiftConsoleLink key="console" resource={anarchySubject}/>
                </>,
                <>
                  <Link key="admin" to={`/admin/anarchygovernors/${anarchySubject.metadata.namespace}/${anarchySubject.spec.governor}`}>{anarchySubject.spec.governor}</Link>
                  <OpenshiftConsoleLink key="console" reference={{
                    apiVersion: anarchySubject.apiVersion,
                    kind: anarchySubject.kind,
                    name: anarchySubject.spec.governor,
                    namespace: anarchySubject.metadata.namespace,
                  }}/>
                </>,
                anarchySubject.spec.vars?.current_state || '-',
                <>
                  <LocalTimestamp key="timestamp" timestamp={anarchySubject.metadata.creationTimestamp}/>
                  {' '}
                  (<TimeInterval key="interval" toTimestamp={anarchySubject.metadata.creationTimestamp}/>)
                </>,
                anarchySubject.metadata.deletionTimestamp ? (
                  <>
                    <LocalTimestamp key="timestamp" timestamp={anarchySubject.metadata.deletionTimestamp}/>
                    {' '}
                    (<TimeInterval key="interval" toTimestamp={anarchySubject.metadata.deletionTimestamp}/>)
                  </>
                ) : '-',
              ],
              onSelect: (isSelected) => setSelectedUids(uids => {
                if (isSelected) {
                  if (uids.includes(anarchySubject.metadata.uid)) {
                    return uids;
                  } else {
                    return [...uids, anarchySubject.metadata.uid];
                  }
                } else {
                  return uids.filter(uid => uid !== anarchySubject.metadata.uid);
                }
              }),
              selected: selectedUids.includes(anarchySubject.metadata.uid),
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

export default AnarchySubjects;
