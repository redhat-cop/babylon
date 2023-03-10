import React, { useCallback, useMemo, useReducer } from 'react';
import { Link, useNavigate, useLocation, useParams } from 'react-router-dom';
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
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import { deleteAnarchyRun, fetcher, apiPaths } from '@app/api';
import { selectedUidsReducer } from '@app/reducers';
import { AnarchyRun, AnarchyRunList } from '@app/types';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import KeywordSearchInput from '@app/components/KeywordSearchInput';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';
import AnarchyNamespaceSelect from './AnarchyNamespaceSelect';
import AnarchyRunnerStateSelect from './AnarchyRunnerStateSelect';
import Footer from '@app/components/Footer';
import { compareK8sObjectsArr } from '@app/util';

import './admin.css';

function keywordMatch(anarchyRun: AnarchyRun, keyword: string): boolean {
  if (anarchyRun.metadata.name.includes(keyword)) {
    return true;
  }
  if (anarchyRun.spec.action && anarchyRun.spec.action.name.includes(keyword)) {
    return true;
  }
  if (anarchyRun.spec.actionConfig && anarchyRun.spec.actionConfig.name.includes(keyword)) {
    return true;
  }
  if (anarchyRun.spec.governor.name.includes(keyword)) {
    return true;
  }
  if (anarchyRun.spec.subject.name.includes(keyword)) {
    return true;
  }
  return false;
}

