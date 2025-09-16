import React, { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import useSWRInfinite from 'swr/infinite';
import { useSWRConfig } from 'swr';
import {
  EmptyState,
  EmptyStateBody,
  PageSection,
  Split,
  SplitItem,
  Title,
  EmptyStateFooter,
  Button,
} from '@patternfly/react-core';
import PlusIcon from '@patternfly/react-icons/dist/js/icons/plus-icon';
import TrashIcon from '@patternfly/react-icons/dist/js/icons/trash-icon';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import { apiPaths, fetcher, deleteMultiWorkshop } from '@app/api';
import { MultiWorkshop, MultiWorkshopList as MultiWorkshopListType } from '@app/types';
import { compareK8sObjectsArr, FETCH_BATCH_LIMIT } from '@app/util';
import Footer from '@app/components/Footer';
import KeywordSearchInput from '@app/components/KeywordSearchInput';
import LocalTimestamp from '@app/components/LocalTimestamp';
import TimeInterval from '@app/components/TimeInterval';
import SelectableTable from '@app/components/SelectableTable';
import ButtonCircleIcon from '@app/components/ButtonCircleIcon';
import Modal, { useModal } from '@app/Modal/Modal';
import useSession from '@app/utils/useSession';

import './multiworkshop-list.css';

function keywordMatch(multiworkshop: MultiWorkshop, keyword: string): boolean {
  const keywordLowerCased = keyword.toLowerCase();
  if (
    multiworkshop.metadata.name.includes(keywordLowerCased) ||
    multiworkshop.metadata.namespace.includes(keywordLowerCased) ||
    (multiworkshop.spec.description && multiworkshop.spec.description.toLowerCase().includes(keywordLowerCased)) ||
    (multiworkshop.spec.displayName && multiworkshop.spec.displayName.toLowerCase().includes(keywordLowerCased))
  ) {
    return true;
  }
  return false;
}

const MultiWorkshopList: React.FC = () => {
  const navigate = useNavigate();
  const { namespace } = useParams();
  const { userNamespace } = useSession().getSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const [modalAction, openModalAction] = useModal();
  const [modalState, setModalState] = useState<{ action?: string; multiworkshop?: MultiWorkshop }>({});
  const [selectedUids, setSelectedUids] = useState([]);
  const { cache } = useSWRConfig();
  
  // Use namespace from params or fall back to user's namespace
  const currentNamespace = namespace || userNamespace?.name;
  
  const hasSearch = searchParams.has('search');
  const searchValue = searchParams.get('search');
  const keywordFilter = useMemo(
    () =>
      hasSearch
        ? searchValue
            .trim()
            .split(/ +/)
            .filter((w) => w != '')
        : null,
    [hasSearch, searchValue],
  );

  const {
    data: multiworkshopsPages,
    mutate,
    size,
    setSize,
  } = useSWRInfinite<MultiWorkshopListType>(
    (index, previousPageData) => {
      if (previousPageData && !previousPageData.metadata?.continue) {
        return null;
      }
      const continueId = index === 0 ? '' : previousPageData.metadata?.continue;
      return apiPaths.MULTIWORKSHOPS({ namespace: currentNamespace, limit: FETCH_BATCH_LIMIT, continueId });
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
  
  const isReachingEnd = multiworkshopsPages && !multiworkshopsPages[multiworkshopsPages.length - 1].metadata.continue;
  const isLoadingInitialData = !multiworkshopsPages;
  const isLoadingMore =
    isLoadingInitialData || (size > 0 && multiworkshopsPages && typeof multiworkshopsPages[size - 1] === 'undefined');

  const revalidate = useCallback(
    ({ updatedItems, action }: { updatedItems: MultiWorkshop[]; action: 'update' | 'delete' }) => {
      const multiworkshopsPagesCpy = JSON.parse(JSON.stringify(multiworkshopsPages));
      let p: MultiWorkshopListType;
      let i: number;
      for ([i, p] of multiworkshopsPagesCpy.entries()) {
        for (const updatedItem of updatedItems) {
          const foundIndex = p.items.findIndex((r) => r.metadata.uid === updatedItem.metadata.uid);
          if (foundIndex > -1) {
            if (action === 'update') {
              multiworkshopsPagesCpy[i].items[foundIndex] = updatedItem;
            } else if (action === 'delete') {
              multiworkshopsPagesCpy[i].items.splice(foundIndex, 1);
            }
            mutate(multiworkshopsPagesCpy);
          }
        }
      }
    },
    [mutate, multiworkshopsPages],
  );

  const showModal = useCallback(
    ({ action, multiworkshop }: { action: string; multiworkshop?: MultiWorkshop }) => {
      setModalState({ action, multiworkshop });
      openModalAction();
    },
    [openModalAction],
  );

  const filterMultiWorkshop = useCallback(
    (multiworkshop: MultiWorkshop): boolean => {
      // Hide anything pending deletion
      if (multiworkshop.metadata.deletionTimestamp) {
        return false;
      }
      if (keywordFilter) {
        for (const keyword of keywordFilter) {
          if (!keywordMatch(multiworkshop, keyword)) {
            return false;
          }
        }
      }
      return true;
    },
    [keywordFilter],
  );

  const multiworkshops: MultiWorkshop[] = useMemo(
    () => [].concat(...multiworkshopsPages.map((page) => page.items)).filter(filterMultiWorkshop) || [],
    [filterMultiWorkshop, multiworkshopsPages],
  );

  // Trigger continue fetching more resource claims on scroll.
  const scrollHandler = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollable = e.currentTarget;
    const scrollRemaining = scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight;
    if (scrollRemaining < 500 && !isReachingEnd && !isLoadingMore) {
      setSize(size + 1);
    }
  };

  async function onMultiWorkshopDeleteConfirm(): Promise<void> {
    const deletedMultiWorkshops: MultiWorkshop[] = [];
    if (modalState.multiworkshop) {
      await deleteMultiWorkshop(modalState.multiworkshop);
      deletedMultiWorkshops.push(modalState.multiworkshop);
    } else {
      for (const multiworkshop of multiworkshops) {
        if (selectedUids.includes(multiworkshop.metadata.uid)) {
          await deleteMultiWorkshop(multiworkshop);
          cache.delete(
            apiPaths.MULTIWORKSHOP({
              namespace: multiworkshop.metadata.namespace,
              multiworkshopName: multiworkshop.metadata.name,
            }),
          );
          deletedMultiWorkshops.push(multiworkshop);
        }
      }
    }
    revalidate({ updatedItems: deletedMultiWorkshops, action: 'delete' });
    setSelectedUids([]); // Clear selections after delete
  }

  function getMultiWorkshopDisplayName(multiworkshop: MultiWorkshop): string {
    return multiworkshop.spec.displayName || multiworkshop.spec.name || multiworkshop.metadata.name;
  }

  if (!currentNamespace) {
    return (
      <PageSection>
        <EmptyState headingLevel="h1" icon={ExclamationTriangleIcon} titleText="No namespace available" variant="full">
          <EmptyStateBody>Please ensure you have a valid namespace to view multi-workshops.</EmptyStateBody>
        </EmptyState>
      </PageSection>
    );
  }

  return (
    <div onScroll={scrollHandler} style={{ height: '100vh', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <Modal
        ref={modalAction}
        onConfirm={onMultiWorkshopDeleteConfirm}
        title={
          modalState.multiworkshop 
            ? `Delete event ${getMultiWorkshopDisplayName(modalState.multiworkshop)}?` 
            : 'Delete selected events?'
        }
      >
        <p>This action cannot be undone. All associated workshop data will be deleted.</p>
      </Modal>

      <PageSection hasBodyWrapper={false} key="header" variant="default" className="multiworkshop-list__header">
        <Split hasGutter>
          <SplitItem isFilled>
            <Title headingLevel="h1" size="2xl">
              Multi Workshop
            </Title>
            <p className="multiworkshop-list__header-subtitle">
              Create and manage your event workshop collections in {currentNamespace}
            </p>
          </SplitItem>
          <SplitItem>
            <KeywordSearchInput
              initialValue={keywordFilter}
              placeholder="Search events..."
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
            <ButtonCircleIcon
              isDisabled={selectedUids.length === 0}
              onClick={() => showModal({ action: 'delete' })}
              description="Delete Selected"
              icon={TrashIcon}
            />
          </SplitItem>
          <SplitItem>
            <Button 
              variant="primary" 
              icon={<PlusIcon />}
              onClick={() => navigate('/multi-workshop/create')}
            >
              Create Multi Workshop
            </Button>
          </SplitItem>
        </Split>
      </PageSection>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {multiworkshops.length === 0 ? (
          <PageSection hasBodyWrapper={false} key="multiworkshops-list-empty" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EmptyState headingLevel="h1" icon={ExclamationTriangleIcon} titleText="No multi-workshops found" variant="full">
              <EmptyStateFooter>
                {keywordFilter ? (
                  <EmptyStateBody>No multi-workshops matched your search criteria.</EmptyStateBody>
                ) : (
                  <EmptyStateBody>
                    Get started by creating your first event to organize multiple workshop sessions.
                  </EmptyStateBody>
                )}
                <Button 
                  variant="primary" 
                  icon={<PlusIcon />}
                  onClick={() => navigate('/multi-workshop/create')}
                >
                  Create Multi Workshop
                </Button>
              </EmptyStateFooter>
            </EmptyState>
          </PageSection>
        ) : (
          <PageSection hasBodyWrapper={false} key="body">
            <SelectableTable
              columns={['Event Name', 'Description', 'Workshops', 'Seats', 'Start provisioning date', 'Created', 'Actions']}
              onSelectAll={(isSelected: boolean) => {
                if (isSelected) {
                  setSelectedUids(multiworkshops.map((multiworkshop) => multiworkshop.metadata.uid));
                } else {
                  setSelectedUids([]);
                }
              }}
              rows={multiworkshops.map((multiworkshop: MultiWorkshop) => {
                const actionHandlers = {
                  delete: () => showModal({ action: 'delete', multiworkshop }),
                };

                const cells: unknown[] = [];
                cells.push(
                  // Event Name
                  <Link
                    key="event-name"
                    to={`/multi-workshop/${multiworkshop.metadata.namespace}/${multiworkshop.metadata.name}`}
                  >
                    {getMultiWorkshopDisplayName(multiworkshop)}
                  </Link>,
                  // Description
                  <span key="description" style={{ color: 'var(--pf-t--color--text--secondary)' }}>
                    {multiworkshop.spec.description || 'No description'}
                  </span>,
                  // Workshops
                  <>{multiworkshop.spec.assets ? multiworkshop.spec.assets.length : 0}</>,
                  // Seats
                  <>{multiworkshop.spec.numberSeats || 'N/A'}</>,
                  // Start Date
                  <>
                    {multiworkshop.spec.startDate ? (
                      <LocalTimestamp key="start-timestamp" timestamp={multiworkshop.spec.startDate} />
                    ) : (
                      'Not scheduled'
                    )}
                  </>,
                  // Created
                  <TimeInterval key="created" toTimestamp={multiworkshop.metadata.creationTimestamp} />,
                  // Actions
                  <React.Fragment key="actions">
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        gap: 'var(--pf-t--global--spacer--sm)',
                      }}
                    >
                      <ButtonCircleIcon
                        key="actions__delete"
                        onClick={actionHandlers.delete}
                        description="Delete"
                        icon={TrashIcon}
                      />
                    </div>
                  </React.Fragment>,
                );
                return {
                  cells: cells,
                  onSelect: (isSelected) =>
                    setSelectedUids((uids) => {
                      if (isSelected) {
                        if (uids.includes(multiworkshop.metadata.uid)) {
                          return uids;
                        } else {
                          return [...uids, multiworkshop.metadata.uid];
                        }
                      } else {
                        return uids.filter((uid) => uid !== multiworkshop.metadata.uid);
                      }
                    }),
                  selected: selectedUids.includes(multiworkshop.metadata.uid),
                };
              })}
            />
          </PageSection>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default MultiWorkshopList;
