import React, { useCallback, useMemo, useReducer } from 'react';
import { Link, useNavigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import {
  EmptyState,
  EmptyStateIcon,
  PageSection,
  PageSectionVariants,
  Split,
  SplitItem,
  Title, EmptyStateHeader,
} from '@patternfly/react-core';
import useSWRInfinite from 'swr/infinite';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import { apiPaths, deleteAnarchyGovernor, fetcher } from '@app/api';
import { selectedUidsReducer } from '@app/reducers';
import { AnarchyGovernor, AnarchyGovernorList } from '@app/types';
import { ActionDropdown, ActionDropdownItem } from '@app/components/ActionDropdown';
import KeywordSearchInput from '@app/components/KeywordSearchInput';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';
import Footer from '@app/components/Footer';
import { compareK8sObjectsArr } from '@app/util';
import ProjectSelector from '@app/components/ProjectSelector';

import './admin.css';

const FETCH_BATCH_LIMIT = 50;

function keywordMatch(anarchyGovernor: AnarchyGovernor, keyword: string): boolean {
  if (anarchyGovernor.metadata.name.includes(keyword)) {
    return true;
  }
  return false;
}

const AnarchyGovernors: React.FC = () => {
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
  const [selectedUids, reduceSelectedUids] = useReducer(selectedUidsReducer, []);

  const {
    data: anarchyGovernorsPages,
    mutate,
    size,
    setSize,
  } = useSWRInfinite<AnarchyGovernorList>(
    (index, previousPageData: AnarchyGovernorList) => {
      if (previousPageData && !previousPageData.metadata?.continue) {
        return null;
      }
      const continueId = index === 0 ? '' : previousPageData.metadata?.continue;
      return apiPaths.ANARCHY_GOVERNORS({ namespace, limit: FETCH_BATCH_LIMIT, continueId });
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
    ({ updatedItems, action }: { updatedItems: AnarchyGovernor[]; action: 'update' | 'delete' }) => {
      const anarchyGovernorsPagesCpy = JSON.parse(JSON.stringify(anarchyGovernorsPages));
      let p: AnarchyGovernorList;
      let i: number;
      for ([i, p] of anarchyGovernorsPagesCpy.entries()) {
        for (const updatedItem of updatedItems) {
          const foundIndex = p.items.findIndex((r) => r.metadata.uid === updatedItem.metadata.uid);
          if (foundIndex > -1) {
            if (action === 'update') {
              anarchyGovernorsPagesCpy[i].items[foundIndex] = updatedItem;
            } else if (action === 'delete') {
              anarchyGovernorsPagesCpy[i].items.splice(foundIndex, 1);
            }
            mutate(anarchyGovernorsPagesCpy);
          }
        }
      }
    },
    [mutate, anarchyGovernorsPages],
  );

  const isReachingEnd =
    anarchyGovernorsPages && !anarchyGovernorsPages[anarchyGovernorsPages.length - 1].metadata.continue;
  const isLoadingInitialData = !anarchyGovernorsPages;
  const isLoadingMore =
    isLoadingInitialData ||
    (size > 0 && anarchyGovernorsPages && typeof anarchyGovernorsPages[size - 1] === 'undefined');

  const filterFunction = useCallback(
    (anarchyGovernor: AnarchyGovernor) => {
      if (!keywordFilter) {
        return true;
      }
      for (const keyword of keywordFilter) {
        if (!keywordMatch(anarchyGovernor, keyword)) {
          return false;
        }
      }
      return true;
    },
    [keywordFilter],
  );

  const anarchyGovernors: AnarchyGovernor[] = useMemo(
    () => [].concat(...anarchyGovernorsPages.map((page) => page.items)).filter(filterFunction) || [],
    [filterFunction, anarchyGovernorsPages],
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
    if (confirm('Deleted selected AnarchyGovernors?')) {
      const removedAnarchyGovernors: AnarchyGovernor[] = [];
      for (const anarchyGovernor of anarchyGovernors) {
        if (selectedUids.includes(anarchyGovernor.metadata.uid)) {
          await deleteAnarchyGovernor(anarchyGovernor);
          removedAnarchyGovernors.push(anarchyGovernor);
        }
      }
      reduceSelectedUids({ type: 'clear' });
      revalidate({ action: 'delete', updatedItems: removedAnarchyGovernors });
    }
  }

  // Fetch all if keywordFilter is defined.
  if (
    keywordFilter &&
    anarchyGovernorsPages.length > 0 &&
    anarchyGovernorsPages[anarchyGovernorsPages.length - 1].metadata.continue
  ) {
    if (!isLoadingMore) {
      if (anarchyGovernors.length > 0) {
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
              AnarchyGovernors
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
            <ProjectSelector
              selector="anarchy"
              currentNamespaceName={namespace}
              onSelect={(namespace) => {
                if (namespace) {
                  navigate(`/admin/anarchygovernors/${namespace.name}${location.search}`);
                } else {
                  navigate(`/admin/anarchygovernors${location.search}`);
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
      {anarchyGovernors.length === 0 ? (
        <PageSection>
          <EmptyState variant="full">
            <EmptyStateHeader titleText="No AnarchyGovernors found" icon={<EmptyStateIcon icon={ExclamationTriangleIcon} />} headingLevel="h1" />
          </EmptyState>
        </PageSection>
      ) : (
        <PageSection key="body" variant={PageSectionVariants.light} className="admin-body">
          <SelectableTable
            columns={['Namespace', 'Name', 'Created At']}
            onSelectAll={(isSelected: boolean) => {
              if (isSelected) {
                reduceSelectedUids({ type: 'set', items: anarchyGovernors });
              } else {
                reduceSelectedUids({ type: 'clear' });
              }
            }}
            rows={anarchyGovernors.map((anarchyGovernor: AnarchyGovernor) => {
              return {
                cells: [
                  <>
                    {anarchyGovernor.metadata.namespace}
                    <OpenshiftConsoleLink key="console" resource={anarchyGovernor} linkToNamespace={true} />
                  </>,
                  <>
                    <Link
                      key="admin"
                      to={`/admin/anarchygovernors/${anarchyGovernor.metadata.namespace}/${anarchyGovernor.metadata.name}`}
                    >
                      {anarchyGovernor.metadata.name}
                    </Link>
                    <OpenshiftConsoleLink key="console" resource={anarchyGovernor} />
                  </>,
                  <>
                    <LocalTimestamp key="timestamp" timestamp={anarchyGovernor.metadata.creationTimestamp} />
                    <span key="interval" style={{ padding: '0 6px' }}>
                      (<TimeInterval key="time-interval" toTimestamp={anarchyGovernor.metadata.creationTimestamp} />)
                    </span>
                  </>,
                ],
                onSelect: (isSelected: boolean) =>
                  reduceSelectedUids({
                    type: isSelected ? 'add' : 'remove',
                    items: [anarchyGovernor],
                  }),
                selected: selectedUids.includes(anarchyGovernor.metadata.uid),
              };
            })}
          />
          {!isReachingEnd ? (
            <EmptyState variant="full">
              <EmptyStateHeader icon={<EmptyStateIcon icon={LoadingIcon} />} /></EmptyState>
          ) : null}
        </PageSection>
      )}
      <Footer />
    </div>
  );
};

export default AnarchyGovernors;