const AnarchyRuns: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { namespace } = useParams();
  const urlSearchParams = new URLSearchParams(location.search);
  const keywordFilter = urlSearchParams.has('search')
    ? urlSearchParams
        .get('search')
        .trim()
        .split(/ +/)
        .filter((w) => w != '')
    : null;
  const stateUrlParam = urlSearchParams.has('state') ? urlSearchParams.get('state') : null;
  const [selectedUids, reduceSelectedUids] = useReducer(selectedUidsReducer, []);

  const labelSelectors = [];
  if (stateUrlParam) {
    if (stateUrlParam === 'incomplete') {
      labelSelectors.push(`anarchy.gpte.redhat.com/runner!=successful`);
    } else if (stateUrlParam === 'running') {
      labelSelectors.push(`anarchy.gpte.redhat.com/runner notin (failed,queued,pending,successful,canceled)`);
    } else {
      labelSelectors.push(`anarchy.gpte.redhat.com/runner=${stateUrlParam}`);
    }
  }
  const labelSelector = labelSelectors.length > 0 ? labelSelectors.join(',') : null;
  const {
    data: anarchyRunsPages,
    mutate,
    size,
    setSize,
  } = useSWRInfinite<AnarchyRunList>(
    (index, previousPageData: AnarchyRunList) => {
      if (previousPageData && !previousPageData.metadata?.continue) {
        return null;
      }
      const continueId = index === 0 ? '' : previousPageData.metadata?.continue;
      return apiPaths.ANARCHY_RUNS({ namespace, limit: 35, continueId, labelSelector });
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
    ({ updatedItems, action }: { updatedItems: AnarchyRun[]; action: 'update' | 'delete' }) => {
      const anarchyRunsPagesCpy = JSON.parse(JSON.stringify(anarchyRunsPages));
      let p: AnarchyRunList;
      let i: number;
      for ([i, p] of anarchyRunsPagesCpy.entries()) {
        for (const updatedItem of updatedItems) {
          const foundIndex = p.items.findIndex((r) => r.metadata.uid === updatedItem.metadata.uid);
          if (foundIndex > -1) {
            if (action === 'update') {
              anarchyRunsPagesCpy[i].items[foundIndex] = updatedItem;
            } else if (action === 'delete') {
              anarchyRunsPagesCpy[i].items.splice(foundIndex, 1);
            }
            mutate(anarchyRunsPagesCpy);
          }
        }
      }
    },
    [mutate, anarchyRunsPages]
  );

  const isReachingEnd = anarchyRunsPages && !anarchyRunsPages[anarchyRunsPages.length - 1].metadata.continue;
  const isLoadingInitialData = !anarchyRunsPages;
  const isLoadingMore =
    isLoadingInitialData || (size > 0 && anarchyRunsPages && typeof anarchyRunsPages[size - 1] === 'undefined');

  const filterAnarchyRun = useCallback(
    (anarchyRun: AnarchyRun) => {
      if (!keywordFilter) {
        return true;
      }
      for (const keyword of keywordFilter) {
        if (!keywordMatch(anarchyRun, keyword)) {
          return false;
        }
      }
      return true;
    },
    [keywordFilter]
  );

  const anarchyRuns: AnarchyRun[] = useMemo(
    () => [].concat(...anarchyRunsPages.map((page) => page.items)).filter(filterAnarchyRun) || [],
    [filterAnarchyRun, anarchyRunsPages]
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
    if (confirm('Deleted selected AnarchyRuns?')) {
      const removedAnarchyRuns: AnarchyRun[] = [];
      for (const anarchyRun of anarchyRuns) {
        if (selectedUids.includes(anarchyRun.metadata.uid)) {
          await deleteAnarchyRun(anarchyRun);
          removedAnarchyRuns.push(anarchyRun);
        }
      }
      reduceSelectedUids({ type: 'clear' });
      revalidate({ action: 'delete', updatedItems: removedAnarchyRuns });
    }
  }

  // Fetch all if keywordFilter is defined.
  if (keywordFilter && anarchyRunsPages.length > 0 && anarchyRunsPages[anarchyRunsPages.length - 1].metadata.continue) {
    if (!isLoadingMore) {
      if (AnarchyRuns.length > 0) {
        setTimeout(() => {
          setSize(size + 1);
        }, 5000);
      } else {
        setSize(size + 1);
      }
    }
  }

  return (
    <div onScroll={scrollHandler} className="admin-container">
      <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
        <Split hasGutter>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">
              AnarchyRuns
            </Title>
          </SplitItem>
          <SplitItem>
            <KeywordSearchInput
              initialValue={keywordFilter}
              onSearch={(value) => {
                if (value) {
                  urlSearchParams.set('search', value.join(' '));
                } else if (urlSearchParams.has('search')) {
                  urlSearchParams.delete('searchs');
                }
                navigate(`${location.pathname}?${urlSearchParams.toString()}`);
              }}
            />
          </SplitItem>
          <SplitItem>
            <AnarchyRunnerStateSelect
              runnerState={stateUrlParam}
              onSelect={(state) => {
                if (state) {
                  urlSearchParams.set('state', state);
                } else if (urlSearchParams.has('state')) {
                  urlSearchParams.delete('state');
                }
                navigate(`${location.pathname}?${urlSearchParams.toString()}`);
              }}
            />
          </SplitItem>
          <SplitItem>
            <AnarchyNamespaceSelect
              namespace={namespace}
              onSelect={(namespaceName) => {
                if (namespaceName) {
                  navigate(`/admin/anarchyruns/${namespaceName}${location.search}`);
                } else {
                  navigate(`/admin/anarchyruns${location.search}`);
                }
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
      {anarchyRuns.length === 0 && isReachingEnd ? (
        <PageSection className="admin-body">
          <EmptyState variant="full">
            <EmptyStateIcon icon={ExclamationTriangleIcon} />
            <Title headingLevel="h1" size="lg">
              No AnarchyRuns found
            </Title>
          </EmptyState>
        </PageSection>
      ) : (
        <PageSection key="body" variant={PageSectionVariants.light} className="admin-body">
          <SelectableTable
            columns={['Namespace', 'Name', 'Runner State', 'AnarchySubject', 'AnarchyAction', 'Created At']}
            onSelectAll={(isSelected: boolean) => {
              if (isSelected) {
                reduceSelectedUids({ type: 'set', items: anarchyRuns });
              } else {
                reduceSelectedUids({ type: 'clear' });
              }
            }}
            rows={anarchyRuns.map((anarchyRun: AnarchyRun) => {
              return {
                cells: [
                  <>
                    {anarchyRun.metadata.namespace}
                    <OpenshiftConsoleLink key="console" resource={anarchyRun} linkToNamespace={true} />
                  </>,
                  <>
                    <Link
                      key="admin"
                      to={`/admin/anarchyruns/${anarchyRun.metadata.namespace}/${anarchyRun.metadata.name}`}
                    >
                      {anarchyRun.metadata.name}
                    </Link>
                    <OpenshiftConsoleLink key="console" resource={anarchyRun} />
                  </>,
                  <>{anarchyRun.metadata.labels?.['anarchy.gpte.redhat.com/runner'] || <p>-</p>}</>,
                  <>
                    {anarchyRun.spec.subject ? (
                      <>
                        <Link
                          key="admin"
                          to={`/admin/anarchysubjects/${anarchyRun.spec.subject.namespace}/${anarchyRun.spec.subject.name}`}
                        >
                          {anarchyRun.spec.subject.name}
                        </Link>
                        <OpenshiftConsoleLink key="console" reference={anarchyRun.spec.subject} />
                      </>
                    ) : (
                      <p>-</p>
                    )}
                  </>,
                  anarchyRun.spec.action ? (
                    <>
                      <Link
                        key="admin"
                        to={`/admin/anarchyactions/${anarchyRun.spec.action.namespace}/${anarchyRun.spec.action.name}`}
                      >
                        {anarchyRun.spec.action.name}
                      </Link>
                      <OpenshiftConsoleLink key="console" reference={anarchyRun.spec.subject} />
                    </>
                  ) : (
                    <p>-</p>
                  ),
                  <>
                    <LocalTimestamp key="timestamp" timestamp={anarchyRun.metadata.creationTimestamp} />
                    <span key="interval" style={{ padding: '0 6px' }}>
                      (<TimeInterval key="time-interval" toTimestamp={anarchyRun.metadata.creationTimestamp} />)
                    </span>
                  </>,
                ],
                onSelect: (isSelected: boolean) =>
                  reduceSelectedUids({
                    type: isSelected ? 'add' : 'remove',
                    items: [anarchyRun],
                  }),
                selected: selectedUids.includes(anarchyRun.metadata.uid),
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

export default AnarchyRuns;
