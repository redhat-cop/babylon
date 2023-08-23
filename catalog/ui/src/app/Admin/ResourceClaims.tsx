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
} from '@patternfly/react-core';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import {
  apiPaths,
  deleteResourceClaim,
  fetcher,
  scheduleStopForAllResourcesInResourceClaim,
  scheduleStopResourceClaim,
  setLifespanEndForResourceClaim,
  startAllResourcesInResourceClaim,
  stopAllResourcesInResourceClaim,
} from '@app/api';
import { ResourceClaim, ResourceClaimList, ServiceActionActions } from '@app/types';
import KeywordSearchInput from '@app/components/KeywordSearchInput';
import LoadingIcon from '@app/components/LoadingIcon';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import TimeInterval from '@app/components/TimeInterval';
import {
  checkResourceClaimCanStart,
  checkResourceClaimCanStop,
  displayName,
  BABYLON_DOMAIN,
  getCostTracker,
  FETCH_BATCH_LIMIT,
  compareK8sObjectsArr,
  isResourceClaimPartOfWorkshop,
} from '@app/util';
import SelectableTable from '@app/components/SelectableTable';
import Modal, { useModal } from '@app/Modal/Modal';
import CostTrackerDialog from '@app/components/CostTrackerDialog';
import Footer from '@app/components/Footer';
import { getMostRelevantResourceAndTemplate } from '@app/Services/service-utils';
import ServicesAction from '@app/Services/ServicesAction';
import ServiceActions from '@app/Services/ServiceActions';
import ServicesScheduleAction from '@app/Services/ServicesScheduleAction';
import ServiceStatus from '@app/Services/ServiceStatus';
import ProjectSelector from '@app/components/ProjectSelector';

import './admin.css';

