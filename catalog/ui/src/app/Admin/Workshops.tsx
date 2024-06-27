import React, { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSWRConfig } from 'swr';
import useSWRInfinite from 'swr/infinite';
import {
  EmptyState,
  EmptyStateBody,
  EmptyStateIcon,
  PageSection,
  PageSectionVariants,
  Split,
  SplitItem,
  Title,
  EmptyStateHeader,
  EmptyStateFooter,
} from '@patternfly/react-core';
import TrashIcon from '@patternfly/react-icons/dist/js/icons/trash-icon';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import { apiPaths, deleteWorkshop, fetcher } from '@app/api';
import { Workshop, WorkshopList } from '@app/types';
import { compareK8sObjectsArr, displayName, FETCH_BATCH_LIMIT } from '@app/util';
import Footer from '@app/components/Footer';
import KeywordSearchInput from '@app/components/KeywordSearchInput';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';
import ButtonCircleIcon from '@app/components/ButtonCircleIcon';
import Modal, { useModal } from '@app/Modal/Modal';
import WorkshopActions from '@app/Workshops/WorkshopActions';
import ProjectSelector from '@app/components/ProjectSelector';

import './admin.css';

function keywordMatch(workshop: Workshop, keyword: string): boolean {
  const keywordLowerCased = keyword.toLowerCase();
  if (
    workshop.metadata.name.includes(keywordLowerCased) ||
    workshop.metadata.namespace.includes(keywordLowerCased) ||
    (workshop.spec.description && workshop.spec.description.toLowerCase().includes(keywordLowerCased)) ||
    displayName(workshop).toLowerCase().includes(keywordLowerCased)
  ) {
    return true;
  }
  return false;
}

