import React, { useCallback, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import useSWR, { useSWRConfig } from 'swr';
import {
  Breadcrumb,
  BreadcrumbItem,
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
  deleteWorkshop,
  fetcherItemsInAllPages,
  scheduleStopForAllResourcesInResourceClaim,
  SERVICES_KEY,
  setLifespanEndForResourceClaim,
  setWorkshopLifespanEnd,
  startAllResourcesInResourceClaim,
  startWorkshopServices,
  stopAllResourcesInResourceClaim,
  stopWorkshop,
} from '@app/api';
import { ResourceClaim, Service, ServiceActionActions, Workshop, WorkshopWithResourceClaims } from '@app/types';
import KeywordSearchInput from '@app/components/KeywordSearchInput';
import {
  checkResourceClaimCanStart,
  checkResourceClaimCanStop,
  displayName,
  BABYLON_DOMAIN,
  keywordMatch,
  compareK8sObjectsArr,
  FETCH_BATCH_LIMIT,
  isResourceClaimPartOfWorkshop,
  isWorkshopPartOfResourceClaim,
} from '@app/util';
import SelectableTable from '@app/components/SelectableTable';
import Modal, { useModal } from '@app/Modal/Modal';
import CostTrackerDialog from '@app/components/CostTrackerDialog';
import useSession from '@app/utils/useSession';
import Footer from '@app/components/Footer';
import ProjectSelector from '@app/components/ProjectSelector';
import ServicesAction from './ServicesAction';
import ServiceActions from './ServiceActions';
import ServicesScheduleAction from './ServicesScheduleAction';
import renderResourceClaimRow from './renderResourceClaimRow';
import renderWorkshopRow from './renderWorkshopRow';

import './services-list.css';

function setResourceClaims(workshop: Workshop, resourceClaims: ResourceClaim[]) {
  const workshopWithResourceClaims: WorkshopWithResourceClaims = workshop;
  workshopWithResourceClaims.resourceClaims = resourceClaims;
  return workshopWithResourceClaims;
}

async function fetchServices(namespace: string, canLoadWorkshops: boolean): Promise<Service[]> {
  async function fetchResourceClaims(namespace: string) {
    return (await fetcherItemsInAllPages((continueId) =>
      apiPaths.RESOURCE_CLAIMS({ namespace, limit: FETCH_BATCH_LIMIT, continueId })
    )) as ResourceClaim[];
  }
  async function fetchWorksops(namespace: string) {
    return await fetcherItemsInAllPages((continueId) =>
      apiPaths.WORKSHOPS({ namespace, limit: FETCH_BATCH_LIMIT, continueId })
    ).then(async (workshops: Workshop[]) => {
      const workshopsEnrichedPromise: Promise<WorkshopWithResourceClaims>[] = [];
      const workshopsEnriched: WorkshopWithResourceClaims[] = [];
      for (const workshop of workshops) {
        const _workshopEnriched: WorkshopWithResourceClaims = workshop;
        workshopsEnrichedPromise.push(
          fetcherItemsInAllPages((continueId) =>
            apiPaths.RESOURCE_CLAIMS({
              namespace: workshop.metadata.namespace,
              labelSelector: `${BABYLON_DOMAIN}/workshop=${workshop.metadata.name}`,
              limit: FETCH_BATCH_LIMIT,
              continueId,
            })
          ).then((r) => setResourceClaims(workshop, r))
        );
        workshopsEnriched.push(_workshopEnriched);
      }
      await Promise.all(workshopsEnrichedPromise);
      return workshopsEnriched;
    });
  }
  const services: Service[] = [];
  const promises = [];
  promises.push(fetchResourceClaims(namespace).then((r) => services.push(...r)));
  if (canLoadWorkshops) {
    promises.push(fetchWorksops(namespace).then((w) => services.push(...w)));
  }
  await Promise.all(promises);
  return services;
}

const ServicesList: React.FC<{
  serviceNamespaceName: string;
}> = ({ serviceNamespaceName }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, serviceNamespaces: sessionServiceNamespaces } = useSession().getSession();
  const { cache } = useSWRConfig();
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
    [searchParams.get('search')]
  );
  const [modalState, setModalState] = useState<{
    action: ServiceActionActions;
    resourceClaim?: ResourceClaim;
    workshop?: WorkshopWithResourceClaims;
    rating?: { rate: number; comment: string };
    submitDisabled: false;
  }>({ action: null, submitDisabled: false });
  const [modalAction, openModalAction] = useModal();
  const [modalScheduleAction, openModalScheduleAction] = useModal();
  const [modalGetCost, openModalGetCost] = useModal();
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const canLoadWorkshops =
    isAdmin || sessionServiceNamespaces.find((n) => n.name === serviceNamespaceName)?.workshopProvisionAccess;
  const { data: _services, mutate } = useSWR<Service[]>(
    SERVICES_KEY({ namespace: serviceNamespaceName }),
    () => fetchServices(serviceNamespaceName, canLoadWorkshops),
    {
      refreshInterval: 8000,
      revalidateOnMount: true,
      compare: (currentData, newData) => {
        const servicesEquals = compareK8sObjectsArr(currentData, newData);
        const currentWorkshops = (currentData ?? []).filter(
          (x) => x.kind === 'Workshop'
        ) as WorkshopWithResourceClaims[];
        const newWorkshops = (newData ?? []).filter((x) => x.kind === 'Workshop') as WorkshopWithResourceClaims[];
        const currentWorkshopsResourceClaims = currentWorkshops.flatMap((x) => x.resourceClaims);
        const newWorkshopsResourceClaims = newWorkshops.flatMap((x) => x.resourceClaims);
        const instancesEquals = compareK8sObjectsArr(currentWorkshopsResourceClaims, newWorkshopsResourceClaims);
        return servicesEquals && instancesEquals;
      },
    }
  );

  const filterFn = useCallback(
    (service: Service) => {
      if (service.kind === 'ResourceClaim') {
        const resourceClaim = service as ResourceClaim;
        const isPartOfWorkshop = isResourceClaimPartOfWorkshop(resourceClaim);
        if (isPartOfWorkshop) {
          return false;
        }
        if (!isAdmin && resourceClaim.spec.resources[0].provider?.name === 'babylon-service-request-configmap') {
          return false;
        }
        if (!keywordFilter) {
          return true;
        }
        for (const keyword of keywordFilter) {
          if (!keywordMatch(resourceClaim, keyword)) {
            return false;
          }
        }
        return true;
      }
      if (service.kind === 'Workshop') {
        const workshop = service as Workshop;
        const isPartOfResourceClaim = isWorkshopPartOfResourceClaim(workshop);
        if (isPartOfResourceClaim) {
          return false;
        }
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
      }
      return false;
    },
    [keywordFilter, isAdmin]
  );

  const services = useMemo(
    () =>
      _services
        .filter(filterFn)
        .sort(
          (a, b) => new Date(b.metadata.creationTimestamp).valueOf() - new Date(a.metadata.creationTimestamp).valueOf()
        ),
    [filterFn, _services]
  );

  const revalidate = useCallback(
    ({ updatedItems, action }: { updatedItems: Service[]; action: 'update' | 'delete' }) => {
      const servicesCpy = JSON.parse(JSON.stringify(services));
      for (const updatedItem of updatedItems) {
        const foundIndex = services.findIndex((r) => r.metadata.uid === updatedItem.metadata.uid);
        if (foundIndex > -1) {
          if (action === 'update') {
            servicesCpy[foundIndex] = updatedItem;
          } else if (action === 'delete') {
            servicesCpy.splice(foundIndex, 1);
          }
          mutate(servicesCpy);
        }
      }
    },
    [mutate, services]
  );

  const onModalScheduleAction = useCallback(
    async (date: Date): Promise<void> => {
      let updatedItems: Service[] = [];
      if (modalState.resourceClaim) {
        updatedItems.push(
          modalState.action === 'retirement'
            ? await setLifespanEndForResourceClaim(modalState.resourceClaim, date)
            : await scheduleStopForAllResourcesInResourceClaim(modalState.resourceClaim, date)
        );
      } else if (modalState.workshop) {
        updatedItems.push(
          setResourceClaims(
            modalState.action === 'retirement'
              ? await setWorkshopLifespanEnd(modalState.workshop, date)
              : await stopWorkshop(modalState.workshop, date),
            modalState.workshop.resourceClaims
          )
        );
      }
      revalidate({ updatedItems, action: 'update' });
    },
    [modalState.action, modalState.resourceClaim, modalState.workshop, revalidate]
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
        if (isPartOfWorkshop) return resourceClaim; // If has a workshopProvision -> Do nothing.
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

  const performModalActionForWorkshop = useCallback(
    async (workshop: WorkshopWithResourceClaims): Promise<WorkshopWithResourceClaims> => {
      if (modalState.action === 'delete') {
        return await deleteWorkshop(workshop);
      } else {
        if (Array.isArray(workshop.resourceClaims)) {
          if (modalState.action === 'start') {
            return await startWorkshopServices(workshop, workshop.resourceClaims);
          } else if (modalState.action === 'stop') {
            return await stopWorkshop(workshop);
          }
        }
        return Promise.resolve(null);
      }
    },
    [cache, modalState.action, modalState.workshop, revalidate, mutate]
  );

  const onModalAction = useCallback(async (): Promise<void> => {
    const serviceUpdates: Service[] = [];
    if (modalState.resourceClaim) {
      serviceUpdates.push(await performModalActionForResourceClaim(modalState.resourceClaim));
    } else if (modalState.workshop) {
      serviceUpdates.push(
        setResourceClaims(await performModalActionForWorkshop(modalState.workshop), modalState.workshop.resourceClaims)
      );
    }
    if (selectedUids.length > 0) {
      for (const service of services) {
        if (selectedUids.includes(service.metadata.uid)) {
          if (service.kind === 'ResourceClaim') {
            serviceUpdates.push(await performModalActionForResourceClaim(service as ResourceClaim));
          }
          if (service.kind === 'Workshop') {
            const _workshop = service as WorkshopWithResourceClaims;
            serviceUpdates.push(
              setResourceClaims(await performModalActionForWorkshop(_workshop), _workshop.resourceClaims)
            );
          }
        }
      }
    }
    if (modalState.action === 'delete') {
      revalidate({ updatedItems: serviceUpdates, action: 'delete' });
    } else {
      revalidate({ updatedItems: serviceUpdates, action: 'update' });
    }
  }, [
    modalState.action,
    modalState.resourceClaim,
    modalState.workshop,
    performModalActionForResourceClaim,
    performModalActionForWorkshop,
    services,
    revalidate,
    selectedUids,
  ]);

  const showModal = useCallback(
    ({
      modal,
      action,
      resourceClaim,
      workshop,
    }: {
      modal: string;
      action?: ServiceActionActions;
      resourceClaim?: ResourceClaim;
      workshop?: Workshop;
    }) => {
      if (modal === 'action') {
        setModalState({ ...modalState, action, resourceClaim, workshop });
        openModalAction();
      }
      if (modal === 'scheduleAction') {
        setModalState({ ...modalState, action, resourceClaim, workshop });
        openModalScheduleAction();
      }
      if (modal === 'getCost') {
        setModalState({ ...modalState, action, resourceClaim, workshop: null });
        openModalGetCost();
      }
    },
    [openModalAction, openModalGetCost, openModalScheduleAction]
  );

  if (sessionServiceNamespaces.length === 0) {
    return (
      <>
        <PageSection>
          <EmptyState variant="full">
            <EmptyStateIcon icon={ExclamationTriangleIcon} />
            <Title headingLevel="h1" size="lg">
              No Service Access
            </Title>
            <EmptyStateBody>Your account has no access to services.</EmptyStateBody>
          </EmptyState>
        </PageSection>
        <Footer />
      </>
    );
  }

  if (!serviceNamespaceName) {
    if (sessionServiceNamespaces.length >= 1) {
      return <Navigate to={`/services/${sessionServiceNamespaces[0].name}`} />;
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'auto', flexGrow: 1 }}>
      <Modal ref={modalAction} onConfirm={onModalAction} passModifiers={true}>
        <ServicesAction actionState={modalState} />
      </Modal>
      <Modal ref={modalScheduleAction} onConfirm={onModalScheduleAction} passModifiers={true}>
        <ServicesScheduleAction
          action={modalState.action === 'retirement' ? 'retirement' : 'stop'}
          resourceClaim={modalState.resourceClaim}
          workshop={modalState.workshop}
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
      {isAdmin || sessionServiceNamespaces.length > 1 ? (
        <PageSection key="topbar" className="services-list__topbar" variant={PageSectionVariants.light}>
          <ProjectSelector
            currentNamespaceName={serviceNamespaceName}
            onSelect={(namespace) => {
              if (namespace) {
                navigate(`/services/${namespace.name}${location.search}`);
              }
            }}
            isPlain={true}
          />
        </PageSection>
      ) : null}
      <PageSection key="head" className="services-list__head" variant={PageSectionVariants.light}>
        <Split hasGutter>
          <SplitItem isFilled>
            <Breadcrumb>
              <BreadcrumbItem>Services</BreadcrumbItem>
            </Breadcrumb>
          </SplitItem>
          <SplitItem>
            <KeywordSearchInput
              initialValue={keywordFilter}
              placeholder="Search..."
              onSearch={(value) => {
                if (value && Array.isArray(value)) {
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
      {services.length === 0 ? (
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
        <PageSection key="body" className="services-list" variant={PageSectionVariants.light}>
          <SelectableTable
            columns={
              isAdmin
                ? ['Name', 'GUID', 'Status', 'Created At', 'Auto-stop', 'Auto-destroy', 'Actions']
                : ['Name', 'Status', 'Created At', 'Auto-stop', 'Auto-destroy', 'Actions']
            }
            onSelectAll={(isSelected) => {
              if (isSelected) {
                setSelectedUids(services.map((s) => s.metadata.uid));
              } else {
                setSelectedUids([]);
              }
            }}
            rows={services.map((service: Service) => {
              const selectObj = {
                onSelect: (isSelected: boolean) =>
                  setSelectedUids((uids: string[]) => {
                    if (isSelected) {
                      if (uids.includes(service.metadata.uid)) {
                        return uids;
                      } else {
                        return [...uids, service.metadata.uid];
                      }
                    } else {
                      return uids.filter((uid) => uid !== service.metadata.uid);
                    }
                  }),
                selected: selectedUids.includes(service.metadata.uid),
              };
              if (service.kind === 'ResourceClaim') {
                return Object.assign(
                  selectObj,
                  renderResourceClaimRow({
                    resourceClaim: service as ResourceClaim,
                    showModal,
                    isAdmin,
                    navigate,
                  })
                );
              }
              if (service.kind === 'Workshop') {
                return Object.assign(
                  selectObj,
                  renderWorkshopRow({ workshop: service as Workshop, showModal, isAdmin })
                );
              }
              return null;
            })}
          />
        </PageSection>
      )}
      <Footer />
    </div>
  );
};

export default ServicesList;
