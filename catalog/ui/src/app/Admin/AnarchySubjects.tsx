import React, { useCallback, useMemo, useReducer } from 'react';
import { Link, useNavigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import {
  EmptyState,
  EmptyStateIcon,
  PageSection,
  PageSectionVariants,
  Split,
  SplitItem,
  Title,
  EmptyStateHeader,
} from '@patternfly/react-core';
import useSWRInfinite from 'swr/infinite';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import { apiPaths, deleteAnarchySubject, fetcher, forceDeleteAnarchySubject } from '@app/api';
import { selectedUidsReducer } from '@app/reducers';
import { AnarchySubject, AnarchySubjectList } from '@app/types';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import KeywordSearchInput from '@app/components/KeywordSearchInput';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';
import ProjectSelector from '@app/components/ProjectSelector';
import { compareK8sObjectsArr } from '@app/util';
import AnarchySubjectStateSelect from './AnarchySubjectStateSelect';
import Footer from '@app/components/Footer';

import './admin.css';

const FETCH_BATCH_LIMIT = 35;

function keywordMatch(anarchySubject: AnarchySubject, keyword: string): boolean {
  if (anarchySubject.metadata.name.includes(keyword)) {
    return true;
  }
  if (anarchySubject.spec.governor.includes(keyword)) {
    return true;
  }
  return false;
}

const AnarchySubjects: React.FC = () => {
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
  const stateFilter = searchParams.has('state') ? searchParams.get('state') : null;
  const [selectedUids, reduceSelectedUids] = useReducer(selectedUidsReducer, []);

  const {
    data: anarchySubjectsPages,
    mutate,
    size,
    setSize,
  } = useSWRInfinite<AnarchySubjectList>(
    (index, previousPageData: AnarchySubjectList) => {
      if (previousPageData && !previousPageData.metadata?.continue) {
        return null;
      }
      const continueId = index === 0 ? '' : previousPageData.metadata?.continue;
      return apiPaths.ANARCHY_SUBJECTS({
        namespace,
        limit: FETCH_BATCH_LIMIT,
        continueId,
        labelSelector: stateFilter ? `state=${stateFilter}` : '',
      });
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
    ({ updatedItems, action }: { updatedItems: AnarchySubject[]; action: 'update' | 'delete' }) => {
      const anarchySubjectsPagesCpy = JSON.parse(JSON.stringify(anarchySubjectsPages));
      let p: AnarchySubjectList;
      let i: number;
      for ([i, p] of anarchySubjectsPagesCpy.entries()) {
        for (const updatedItem of updatedItems) {
          const foundIndex = p.items.findIndex((r) => r.metadata.uid === updatedItem.metadata.uid);
          if (foundIndex > -1) {
            if (action === 'update') {
              anarchySubjectsPagesCpy[i].items[foundIndex] = updatedItem;
            } else if (action === 'delete') {
              anarchySubjectsPagesCpy[i].items.splice(foundIndex, 1);
            }
            mutate(anarchySubjectsPagesCpy);
          }
        }
      }
    },
    [mutate, anarchySubjectsPages],
  );

  const isReachingEnd =
    anarchySubjectsPages && !anarchySubjectsPages[anarchySubjectsPages.length - 1].metadata.continue;
  const isLoadingInitialData = !anarchySubjectsPages;
  const isLoadingMore =
    isLoadingInitialData || (size > 0 && anarchySubjectsPages && typeof anarchySubjectsPages[size - 1] === 'undefined');

  const filterAnarchySubject = useCallback(
    (anarchySubject: AnarchySubject) => {
      if (!keywordFilter) {
        return true;
      }
      for (const keyword of keywordFilter) {
        if (!keywordMatch(anarchySubject, keyword)) {
          return false;
        }
      }
      return true;
    },
    [keywordFilter],
  );

  const anarchySubjects: AnarchySubject[] = useMemo(
    () => [].concat(...anarchySubjectsPages.map((page) => page.items)).filter(filterAnarchySubject) || [],
    [filterAnarchySubject, anarchySubjectsPages],
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
    if (confirm('Delete selected AnarchySubjects?')) {
      const removedAnarchySubjects: AnarchySubject[] = [];
      for (const anarchySubject of anarchySubjects) {
        if (selectedUids.includes(anarchySubject.metadata.uid)) {
          await deleteAnarchySubject(anarchySubject);
          removedAnarchySubjects.push(anarchySubject);
        }
      }
      reduceSelectedUids({ type: 'clear' });
      revalidate({ action: 'delete', updatedItems: removedAnarchySubjects });
    }
  }

  async function confirmThenForceDelete(): Promise<void> {
    if (confirm('Force delete selected AnarchySubjects? Forcing delete may orphan provisioned cloud resources!')) {
      const removedAnarchySubjects: AnarchySubject[] = [];
      for (const anarchySubject of anarchySubjects) {
        if (selectedUids.includes(anarchySubject.metadata.uid)) {
          await forceDeleteAnarchySubject(anarchySubject);
          removedAnarchySubjects.push(anarchySubject);
        }
      }
      reduceSelectedUids({ type: 'clear' });
      revalidate({ action: 'delete', updatedItems: removedAnarchySubjects });
    }
  }

  // Fetch all if keywordFilter is defined.
  if (
    keywordFilter &&
    anarchySubjectsPages.length > 0 &&
    anarchySubjectsPages[anarchySubjectsPages.length - 1].metadata.continue
  ) {
    if (!isLoadingMore) {
      if (anarchySubjects.length > 0) {
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
              AnarchySubjects
            </Title>
          </SplitItem>
          <SplitItem>
            <KeywordSearchInput
              initialValue={keywordFilter}
              onSearch={(value) => {
                if (value) {
                  searchParams.set('search', value.join(' '));
                } else if (searchParams.has('search')) {
                  searchParams.delete('searchs');
                }
                setSearchParams(searchParams);
              }}
            />
          </SplitItem>
          <SplitItem>
            <AnarchySubjectStateSelect
              state={stateFilter}
              onSelect={(state) => {
                if (state) {
                  searchParams.set('state', state);
                } else if (searchParams.has('state')) {
                  searchParams.delete('state');
                }
                setSearchParams(searchParams);
              }}
            />
          </SplitItem>
          <SplitItem>
            <ProjectSelector
              selector="anarchy"
              currentNamespaceName={namespace}
              onSelect={(n) => {
                if (n) {
                  navigate(`/admin/anarchysubjects/${n.name}${location.search}`);
                } else {
                  navigate(`/admin/anarchysubjects${location.search}`);
                }
              }}
            />
          </SplitItem>
          <SplitItem>
            <ActionDropdown
              position="right"
              actionDropdownItems={[
                <ActionDropdownItem key="delete" label="Delete Selected" onSelect={() => confirmThenDelete()} />,
                <ActionDropdownItem
                  key="force-delete"
                  label="Force Delete Selected"
                  onSelect={() => confirmThenForceDelete()}
                />,
              ]}
            />
          </SplitItem>
        </Split>
      </PageSection>
      {anarchySubjects.length === 0 ? (
        <PageSection>
          <EmptyState variant="full">
            <EmptyStateHeader
              titleText="No AnarchySubjects found"
              icon={<EmptyStateIcon icon={ExclamationTriangleIcon} />}
              headingLevel="h1"
            />
          </EmptyState>
        </PageSection>
      ) : (
        <PageSection key="body" variant={PageSectionVariants.light} className="admin-body">
          <SelectableTable
            columns={['Namespace', 'Name', 'AnarchyGovernor', 'State', 'Created At', 'Deleted At']}
            onSelectAll={(isSelected: boolean) => {
              if (isSelected) {
                reduceSelectedUids({ type: 'set', items: anarchySubjects });
              } else {
                reduceSelectedUids({ type: 'clear' });
              }
            }}
            rows={anarchySubjects.map((anarchySubject) => {
              return {
                cells: [
                  <>
                    {anarchySubject.metadata.namespace}
                    <OpenshiftConsoleLink key="console" resource={anarchySubject} linkToNamespace={true} />
                  </>,
                  <>
                    <Link
                      key="admin"
                      to={`/admin/anarchysubjects/${anarchySubject.metadata.namespace}/${anarchySubject.metadata.name}`}
                    >
                      {anarchySubject.metadata.name}
                    </Link>
                    <OpenshiftConsoleLink key="console" resource={anarchySubject} />
                  </>,
                  <>
                    <Link
                      key="admin"
                      to={`/admin/anarchygovernors/${anarchySubject.metadata.namespace}/${anarchySubject.spec.governor}`}
                    >
                      {anarchySubject.spec.governor}
                    </Link>
                    <OpenshiftConsoleLink
                      key="console"
                      reference={{
                        apiVersion: anarchySubject.apiVersion,
                        kind: anarchySubject.kind,
                        name: anarchySubject.spec.governor,
                        namespace: anarchySubject.metadata.namespace,
                      }}
                    />
                  </>,
                  anarchySubject.spec.vars?.current_state || <p>-</p>,
                  <>
                    <LocalTimestamp key="timestamp" timestamp={anarchySubject.metadata.creationTimestamp} />
                    <span key="interval" style={{ padding: '0 6px' }}>
                      (<TimeInterval key="time-interval" toTimestamp={anarchySubject.metadata.creationTimestamp} />)
                    </span>
                  </>,
                  anarchySubject.metadata.deletionTimestamp ? (
                    <>
                      <LocalTimestamp key="timestamp" timestamp={anarchySubject.metadata.deletionTimestamp} />
                      <span key="interval" style={{ padding: '0 6px' }}>
                        (<TimeInterval key="time-interval" toTimestamp={anarchySubject.metadata.deletionTimestamp} />)
                      </span>
                    </>
                  ) : (
                    <p>-</p>
                  ),
                ],
                onSelect: (isSelected) =>
                  reduceSelectedUids({
                    type: isSelected ? 'add' : 'remove',
                    items: [anarchySubject],
                  }),
                selected: selectedUids.includes(anarchySubject.metadata.uid),
              };
            })}
          />
          {!isReachingEnd ? (
            <EmptyState variant="full">
              <EmptyStateHeader icon={<EmptyStateIcon icon={LoadingIcon} />} />
            </EmptyState>
          ) : null}
        </PageSection>
      )}
      <Footer />
    </div>
  );
};

export default AnarchySubjects;
