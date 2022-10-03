import React, { useCallback, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import useSWR, { useSWRConfig } from 'swr';
import useSWRInfinite from 'swr/infinite';
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
  Button,
} from '@patternfly/react-core';
import {
  DollarSignIcon,
  ExclamationTriangleIcon,
  OutlinedClockIcon,
  StopIcon,
  PlayIcon,
  TrashIcon,
  CogIcon,
} from '@patternfly/react-icons';
import {
  apiPaths,
  deleteResourceClaim,
  fetcher,
  scheduleStopForAllResourcesInResourceClaim,
  setLifespanEndForResourceClaim,
  startAllResourcesInResourceClaim,
  stopAllResourcesInResourceClaim,
} from '@app/api';
import { NamespaceList, ResourceClaim, ResourceClaimList, ServiceNamespace } from '@app/types';
import KeywordSearchInput from '@app/components/KeywordSearchInput';
import LabInterfaceLink from '@app/components/LabInterfaceLink';
import LoadingIcon from '@app/components/LoadingIcon';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import TimeInterval from '@app/components/TimeInterval';
import {
  checkResourceClaimCanStart,
  checkResourceClaimCanStop,
  displayName,
  BABYLON_DOMAIN,
  keywordMatch,
  compareK8sObjects,
  getCostTracker,
  FETCH_BATCH_LIMIT,
} from '@app/util';
import ButtonCircleIcon from '@app/components/ButtonCircleIcon';
import ServiceNamespaceSelect from './ServiceNamespaceSelect';
import ServiceStatus from './ServiceStatus';
import SelectableTable from '@app/components/SelectableTable';
import ServiceActions from './ServiceActions';
import Modal, { useModal } from '@app/Modal/Modal';
import ServicesAction from './ServicesAction';
import ServicesScheduleAction from './ServicesScheduleAction';
import LocalTimestamp from '@app/components/LocalTimestamp';
import CostTrackerDialog from '@app/components/CostTrackerDialog';
import useSession from '@app/utils/useSession';
import { getMostRelevantResourceAndTemplate } from './service-utils';
import Footer from '@app/components/Footer';

import './services-list.css';