function keywordMatch(r: ResourceClaim, keyword: string): boolean {
  const keywordLowerCased = keyword.toLowerCase();
  const resourceHandleName = r.status?.resourceHandle?.name;
  const guid = resourceHandleName ? resourceHandleName.replace(/^guid-/, '') : null;
  if (r.metadata.name.includes(keywordLowerCased)) {
    return true;
  }
  if (r.metadata.namespace.includes(keywordLowerCased)) {
    return true;
  }
  if (displayName(r).toLowerCase().includes(keywordLowerCased)) {
    return true;
  }
  if (guid && guid.includes(keywordLowerCased)) {
    return true;
  }
  return false;
}
const ResourceClaims: React.FC<{}> = () => {
  const navigate = useNavigate();
  const { namespace } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { cache } = useSWRConfig();
  const keywordFilter = useMemo(
    () =>
      searchParams.has('search')
        ? searchParams
            .get('search')
            .trim()
            .split(/ +/)
            .filter((w) => w != '')
        : null,
    [searchParams.get('search')]
  );
  const [modalState, setModalState] = useState<{
    action: ServiceActionActions;
    resourceClaim?: ResourceClaim;
    rating?: { rate: number; useful: 'yes' | 'no' | 'not applicable'; comment: string };
    submitDisabled: false;
  }>({ action: null, submitDisabled: false });
  const [modalAction, openModalAction] = useModal();
  const [modalScheduleAction, openModalScheduleAction] = useModal();
  const [modalGetCost, openModalGetCost] = useModal();
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const {
    data: resourceClaimsPages,
    mutate,
    size,
    setSize,
  } = useSWRInfinite<ResourceClaimList>(
    (index, previousPageData: ResourceClaimList) => {
      if (previousPageData && !previousPageData.metadata?.continue) {
        return null;
      }
      const continueId = index === 0 ? '' : previousPageData.metadata?.continue;
      return apiPaths.RESOURCE_CLAIMS({ namespace, limit: FETCH_BATCH_LIMIT, continueId });
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
    ({ updatedItems, action }: { updatedItems: ResourceClaim[]; action: 'update' | 'delete' }) => {
      const resourceClaimsPagesCpy = JSON.parse(JSON.stringify(resourceClaimsPages));
      let p: ResourceClaimList;
      let i: number;
      for ([i, p] of resourceClaimsPagesCpy.entries()) {
        for (const updatedItem of updatedItems) {
          const foundIndex = p.items.findIndex((r) => r.metadata.uid === updatedItem.metadata.uid);
          if (foundIndex > -1) {
            if (action === 'update') {
              resourceClaimsPagesCpy[i].items[foundIndex] = updatedItem;
            } else if (action === 'delete') {
              resourceClaimsPagesCpy[i].items.splice(foundIndex, 1);
            }
            mutate(resourceClaimsPagesCpy);
          }
        }
      }
    },
    [mutate, resourceClaimsPages]
  );
  const isReachingEnd = resourceClaimsPages && !resourceClaimsPages[resourceClaimsPages.length - 1].metadata.continue;
  const isLoadingInitialData = !resourceClaimsPages;
  const isLoadingMore =
    isLoadingInitialData || (size > 0 && resourceClaimsPages && typeof resourceClaimsPages[size - 1] === 'undefined');

  const filterResourceClaim = useCallback(
    (resourceClaim: ResourceClaim) => {
      if (!keywordFilter) {
        return true;
      }
      for (const keyword of keywordFilter) {
        if (!keywordMatch(resourceClaim, keyword)) {
          return false;
        }
      }
      return true;
    },
    [keywordFilter]
  );

  const resourceClaims: ResourceClaim[] = useMemo(
    () => [].concat(...resourceClaimsPages.map((page) => page.items)).filter(filterResourceClaim) || [],
    [filterResourceClaim, resourceClaimsPages]
  );

  // Trigger continue fetching more resource claims on scroll.
  const scrollHandler = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollable = e.currentTarget;
    const scrollRemaining = scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight;
    if (scrollRemaining < 500 && !isReachingEnd && !isLoadingMore) {
      setSize(size + 1);
    }
  };

  const onModalScheduleAction = useCallback(
    async (date: Date): Promise<void> => {
      const resourceClaimUpdate: ResourceClaim =
        modalState.action === 'retirement'
          ? await setLifespanEndForResourceClaim(modalState.resourceClaim, date)
          : modalState.resourceClaim.status?.summary
          ? await scheduleStopResourceClaim(modalState.resourceClaim)
          : await scheduleStopForAllResourcesInResourceClaim(modalState.resourceClaim, date);
      revalidate({ updatedItems: [resourceClaimUpdate], action: 'update' });
    },
    [modalState.action, modalState.resourceClaim, revalidate]
  );

  const performModalActionForResourceClaim = useCallback(
    async (resourceClaim: ResourceClaim): Promise<ResourceClaim> => {
      if (modalState.action === 'delete') {
        cache.delete(
          apiPaths.RESOURCE_CLAIM({
            namespace: resourceClaim.metadata.namespace,
            resourceClaimName: resourceClaim.metadata.name,
          })
        );
        return await deleteResourceClaim(resourceClaim);
      } else {
        const isPartOfWorkshop = isResourceClaimPartOfWorkshop(resourceClaim);
        if (isPartOfWorkshop) return resourceClaim;
        if (modalState.action === 'start' && checkResourceClaimCanStart(resourceClaim)) {
          return await startAllResourcesInResourceClaim(resourceClaim);
        } else if (modalState.action === 'stop' && checkResourceClaimCanStop(resourceClaim)) {
          return await stopAllResourcesInResourceClaim(resourceClaim);
        }
      }

      console.warn(`Unkown action ${modalState.action}`);
      return resourceClaim;
    },
    [cache, modalState.action]
  );

  const onModalAction = useCallback(async (): Promise<void> => {
    const resourceClaimUpdates: ResourceClaim[] = [];
    if (modalState.resourceClaim) {
      resourceClaimUpdates.push(await performModalActionForResourceClaim(modalState.resourceClaim));
    } else {
      for (const resourceClaim of resourceClaims) {
        if (selectedUids.includes(resourceClaim.metadata.uid)) {
          resourceClaimUpdates.push(await performModalActionForResourceClaim(resourceClaim));
        }
      }
    }
    if (modalState.action === 'delete') {
      revalidate({ updatedItems: resourceClaimUpdates, action: 'delete' });
    } else {
      revalidate({ updatedItems: resourceClaimUpdates, action: 'update' });
    }
  }, [
    modalState.action,
    modalState.resourceClaim,
    performModalActionForResourceClaim,
    resourceClaims,
    revalidate,
    selectedUids,
  ]);

  const showModal = useCallback(
    ({
      modal,
      action,
      resourceClaim,
    }: {
      modal: string;
      action?: ServiceActionActions;
      resourceClaim?: ResourceClaim;
    }) => {
      if (modal === 'action') {
        setModalState({ action, resourceClaim, submitDisabled: false });
        openModalAction();
      }
      if (modal === 'scheduleAction') {
        setModalState({ action, resourceClaim, submitDisabled: false });
        openModalScheduleAction();
      }
      if (modal === 'getCost') {
        setModalState({ action, resourceClaim, submitDisabled: false });
        openModalGetCost();
      }
    },
    [openModalAction, openModalGetCost, openModalScheduleAction]
  );

  // Fetch all if keywordFilter is defined.
  if (
    keywordFilter &&
    resourceClaimsPages.length > 0 &&
    resourceClaimsPages[resourceClaimsPages.length - 1].metadata.continue
  ) {
    if (!isLoadingMore) {
      if (resourceClaims.length > 0) {
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
      <Modal ref={modalAction} onConfirm={onModalAction} passModifiers={true}>
        <ServicesAction actionState={modalState} />
      </Modal>
      <Modal ref={modalScheduleAction} onConfirm={onModalScheduleAction} passModifiers={true}>
        <ServicesScheduleAction
          action={modalState.action === 'retirement' ? 'retirement' : 'stop'}
          resourceClaim={modalState.resourceClaim}
        />
      </Modal>
      <Modal
        ref={modalGetCost}
        onConfirm={() => null}
        type="ack"
        title={`Amount spent on ${displayName(modalState.resourceClaim)}`}
      >
        <CostTrackerDialog resourceClaim={modalState.resourceClaim} />
      </Modal>
      <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
        <Split hasGutter>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">
              ResourceClaims
            </Title>
          </SplitItem>
          <SplitItem>
            <ProjectSelector
              currentNamespaceName={namespace}
              onSelect={(n) => {
                navigate(`/admin/resourceclaims/${n.name}?${searchParams.toString()}`);
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
            <ServiceActions
              isDisabled={selectedUids.length === 0}
              position="right"
              serviceName="Selected"
              actionHandlers={{
                delete: () => showModal({ modal: 'action', action: 'delete' }),
                start: () => showModal({ modal: 'action', action: 'start' }),
                stop: () => showModal({ modal: 'action', action: 'stop' }),
              }}
            />
          </SplitItem>
        </Split>
      </PageSection>
      {resourceClaims.length === 0 && isReachingEnd ? (
        <PageSection key="body-empty">
          <EmptyState variant="full">
            <EmptyStateIcon icon={ExclamationTriangleIcon} />
            <Title headingLevel="h1" size="lg">
              No Services found
            </Title>
            {keywordFilter ? (
              <EmptyStateBody>No services matched search.</EmptyStateBody>
            ) : (
              <EmptyStateBody>
                Request services using the <Link to="/catalog">catalog</Link>.
              </EmptyStateBody>
            )}
          </EmptyState>
        </PageSection>
      ) : (
        <PageSection key="body" variant={PageSectionVariants.light} className="admin-body">
          <SelectableTable
            columns={['Name', 'Service Namespace', 'GUID', 'Status', 'Created At', 'Actions']}
            onSelectAll={(isSelected: boolean) => {
              if (isSelected) {
                setSelectedUids(resourceClaims.map((resourceClaim) => resourceClaim.metadata.uid));
              } else {
                setSelectedUids([]);
              }
            }}
            rows={resourceClaims.map((resourceClaim: ResourceClaim) => {
              const resourceHandle = resourceClaim.status?.resourceHandle;
              const specResources = resourceClaim.spec.resources || [];
              const resources = (resourceClaim.status?.resources || []).map((r) => r.state);
              const guid = resourceHandle?.name ? resourceHandle.name.replace(/^guid-/, '') : null;
              const workshopName = resourceClaim.metadata?.labels?.[`${BABYLON_DOMAIN}/workshop`];
              const isPartOfWorkshop = isResourceClaimPartOfWorkshop(resourceClaim);
              const costTracker = getCostTracker(resourceClaim);
              // Available actions depends on kind of service
              const actionHandlers = {
                delete: () => showModal({ action: 'delete', modal: 'action', resourceClaim }),
                lifespan: () => showModal({ action: 'retirement', modal: 'scheduleAction', resourceClaim }),
                runtime: null,
                start: null,
                stop: null,
                getCost: null,
                manageWorkshop: null,
              };
              if (resources.find((r) => r?.kind === 'AnarchySubject')) {
                actionHandlers['runtime'] = () => showModal({ action: 'stop', modal: 'scheduleAction', resourceClaim });
                actionHandlers['start'] = () => showModal({ action: 'start', modal: 'action', resourceClaim });
                actionHandlers['stop'] = () => showModal({ action: 'stop', modal: 'action', resourceClaim });
              }
              if (costTracker) {
                actionHandlers['getCost'] = () => showModal({ modal: 'getCost', resourceClaim });
              }
              if (isPartOfWorkshop) {
                actionHandlers['manageWorkshop'] = () =>
                  navigate(`/workshops/${resourceClaim.metadata.namespace}/${workshopName}`);
              }

              const projectCell = (
                // Poject
                <React.Fragment key="service-namespace">
                  <Link key="services" to={`/services/${resourceClaim.metadata.namespace}`}>
                    {resourceClaim.metadata.namespace}
                  </Link>
                  <OpenshiftConsoleLink key="console" resource={resourceClaim} linkToNamespace={true} />
                </React.Fragment>
              );

              const guidCell = (
                // GUID
                <React.Fragment key="guid">
                  {guid ? (
                    resourceHandle ? (
                      <>
                        <Link key="admin" to={`/admin/resourcehandles/${resourceHandle.name}`}>
                          {guid}
                        </Link>
                        <OpenshiftConsoleLink key="console" reference={resourceHandle} />
                      </>
                    ) : (
                      guid
                    )
                  ) : (
                    '-'
                  )}
                </React.Fragment>
              );

              const nameCell = (
                // Name
                <React.Fragment key="name">
                  <Link
                    key="name__link"
                    to={`/services/${resourceClaim.metadata.namespace}/${resourceClaim.metadata.name}`}
                  >
                    {displayName(resourceClaim)}
                  </Link>
                  <OpenshiftConsoleLink key="name__console" resource={resourceClaim} />
                </React.Fragment>
              );
              const statusCell = (
                // Status
                <React.Fragment key="status">
                  {specResources.length >= 1 ? (
                    <ServiceStatus
                      creationTime={Date.parse(resourceClaim.metadata.creationTimestamp)}
                      resource={getMostRelevantResourceAndTemplate(resourceClaim).resource}
                      resourceTemplate={getMostRelevantResourceAndTemplate(resourceClaim).template}
                      resourceClaim={resourceClaim}
                      summary={resourceClaim.status?.summary}
                    />
                  ) : (
                    <p>...</p>
                  )}
                </React.Fragment>
              );
              const createdAtCell = (
                // Created At
                <React.Fragment key="interval">
                  <TimeInterval toTimestamp={resourceClaim.metadata.creationTimestamp} />
                </React.Fragment>
              );

              const adminActionsCell = (
                // Actions
                <div>
                  <ServiceActions
                    position="right"
                    resourceClaim={resourceClaim}
                    actionHandlers={actionHandlers}
                    iconOnly
                    key="admin-actions"
                  />
                </div>
              );

              return {
                cells: [nameCell, projectCell, guidCell, statusCell, createdAtCell, adminActionsCell],
                onSelect: (isSelected: boolean) =>
                  setSelectedUids((uids) => {
                    if (isSelected) {
                      if (uids.includes(resourceClaim.metadata.uid)) {
                        return uids;
                      } else {
                        return [...uids, resourceClaim.metadata.uid];
                      }
                    } else {
                      return uids.filter((uid) => uid !== resourceClaim.metadata.uid);
                    }
                  }),
                selected: selectedUids.includes(resourceClaim.metadata.uid),
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

export default ResourceClaims;
