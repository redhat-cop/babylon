import React, { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSWRConfig } from 'swr';
import useSWRInfinite from 'swr/infinite';
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
import TrashIcon from '@patternfly/react-icons/dist/js/icons/trash-icon';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import { apiPaths, deleteMultiWorkshop, fetcher } from '@app/api';
import { MultiWorkshop, MultiWorkshopList } from '@app/types';
import { compareK8sObjectsArr, FETCH_BATCH_LIMIT } from '@app/util';
import Footer from '@app/components/Footer';
import KeywordSearchInput from '@app/components/KeywordSearchInput';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';
import ButtonCircleIcon from '@app/components/ButtonCircleIcon';
import Modal, { useModal } from '@app/Modal/Modal';
import ProjectSelector from '@app/components/ProjectSelector';

import './admin.css';

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

const MultiWorkshops: React.FC<{}> = () => {
  const navigate = useNavigate();
  const { namespace } = useParams();
  const [modalAction, openModalAction] = useModal();
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
  const [modalState, setModalState] = useState<{ action?: string; multiworkshop?: MultiWorkshop }>({});
  const [selectedUids, setSelectedUids] = useState([]);
  const { cache } = useSWRConfig();
  const showModal = useCallback(
    ({ action, multiworkshop }: { action: string; multiworkshop?: MultiWorkshop }) => {
      setModalState({ action, multiworkshop });
      openModalAction();
    },
    [openModalAction],
  );

  const {
    data: multiworkshopsPages,
    mutate,
    size,
    setSize,
  } = useSWRInfinite<MultiWorkshopList>(
    (index, previousPageData) => {
      if (previousPageData && !previousPageData.metadata?.continue) {
        return null;
      }
      const continueId = index === 0 ? '' : previousPageData.metadata?.continue;
      return apiPaths.MULTIWORKSHOPS({ namespace, limit: FETCH_BATCH_LIMIT, continueId });
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
      let p: MultiWorkshopList;
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
  }

  function getMultiWorkshopDisplayName(multiworkshop: MultiWorkshop): string {
    return multiworkshop.spec.displayName || multiworkshop.spec.name || multiworkshop.metadata.name;
  }

  return (
    <div onScroll={scrollHandler} className="admin-container">
      <Modal
        ref={modalAction}
        onConfirm={onMultiWorkshopDeleteConfirm}
        title={
          modalState.multiworkshop 
            ? `Delete multi-workshop ${getMultiWorkshopDisplayName(modalState.multiworkshop)}?` 
            : 'Delete selected multi-workshops? '
        }
      >
        <p>All associated workshops and provisioned services WILL NOT be deleted.</p>
      </Modal>


      <PageSection hasBodyWrapper={false} key="header" className="admin-header">
        <Split hasGutter>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">
              Multi-Workshops
            </Title>
          </SplitItem>
          <SplitItem>
            <ProjectSelector
              currentNamespaceName={namespace}
              onSelect={(n) => {
                navigate(`/admin/multiworkshops/${n.name}?${searchParams.toString()}`);
              }}
            />
          </SplitItem>
          <SplitItem>
            <KeywordSearchInput
              initialValue={keywordFilter}
              placeholder="Search..."
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
        </Split>
      </PageSection>
      {multiworkshops.length === 0 ? (
        <PageSection hasBodyWrapper={false} key="multiworkshops-list-empty">
          <EmptyState headingLevel="h1" icon={ExclamationTriangleIcon} titleText="No multi-workshops found." variant="full">
            <EmptyStateFooter>
              {keywordFilter ? (
                <EmptyStateBody>No multi-workshops matched search.</EmptyStateBody>
              ) : (
                <EmptyStateBody>
                  Create multi-workshops using the API.
                </EmptyStateBody>
              )}
            </EmptyStateFooter>
          </EmptyState>
        </PageSection>
      ) : (
        <PageSection hasBodyWrapper={false} key="body" className="admin-body">
          <SelectableTable
            columns={['Name', 'Service Namespace', 'Assets', 'Seats', 'Start provisioning date', 'End Date', 'Created At', 'Actions']}
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

              const cells: any[] = [];
              cells.push(
                // Name
                <>
                  <Link
                    key="multiworkshops"
                    to={`/event-wizard/${multiworkshop.metadata.namespace}/${multiworkshop.metadata.name}`}
                  >
                    {getMultiWorkshopDisplayName(multiworkshop)}
                  </Link>
                  <OpenshiftConsoleLink key="console" resource={multiworkshop} />
                </>,
                // Project
                <>
                  <Link key="service-namespace" to={`/services/${multiworkshop.metadata.namespace}`}>
                    {multiworkshop.metadata.namespace}
                  </Link>
                  <OpenshiftConsoleLink key="console" resource={multiworkshop} linkToNamespace={true} />
                </>,
                // Assets
                <>{multiworkshop.spec.assets ? multiworkshop.spec.assets.length : 0}</>,
                // Seats
                <>{multiworkshop.spec.numberSeats || 'N/A'}</>,
                // Start Date
                <>
                  {multiworkshop.spec.startDate ? (
                    <LocalTimestamp key="start-timestamp" timestamp={multiworkshop.spec.startDate} />
                  ) : (
                    'N/A'
                  )}
                </>,
                // End Date
                <>
                  {multiworkshop.spec.endDate ? (
                    <LocalTimestamp key="end-timestamp" timestamp={multiworkshop.spec.endDate} />
                  ) : (
                    'N/A'
                  )}
                </>,
                // Created At
                <>
                  <LocalTimestamp key="timestamp" timestamp={multiworkshop.metadata.creationTimestamp} />
                  <br key="break" />
                  (<TimeInterval key="interval" toTimestamp={multiworkshop.metadata.creationTimestamp} />)
                </>,
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
      <Footer />
    </div>
  );
};

export default MultiWorkshops;