const ServicesList: React.FC<{
  serviceNamespaceName: string;
}> = ({ serviceNamespaceName }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, serviceNamespaces: sessionServiceNamespaces } = useSession().getSession();
  const view = serviceNamespaceName ? 'default' : 'admin';
  const urlSearchParams = new URLSearchParams(location.search);
  const { cache } = useSWRConfig();
  const keywordFilter = urlSearchParams.has('search')
    ? urlSearchParams
        .get('search')
        .trim()
        .split(/ +/)
        .filter((w) => w != '')
    : null;

  // As admin we need to fetch service namespaces for the service namespace dropdown
  const enableFetchUserNamespaces: boolean = isAdmin;
  const [modalState, setModalState] = useState<{
    action?: string;
    resourceClaim?: ResourceClaim;
  }>({});
  const [modalAction, openModalAction] = useModal();
  const [modalScheduleAction, openModalScheduleAction] = useModal();
  const [modalGetCost, openModalGetCost] = useModal();
  const [selectedUids, setSelectedUids] = useState<string[]>([]);

  const { data: userNamespaceList } = useSWR<NamespaceList>(
    enableFetchUserNamespaces ? apiPaths.NAMESPACES({ labelSelector: 'usernamespace.gpte.redhat.com/user-uid' }) : '',
    fetcher
  );
  const serviceNamespaces: ServiceNamespace[] = useMemo(() => {
    return enableFetchUserNamespaces
      ? userNamespaceList.items.map((ns): ServiceNamespace => {
          return {
            name: ns.metadata.name,
            displayName: ns.metadata.annotations['openshift.io/display-name'] || ns.metadata.name,
          };
        })
      : sessionServiceNamespaces;
  }, [enableFetchUserNamespaces, sessionServiceNamespaces, userNamespaceList]);
  const serviceNamespace: ServiceNamespace = serviceNamespaces.find((ns) => ns.name === serviceNamespaceName) || {
    name: serviceNamespaceName,
    displayName: serviceNamespaceName,
  };

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
      return apiPaths.RESOURCE_CLAIMS({ namespace: serviceNamespaceName, limit: FETCH_BATCH_LIMIT, continueId });
    },
    fetcher,
    {
      refreshInterval: 8000,
      revalidateFirstPage: true,
      revalidateAll: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      compare: (currentData: any, newData: any) => {
        if (currentData === newData) return true;
        if (!currentData || currentData.length === 0) return false;
        if (!newData || newData.length === 0) return false;
        if (currentData.length !== newData.length) return false;
        for (let i = 0; i < currentData.length; i++) {
          if (!compareK8sObjects(currentData[i].items, newData[i].items)) return false;
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
    },
    [keywordFilter, isAdmin]
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
        const workshopProvisionName = resourceClaim.metadata?.labels?.[`${BABYLON_DOMAIN}/workshop-provision`];
        const isPartOfWorkshop = !!workshopProvisionName;
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
    ({ modal, action, resourceClaim }: { modal: string; action?: string; resourceClaim?: ResourceClaim }) => {
      if (modal === 'action') {
        setModalState({ action, resourceClaim });
        openModalAction();
      }
      if (modal === 'scheduleAction') {
        setModalState({ action, resourceClaim });
        openModalScheduleAction();
      }
      if (modal === 'getCost') {
        setModalState({ resourceClaim });
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

  if (serviceNamespaces.length === 0) {
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

  if (serviceNamespaces.length === 1 && !serviceNamespaceName) {
    return <Navigate to={`/services/${serviceNamespaces[0].name}`} />;
  }

  return (
    <div onScroll={scrollHandler} style={{ display: 'flex', flexDirection: 'column', overflow: 'auto', flexGrow: 1 }}>
      <Modal ref={modalAction} onConfirm={onModalAction} passModifiers={true}>
        <ServicesAction action={modalState.action} resourceClaim={modalState.resourceClaim} />
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
      {serviceNamespaces.length > 1 ? (
        <PageSection key="topbar" className="services-list__topbar" variant={PageSectionVariants.light}>
          <ServiceNamespaceSelect
            currentNamespaceName={serviceNamespaceName}
            serviceNamespaces={serviceNamespaces}
            onSelect={(namespaceName) => {
              if (namespaceName) {
                navigate(`/services/${namespaceName}${location.search}`);
              } else {
                navigate(`/services${location.search}`);
              }
            }}
          />
        </PageSection>
      ) : null}
      <PageSection key="head" className="services-list__head" variant={PageSectionVariants.light}>
        <Split hasGutter>
          <SplitItem isFilled>
            {serviceNamespaces.length > 1 && serviceNamespaceName ? (
              <Breadcrumb>
                <BreadcrumbItem
                  render={({ className }) => (
                    <Link to="/services" className={className}>
                      Services
                    </Link>
                  )}
                />
                <BreadcrumbItem>{serviceNamespace?.displayName || serviceNamespaceName}</BreadcrumbItem>
              </Breadcrumb>
            ) : (
              <Breadcrumb>
                <BreadcrumbItem>Services</BreadcrumbItem>
              </Breadcrumb>
            )}
          </SplitItem>
          <SplitItem>
            <KeywordSearchInput
              initialValue={keywordFilter}
              placeholder="Search..."
              onSearch={(value) => {
                if (value) {
                  urlSearchParams.set('search', value.join(' '));
                } else if (urlSearchParams.has('search')) {
                  urlSearchParams.delete('search');
                }
                navigate(`${location.pathname}?${urlSearchParams.toString()}`);
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
            ) : sessionServiceNamespaces.find((ns) => ns.name == serviceNamespaceName) ? (
              <EmptyStateBody>
                Request services using the <Link to="/catalog">catalog</Link>.
              </EmptyStateBody>
            ) : null}
          </EmptyState>
        </PageSection>
      ) : (
        <PageSection key="body" className="services-list" variant={PageSectionVariants.light}>
          <SelectableTable
            columns={
              view === 'admin'
                ? ['Project', 'Name', 'GUID', 'Status', 'Created At', 'Actions']
                : ['Name', 'Status', 'Created At', 'Auto-stop', 'Auto-destroy', 'Actions']
            }
            onSelectAll={(isSelected) => {
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
              const workshopProvisionName = resourceClaim.metadata?.labels?.[`${BABYLON_DOMAIN}/workshop-provision`];
              const isPartOfWorkshop = !!workshopProvisionName;
              const rcServiceNamespace = serviceNamespaces.find(
                (ns: ServiceNamespace) => ns.name === resourceClaim.metadata.namespace
              );
              // Find lab user interface information either in the resource claim or inside resources
              // associated with the provisioned service.
              const labUserInterfaceData =
                resourceClaim?.metadata?.annotations?.[`${BABYLON_DOMAIN}/labUserInterfaceData`] ||
                resources
                  .map((r) =>
                    r?.kind === 'AnarchySubject'
                      ? r?.spec?.vars?.provision_data?.lab_ui_data
                      : r?.data?.labUserInterfaceData
                  )
                  .map((j) => (typeof j === 'string' ? JSON.parse(j) : j))
                  .find((u) => u != null);
              const labUserInterfaceMethod =
                resourceClaim?.metadata?.annotations?.[`${BABYLON_DOMAIN}/labUserInterfaceMethod`] ||
                resources
                  .map((r) =>
                    r?.kind === 'AnarchySubject'
                      ? r?.spec?.vars?.provision_data?.lab_ui_method
                      : r?.data?.labUserInterfaceMethod
                  )
                  .find((u) => u != null);
              const labUserInterfaceUrl =
                resourceClaim?.metadata?.annotations?.[`${BABYLON_DOMAIN}/labUserInterfaceUrl`] ||
                resources
                  .map((r) => {
                    const data = r?.kind === 'AnarchySubject' ? r.spec?.vars?.provision_data : r?.data;
                    return data?.labUserInterfaceUrl || data?.lab_ui_url || data?.bookbag_url;
                  })
                  .find((u) => u != null);

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
                  navigate(
                    `/workshops/${rcServiceNamespace?.displayName || resourceClaim.metadata.namespace}/${workshopName}`
                  );
              }

              const projectCell = (
                // Poject
                <React.Fragment key="project">
                  <Link key="services" to={`/services/${resourceClaim.metadata.namespace}`}>
                    {rcServiceNamespace?.displayName || resourceClaim.metadata.namespace}
                  </Link>
                  {isAdmin ? (
                    <OpenshiftConsoleLink key="console" resource={resourceClaim} linkToNamespace={true} />
                  ) : null}
                </React.Fragment>
              );

              const guidCell = (
                // GUID
                <React.Fragment key="guid">
                  {guid ? (
                    isAdmin ? (
                      [
                        <Link key="admin" to={`/admin/resourcehandles/${resourceHandle.name}`}>
                          {guid}
                        </Link>,
                        <OpenshiftConsoleLink key="console" reference={resourceHandle} />,
                      ]
                    ) : (
                      guid
                    )
                  ) : (
                    <p>-</p>
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
                  {isAdmin ? <OpenshiftConsoleLink key="name__console" resource={resourceClaim} /> : null}
                </React.Fragment>
              );
              const statusCell = (
                // Status
                <React.Fragment key="status">
                  {specResources.length >= 1 ? (
                    <ServiceStatus
                      creationTime={Date.parse(resourceClaim.metadata.creationTimestamp)}
                      resource={getMostRelevantResourceAndTemplate(resourceClaim)?.resource}
                      resourceTemplate={getMostRelevantResourceAndTemplate(resourceClaim)?.template}
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

              const autoStopCell = (
                // Auto-stop
                <span key="auto-stop">
                  {resourceClaim.status?.resources?.[0]?.state?.spec?.vars?.action_schedule ? (
                    <Button
                      variant="control"
                      icon={<OutlinedClockIcon />}
                      iconPosition="right"
                      isDisabled={!checkResourceClaimCanStop(resourceClaim) || isPartOfWorkshop}
                      onClick={actionHandlers.runtime}
                      className="services-list__schedule-btn"
                      isSmall={true}
                    >
                      <LocalTimestamp
                        date={
                          new Date(
                            Math.min(
                              ...resourceClaim.spec.resources
                                .map((specResource, idx) => {
                                  const statusResource = resourceClaim.status.resources[idx];
                                  const stopTimestamp =
                                    specResource.template?.spec?.vars?.action_schedule?.stop ||
                                    statusResource.state.spec.vars.action_schedule.stop;
                                  if (stopTimestamp) {
                                    return Date.parse(stopTimestamp);
                                  } else {
                                    return null;
                                  }
                                })
                                .filter((time) => time !== null)
                            )
                          )
                        }
                        variant="short"
                      />
                    </Button>
                  ) : (
                    <p>-</p>
                  )}
                </span>
              );

              const autoDestroyCell = (
                // Auto-destroy
                <span key="auto-destroy">
                  {resourceClaim.status?.lifespan?.end ? (
                    <Button
                      variant="control"
                      isDisabled={!resourceClaim.status?.lifespan || isPartOfWorkshop}
                      onClick={actionHandlers.lifespan}
                      icon={<OutlinedClockIcon />}
                      iconPosition="right"
                      className="services-list__schedule-btn"
                      isSmall={true}
                    >
                      <LocalTimestamp
                        variant="short"
                        date={new Date(resourceClaim.spec.lifespan?.end || resourceClaim.status.lifespan.end)}
                      />
                    </Button>
                  ) : (
                    <p>-</p>
                  )}
                </span>
              );

              const actionsCell = (
                // Actions
                <React.Fragment key="actions">
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      gap: 'var(--pf-global--spacer--sm)',
                    }}
                  >
                    {!isPartOfWorkshop ? (
                      <>
                        <ButtonCircleIcon
                          isDisabled={!checkResourceClaimCanStart(resourceClaim)}
                          onClick={actionHandlers.start}
                          description="Start"
                          icon={PlayIcon}
                          key="actions__start"
                        />
                        <ButtonCircleIcon
                          isDisabled={!checkResourceClaimCanStop(resourceClaim)}
                          onClick={actionHandlers.stop}
                          description="Stop"
                          icon={StopIcon}
                          key="actions__stop"
                        />
                      </>
                    ) : (
                      <ButtonCircleIcon
                        onClick={actionHandlers.manageWorkshop}
                        description="Manage Workshop"
                        icon={CogIcon}
                        key="actions__manage-workshop"
                      />
                    )}
                    <ButtonCircleIcon
                      key="actions__delete"
                      onClick={actionHandlers.delete}
                      description="Delete"
                      icon={TrashIcon}
                    />
                    {actionHandlers.getCost ? (
                      <ButtonCircleIcon
                        key="actions__cost"
                        onClick={actionHandlers.getCost}
                        description="Get amount spent"
                        icon={DollarSignIcon}
                      />
                    ) : null}
                    {
                      // Lab Interface
                      labUserInterfaceUrl ? (
                        <LabInterfaceLink
                          key="actions__lab-interface"
                          url={labUserInterfaceUrl}
                          data={labUserInterfaceData}
                          method={labUserInterfaceMethod}
                          variant="circle"
                        />
                      ) : null
                    }
                  </div>
                </React.Fragment>
              );

              const adminActionsCell = (
                // Actions
                <React.Fragment key="admin-actions">
                  <ServiceActions
                    position="right"
                    resourceClaim={resourceClaim}
                    actionHandlers={actionHandlers}
                    iconOnly={true}
                  />
                </React.Fragment>
              );

              return {
                cells:
                  view === 'admin'
                    ? [projectCell, nameCell, guidCell, statusCell, createdAtCell, adminActionsCell]
                    : [nameCell, statusCell, createdAtCell, autoStopCell, autoDestroyCell, actionsCell],
                onSelect: (isSelected) =>
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

export default ServicesList;