const Workshops: React.FC<{}> = () => {
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
  const [modalState, setModalState] = useState<{ action?: string; workshop?: Workshop }>({});
  const [selectedUids, setSelectedUids] = useState([]);
  const { cache } = useSWRConfig();
  const showModal = useCallback(
    ({ action, workshop }: { action: string; workshop?: Workshop }) => {
      setModalState({ action, workshop });
      openModalAction();
    },
    [openModalAction],
  );

  const {
    data: workshopsPages,
    mutate,
    size,
    setSize,
  } = useSWRInfinite<WorkshopList>(
    (index, previousPageData) => {
      if (previousPageData && !previousPageData.metadata?.continue) {
        return null;
      }
      const continueId = index === 0 ? '' : previousPageData.metadata?.continue;
      return apiPaths.WORKSHOPS({ namespace, limit: FETCH_BATCH_LIMIT, continueId });
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
  const isReachingEnd = workshopsPages && !workshopsPages[workshopsPages.length - 1].metadata.continue;
  const isLoadingInitialData = !workshopsPages;
  const isLoadingMore =
    isLoadingInitialData || (size > 0 && workshopsPages && typeof workshopsPages[size - 1] === 'undefined');

  const revalidate = useCallback(
    ({ updatedItems, action }: { updatedItems: Workshop[]; action: 'update' | 'delete' }) => {
      const workshopsPagesCpy = JSON.parse(JSON.stringify(workshopsPages));
      let p: WorkshopList;
      let i: number;
      for ([i, p] of workshopsPagesCpy.entries()) {
        for (const updatedItem of updatedItems) {
          const foundIndex = p.items.findIndex((r) => r.metadata.uid === updatedItem.metadata.uid);
          if (foundIndex > -1) {
            if (action === 'update') {
              workshopsPagesCpy[i].items[foundIndex] = updatedItem;
            } else if (action === 'delete') {
              workshopsPagesCpy[i].items.splice(foundIndex, 1);
            }
            mutate(workshopsPagesCpy);
          }
        }
      }
    },
    [mutate, workshopsPages],
  );
  const filterWorkshop = useCallback(
    (workshop: Workshop): boolean => {
      // Hide anything pending deletion
      if (workshop.metadata.deletionTimestamp) {
        return false;
      }
      if (keywordFilter) {
        for (const keyword of keywordFilter) {
          if (!keywordMatch(workshop, keyword)) {
            return false;
          }
        }
      }
      return true;
    },
    [keywordFilter],
  );

  const workshops: Workshop[] = useMemo(
    () => [].concat(...workshopsPages.map((page) => page.items)).filter(filterWorkshop) || [],
    [filterWorkshop, workshopsPages],
  );

  // Trigger continue fetching more resource claims on scroll.
  const scrollHandler = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollable = e.currentTarget;
    const scrollRemaining = scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight;
    if (scrollRemaining < 500 && !isReachingEnd && !isLoadingMore) {
      setSize(size + 1);
    }
  };

  async function onWorkshopDeleteConfirm(): Promise<void> {
    const deletedWorkshops: Workshop[] = [];
    if (modalState.workshop) {
      await deleteWorkshop(modalState.workshop);
      deletedWorkshops.push(modalState.workshop);
    } else {
      for (const workshop of workshops) {
        if (selectedUids.includes(workshop.metadata.uid)) {
          await deleteWorkshop(workshop);
          cache.delete(
            apiPaths.WORKSHOP({
              namespace: workshop.metadata.namespace,
              workshopName: workshop.metadata.name,
            }),
          );
          deletedWorkshops.push(workshop);
        }
      }
    }
    revalidate({ updatedItems: deletedWorkshops, action: 'delete' });
  }

  return (
    <div onScroll={scrollHandler} className="admin-container">
      <Modal
        ref={modalAction}
        onConfirm={onWorkshopDeleteConfirm}
        title={
          modalState.workshop ? `Delete workshop ${displayName(modalState.workshop)}?` : 'Delete selected workshops?'
        }
      >
        <p>Provisioned services will be deleted.</p>
      </Modal>
      <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
        <Split hasGutter>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">
              Workshops
            </Title>
          </SplitItem>
          <SplitItem>
            <ProjectSelector
              currentNamespaceName={namespace}
              onSelect={(n) => {
                navigate(`/admin/workshops/${n.name}?${searchParams.toString()}`);
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
            <WorkshopActions
              isDisabled={selectedUids.length === 0}
              position="right"
              workshopName="Selected"
              actionHandlers={{
                delete: () => showModal({ action: 'delete' }),
              }}
            />
          </SplitItem>
        </Split>
      </PageSection>
      {workshops.length === 0 ? (
        <PageSection key="workshops-list-empty">
          <EmptyState variant="full">
            <EmptyStateHeader
              titleText="No workshops found."
              icon={<EmptyStateIcon icon={ExclamationTriangleIcon} />}
              headingLevel="h1"
            />
            <EmptyStateFooter>
              {keywordFilter ? (
                <EmptyStateBody>No workshops matched search.</EmptyStateBody>
              ) : (
                <EmptyStateBody>
                  Request workshops using the <Link to="/catalog">catalog</Link>.
                </EmptyStateBody>
              )}
            </EmptyStateFooter>
          </EmptyState>
        </PageSection>
      ) : (
        <PageSection key="body" variant={PageSectionVariants.light} className="admin-body">
          <SelectableTable
            columns={['Name', 'Service Namespace', 'Registration', 'Created At', 'Actions']}
            onSelectAll={(isSelected: boolean) => {
              if (isSelected) {
                setSelectedUids(workshops.map((workshop) => workshop.metadata.uid));
              } else {
                setSelectedUids([]);
              }
            }}
            rows={workshops.map((workshop: Workshop) => {
              const actionHandlers = {
                delete: () => showModal({ action: 'delete', workshop }),
              };
              const ownerReference = workshop.metadata?.ownerReferences?.[0];
              const owningResourceClaimName =
                ownerReference && ownerReference.kind === 'ResourceClaim' ? ownerReference.name : null;

              const cells: any[] = [];
              cells.push(
                // Name
                <>
                  <Link
                    key="workshops"
                    to={
                      owningResourceClaimName
                        ? `/services/${workshop.metadata.namespace}/${owningResourceClaimName}/workshop`
                        : `/workshops/${workshop.metadata.namespace}/${workshop.metadata.name}`
                    }
                  >
                    {displayName(workshop)}
                  </Link>
                  <OpenshiftConsoleLink key="console" resource={workshop} />
                </>,
                // Project
                <>
                  <Link key="service-namespace" to={`/services/${workshop.metadata.namespace}`}>
                    {workshop.metadata.namespace}
                  </Link>
                  <OpenshiftConsoleLink key="console" resource={workshop} linkToNamespace={true} />
                </>,
                // Registration
                <>{workshop.spec.openRegistration === false ? 'Pre-registration' : 'Open'}</>,
                // Created At
                <>
                  <LocalTimestamp key="timestamp" timestamp={workshop.metadata.creationTimestamp} />
                  <br key="break" />
                  (<TimeInterval key="interval" toTimestamp={workshop.metadata.creationTimestamp} />)
                </>,
                // Actions
                <React.Fragment key="actions">
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      gap: 'var(--pf-v5-global--spacer--sm)',
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
                      if (uids.includes(workshop.metadata.uid)) {
                        return uids;
                      } else {
                        return [...uids, workshop.metadata.uid];
                      }
                    } else {
                      return uids.filter((uid) => uid !== workshop.metadata.uid);
                    }
                  }),
                selected: selectedUids.includes(workshop.metadata.uid),
              };
            })}
          />
        </PageSection>
      )}
      <Footer />
    </div>
  );
};

export default Workshops;
