import React, { useCallback, useMemo, useReducer } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
import { apiPaths, deleteAnarchyAction, fetcher } from '@app/api';
import { selectedUidsReducer } from '@app/reducers';
import { AnarchyAction, AnarchyActionList } from '@app/types';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import KeywordSearchInput from '@app/components/KeywordSearchInput';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';
import AnarchyActionSelect from './AnarchyActionSelect';
import Footer from '@app/components/Footer';
import { compareK8sObjectsArr } from '@app/util';
import ProjectSelector from '@app/components/ProjectSelector';

import './admin.css';

function keywordMatch(anarchyAction: AnarchyAction, keyword: string): boolean {
  if (anarchyAction.metadata.name.includes(keyword)) {
    return true;
  }
  if (anarchyAction.spec.governorRef?.name.includes(keyword)) {
    return true;
  }
  if (anarchyAction.spec.subjectRef?.name.includes(keyword)) {
    return true;
  }
  return false;
}

const AnarchyActions: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { namespace } = useParams();
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
    [searchParams.get('search')],
  );
  const actionFilter = searchParams.has('action') ? searchParams.get('action') : null;
  const [selectedUids, reduceSelectedUids] = useReducer(selectedUidsReducer, []);
  const labelSelector = actionFilter ? `anarchy.gpte.redhat.com/action=${actionFilter}` : null;

  const {
    data: anarchyActionsPages,
    mutate,
    size,
    setSize,
  } = useSWRInfinite<AnarchyActionList>(
    (index, previousPageData: AnarchyActionList) => {
      if (previousPageData && !previousPageData.metadata?.continue) {
        return null;
      }
      const continueId = index === 0 ? '' : previousPageData.metadata?.continue;
      return apiPaths.ANARCHY_ACTIONS({ namespace, limit: 35, continueId, labelSelector });
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
    },
  );

  const revalidate = useCallback(
    ({ updatedItems, action }: { updatedItems: AnarchyAction[]; action: 'update' | 'delete' }) => {
      const anarchyActionsPagesCpy = JSON.parse(JSON.stringify(anarchyActionsPages));
      let p: AnarchyActionList;
      let i: number;
      for ([i, p] of anarchyActionsPagesCpy.entries()) {
        for (const updatedItem of updatedItems) {
          const foundIndex = p.items.findIndex((r) => r.metadata.uid === updatedItem.metadata.uid);
          if (foundIndex > -1) {
            if (action === 'update') {
              anarchyActionsPagesCpy[i].items[foundIndex] = updatedItem;
            } else if (action === 'delete') {
              anarchyActionsPagesCpy[i].items.splice(foundIndex, 1);
            }
            mutate(anarchyActionsPagesCpy);
          }
        }
      }
    },
    [mutate, anarchyActionsPages],
  );

  const isReachingEnd = anarchyActionsPages && !anarchyActionsPages[anarchyActionsPages.length - 1].metadata.continue;
  const isLoadingInitialData = !anarchyActionsPages;
  const isLoadingMore =
    isLoadingInitialData || (size > 0 && anarchyActionsPages && typeof anarchyActionsPages[size - 1] === 'undefined');

  const filterFunction = useCallback(
    (anarchyAction: AnarchyAction) => {
      if (!keywordFilter) {
        return true;
      }
      for (const keyword of keywordFilter) {
        if (!keywordMatch(anarchyAction, keyword)) {
          return false;
        }
      }
      return true;
    },
    [keywordFilter],
  );

  const anarchyActions: AnarchyAction[] = useMemo(
    () => [].concat(...anarchyActionsPages.map((page) => page.items)).filter(filterFunction) || [],
    [filterFunction, anarchyActionsPages],
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
    if (confirm('Deleted selected AnarchyActions?')) {
      const removedAnarchyActions: AnarchyAction[] = [];
      for (const anarchyAction of anarchyActions) {
        if (selectedUids.includes(anarchyAction.metadata.uid)) {
          await deleteAnarchyAction(anarchyAction);
          removedAnarchyActions.push(anarchyAction);
        }
      }
      reduceSelectedUids({ type: 'clear' });
      revalidate({ action: 'delete', updatedItems: removedAnarchyActions });
    }
  }

  return (
    <div onScroll={scrollHandler} className="admin-container">
      <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
        <Split hasGutter>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">
              AnarchyActions
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
            <AnarchyActionSelect
              action={actionFilter}
              onSelect={(action) => {
                if (action) {
                  searchParams.set('action', action);
                } else if (searchParams.has('action')) {
                  searchParams.delete('action');
                }
                setSearchParams(searchParams);
              }}
            />
          </SplitItem>
          <SplitItem>
            <ProjectSelector
              selector="anarchy"
              currentNamespaceName={namespace}
              onSelect={(namespace) => {
                if (namespace) {
                  navigate(`/admin/anarchyactions/${namespace.name}${location.search}`);
                } else {
                  navigate(`/admin/anarchyactions${location.search}`);
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
      {anarchyActions.length === 0 ? (
        <PageSection>
          <EmptyState variant="full">
            <EmptyStateIcon icon={ExclamationTriangleIcon} />
            <Title headingLevel="h1" size="lg">
              No AnarchyActions found
            </Title>
          </EmptyState>
        </PageSection>
      ) : (
        <PageSection key="body" variant={PageSectionVariants.light} className="admin-body">
          <SelectableTable
            columns={['Namespace', 'Name', 'AnarchySubject', 'AnarchyGovernor', 'Created At', 'State', 'Finished At']}
            onSelectAll={(isSelected) => {
              if (isSelected) {
                reduceSelectedUids({ type: 'set', items: anarchyActions });
              } else {
                reduceSelectedUids({ type: 'clear' });
              }
            }}
            rows={anarchyActions.map((anarchyAction: AnarchyAction) => {
              return {
                cells: [
                  <>
                    {anarchyAction.metadata.namespace}
                    <OpenshiftConsoleLink key="console" resource={anarchyAction} linkToNamespace={true} />
                  </>,
                  <>
                    <Link
                      key="admin"
                      to={`/admin/anarchyactions/${anarchyAction.metadata.namespace}/${anarchyAction.metadata.name}`}
                    >
                      {anarchyAction.metadata.name}
                    </Link>
                    <OpenshiftConsoleLink key="console" resource={anarchyAction} />
                  </>,
                  <>
                    <Link
                      key="admin"
                      to={`/admin/anarchysubjects/${anarchyAction.spec.subjectRef.namespace}/${anarchyAction.spec.subjectRef.name}`}
                    >
                      {anarchyAction.spec.subjectRef.name}
                    </Link>
                    <OpenshiftConsoleLink key="console" reference={anarchyAction.spec.subjectRef} />
                  </>,
                  anarchyAction.spec.governorRef ? (
                    <>
                      <Link
                        key="admin"
                        to={`/admin/anarchygovernors/${anarchyAction.spec.governorRef.namespace}/${anarchyAction.spec.governorRef.name}`}
                      >
                        {anarchyAction.spec.governorRef.name}
                      </Link>
                      <OpenshiftConsoleLink key="console" reference={anarchyAction.spec.governorRef} />
                    </>
                  ) : (
                    <>
                      <p style={{ color: 'red', fontWeight: 'bold' }}>NO GOVERNOR?!</p>
                    </>
                  ),
                  <>
                    <LocalTimestamp key="timestamp" timestamp={anarchyAction.metadata.creationTimestamp} />
                    <span key="interval" style={{ padding: '0 6px' }}>
                      <TimeInterval key="time-interval" toTimestamp={anarchyAction.metadata.creationTimestamp} />)
                    </span>
                  </>,
                  <>{anarchyAction.status?.state || <p>-</p>}</>,
                  anarchyAction.status?.finishedTimestamp ? (
                    <>
                      <LocalTimestamp key="timestamp" timestamp={anarchyAction.status.finishedTimestamp} />
                      <span key="interval" style={{ padding: '0 6px' }}>
                        <TimeInterval key="time-interval" toTimestamp={anarchyAction.status.finishedTimestamp} />)
                      </span>
                    </>
                  ) : (
                    <p>-</p>
                  ),
                ],
                onSelect: (isSelected: boolean) =>
                  reduceSelectedUids({
                    type: isSelected ? 'add' : 'remove',
                    items: [anarchyAction],
                  }),
                selected: selectedUids.includes(anarchyAction.metadata.uid),
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

export default AnarchyActions;
