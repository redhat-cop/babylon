import React, { useCallback, useMemo, useState } from 'react';
import { ErrorBoundary, useErrorHandler } from 'react-error-boundary';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';
import Editor from '@monaco-editor/react';
import yaml from 'js-yaml';
import {
  Breadcrumb,
  BreadcrumbItem,
  Bullseye,
  EmptyState,
  EmptyStateBody,
  EmptyStateIcon,
  PageSection,
  PageSectionVariants,
  Split,
  SplitItem,
  Tabs,
  Tab,
  TabTitleText,
  Title,
} from '@patternfly/react-core';
import {
  apiPaths,
  dateToApiString,
  deleteResourceClaim,
  deleteWorkshop,
  fetcher,
  fetcherItemsInAllPages,
  patchWorkshop,
  patchWorkshopProvision,
  scheduleStopForAllResourcesInResourceClaim,
  setLifespanEndForResourceClaim,
  startAllResourcesInResourceClaim,
  stopAllResourcesInResourceClaim,
} from '@app/api';
import { NamespaceList, ResourceClaim, ServiceNamespace, Workshop, WorkshopProvision } from '@app/types';
import { BABYLON_DOMAIN, compareK8sObjects, displayName, FETCH_BATCH_LIMIT } from '@app/util';
import WorkshopActions from './WorkshopActions';
import WorkshopsItemDetails from './WorkshopsItemDetails';
import WorkshopsItemProvisioning from './WorkshopsItemProvisioning';
import WorkshopsItemServices from './WorkshopsItemServices';
import WorkshopsItemUserAssignments from './WorkshopsItemUserAssignments';
import ServiceNamespaceSelect from '@app/Services/ServiceNamespaceSelect';
import Modal, { useModal } from '@app/Modal/Modal';
import ResourceClaimDeleteModal from '@app/components/ResourceClaimDeleteModal';
import useSWR, { useSWRConfig } from 'swr';
import CostTrackerDialog from '@app/components/CostTrackerDialog';
import useSession from '@app/utils/useSession';
import WorkshopScheduleAction from './WorkshopScheduleAction';
import { checkWorkshopCanStart, checkWorkshopCanStop, isWorkshopStarted } from './workshops-utils';
import WorkshopActionModal from '@app/components/WorkshopActionModal';
import Footer from '@app/components/Footer';

import './workshops-item.css';

export interface ModalState {
  action?:
    | 'delete'
    | 'deleteService'
    | 'startServices'
    | 'stopServices'
    | 'getCost'
    | 'scheduleDelete'
    | 'scheduleStop'
    | 'scheduleStart'
    | 'startWorkshop';
  resourceClaims?: ResourceClaim[];
}

const WorkshopsItemComponent: React.FC<{
  activeTab: string;
  serviceNamespaceName: string;
  workshopName: string;
}> = ({ activeTab, serviceNamespaceName, workshopName }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, serviceNamespaces: sessionServiceNamespaces } = useSession().getSession();
  const [modalState, setModalState] = useState<ModalState>({});
  const [modalAction, openModalAction] = useModal();
  const [modalDelete, openModalDelete] = useModal();
  const [modalGetCost, openModalGetCost] = useModal();
  const [modalSchedule, openModalSchedule] = useModal();
  const { cache } = useSWRConfig();
  const [selectedResourceClaims, setSelectedResourceClaims] = useState<ResourceClaim[]>([]);
  const showModal = useCallback(
    ({ action, resourceClaims }: ModalState) => {
      setModalState({ action, resourceClaims });
      if (action === 'delete') {
        openModalDelete();
      } else if (
        action === 'deleteService' ||
        action === 'startServices' ||
        action === 'stopServices' ||
        action === 'startWorkshop'
      ) {
        openModalAction();
      } else if (action === 'getCost') {
        openModalGetCost();
      } else if (action === 'scheduleDelete' || action === 'scheduleStop' || action === 'scheduleStart') {
        openModalSchedule();
      }
    },
    [openModalAction, openModalDelete, openModalGetCost, openModalSchedule]
  );
  const enableFetchUserNamespaces = isAdmin;
  const { data: userNamespaceList } = useSWR<NamespaceList>(
    enableFetchUserNamespaces ? apiPaths.NAMESPACES({ labelSelector: 'usernamespace.gpte.redhat.com/user-uid' }) : '',
    fetcher
  );
  const serviceNamespaces = useMemo(() => {
    return enableFetchUserNamespaces
      ? userNamespaceList.items.map((ns): ServiceNamespace => {
          return {
            name: ns.metadata.name,
            displayName: ns.metadata.annotations['openshift.io/display-name'] || ns.metadata.name,
          };
        })
      : sessionServiceNamespaces;
  }, [enableFetchUserNamespaces, sessionServiceNamespaces, userNamespaceList]);
  const serviceNamespace = serviceNamespaces.find((ns) => ns.name === serviceNamespaceName) || {
    name: serviceNamespaceName,
    displayName: serviceNamespaceName,
  };

  const {
    data: workshop,
    mutate: mutateWorkshop,
    error,
  } = useSWR<Workshop>(
    workshopName ? apiPaths.WORKSHOP({ namespace: serviceNamespaceName, workshopName }) : null,
    fetcher,
    { refreshInterval: 8000 }
  );
  useErrorHandler(error);

  const { data: workshopProvisions, mutate: mutateWorkshopProvisions } = useSWR<WorkshopProvision[]>(
    apiPaths.WORKSHOP_PROVISIONS({
      workshopName: workshop.metadata.name,
      namespace: workshop.metadata.namespace,
    }),
    () =>
      fetcherItemsInAllPages((continueId) =>
        apiPaths.WORKSHOP_PROVISIONS({
          workshopName: workshop.metadata.name,
          namespace: workshop.metadata.namespace,
          limit: FETCH_BATCH_LIMIT,
          continueId,
        })
      )
  );

  const { data: resourceClaims, mutate } = useSWR<ResourceClaim[]>(
    apiPaths.RESOURCE_CLAIMS({
      namespace: serviceNamespaceName,
      labelSelector: `${BABYLON_DOMAIN}/workshop=${workshop.metadata.name}`,
      limit: FETCH_BATCH_LIMIT,
    }),
    () =>
      fetcherItemsInAllPages((continueId) =>
        apiPaths.RESOURCE_CLAIMS({
          namespace: serviceNamespaceName,
          labelSelector: `${BABYLON_DOMAIN}/workshop=${workshop.metadata.name}`,
          limit: FETCH_BATCH_LIMIT,
          continueId,
        })
      ),
    {
      refreshInterval: 8000,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      compare: (currentData: any, newData: any) => {
        if (currentData === newData) return true;
        if (!currentData || currentData.length === 0) return false;
        if (!newData || newData.length === 0) return false;
        if (currentData.length !== newData.length) return false;
        if (!compareK8sObjects(currentData, newData)) return false;
        return true;
      },
    }
  );

  const revalidate = useCallback(
    ({ updatedItems, action }: { updatedItems: ResourceClaim[]; action: 'update' | 'delete' }) => {
      const resourceClaimsCpy = [...resourceClaims];
      for (const updatedItem of updatedItems) {
        const foundIndex = resourceClaims.findIndex((r) => r.metadata.uid === updatedItem.metadata.uid);
        if (foundIndex > -1) {
          if (action === 'update') {
            resourceClaimsCpy[foundIndex] = updatedItem;
          } else if (action === 'delete') {
            resourceClaimsCpy.splice(foundIndex, 1);
          }
          mutate(resourceClaimsCpy);
        }
      }
    },
    [mutate, resourceClaims]
  );

  async function onServiceDeleteConfirm(): Promise<void> {
    const deleteResourceClaims = modalState.resourceClaims;
    for (const resourceClaim of deleteResourceClaims) {
      await deleteResourceClaim(resourceClaim);
      const { namespace, name: resourceClaimName } = resourceClaim.metadata;
      cache.delete(apiPaths.RESOURCE_CLAIM({ namespace, resourceClaimName }));
    }
    revalidate({ updatedItems: deleteResourceClaims, action: 'delete' });
  }

  async function onServiceStartConfirm(): Promise<void> {
    const updatedResourceClaims: ResourceClaim[] = [];
    const startResourceClaims = modalState.resourceClaims;
    for (const resourceClaim of startResourceClaims) {
      updatedResourceClaims.push(await startAllResourcesInResourceClaim(resourceClaim));
    }
    revalidate({ updatedItems: updatedResourceClaims, action: 'update' });
  }

  async function onWorkshopStartConfirm(): Promise<void> {
    const workshopProvisionsUpdated = [];
    for (const workshopProvision of workshopProvisions) {
      workshopProvisionsUpdated.push(
        await patchWorkshopProvision({
          name: workshopProvision.metadata.name,
          namespace: workshopProvision.metadata.namespace,
          patch: { spec: { lifespan: { start: dateToApiString(new Date()) } } },
        })
      );
    }
    mutateWorkshopProvisions(workshopProvisionsUpdated);
  }

  async function onServiceStopConfirm(): Promise<void> {
    const updatedResourceClaims: ResourceClaim[] = [];
    const stopResourceClaims = modalState.resourceClaims;
    for (const resourceClaim of stopResourceClaims) {
      updatedResourceClaims.push(await stopAllResourcesInResourceClaim(resourceClaim));
    }
    revalidate({ updatedItems: updatedResourceClaims, action: 'update' });
  }

  async function onWorkshopDeleteConfirm(): Promise<void> {
    await deleteWorkshop(workshop);
    mutateWorkshop(null);
    mutateWorkshopProvisions(null);
    mutate(null);
    navigate(`/workshops/${serviceNamespaceName}`);
  }

  async function onModalScheduleAction(date: Date): Promise<void> {
    if (modalState.action === 'scheduleDelete') {
      const resourceClaimsUpdated = [];
      const patch = { spec: { lifespan: { end: dateToApiString(date) } } };
      const workshopUpdated = await patchWorkshop({
        name: workshop.metadata.name,
        namespace: workshop.metadata.namespace,
        patch,
      });
      mutateWorkshop(workshopUpdated);
      for (const resourceClaim of modalState.resourceClaims) {
        resourceClaimsUpdated.push(await setLifespanEndForResourceClaim(resourceClaim, date, false));
      }
      revalidate({ updatedItems: resourceClaimsUpdated, action: 'update' });
    } else if (modalState.action === 'scheduleStop') {
      const resourceClaimsUpdated = [];
      for (const resourceClaim of modalState.resourceClaims) {
        resourceClaimsUpdated.push(await scheduleStopForAllResourcesInResourceClaim(resourceClaim, date));
      }
      revalidate({ updatedItems: resourceClaimsUpdated, action: 'update' });
    } else if (modalState.action === 'scheduleStart') {
      const workshopProvisionsUpdated = [];
      const patch = { spec: { lifespan: { start: dateToApiString(date) } } };
      for (const workshopProvision of workshopProvisions) {
        workshopProvisionsUpdated.push(
          await patchWorkshopProvision({
            name: workshopProvision.metadata.name,
            namespace: workshopProvision.metadata.namespace,
            patch,
          })
        );
      }
      mutateWorkshopProvisions(workshopProvisionsUpdated);
    }
  }

  return (
    <>
      <Modal
        ref={modalDelete}
        onConfirm={onWorkshopDeleteConfirm}
        title={workshop ? `Delete workshop ${displayName(workshop)}?` : 'Delete selected workshops?'}
      >
        <p>Provisioned services will be deleted.</p>
      </Modal>

      <Modal ref={modalAction} passModifiers={true} onConfirm={() => null}>
        {modalState?.action === 'deleteService' ? (
          <ResourceClaimDeleteModal onConfirm={onServiceDeleteConfirm} resourceClaims={modalState.resourceClaims} />
        ) : modalState?.action === 'startServices' ? (
          <WorkshopActionModal onConfirm={onServiceStartConfirm} action="start" />
        ) : modalState?.action === 'stopServices' ? (
          <WorkshopActionModal onConfirm={onServiceStopConfirm} action="stop" />
        ) : modalState?.action === 'startWorkshop' ? (
          <WorkshopActionModal onConfirm={onWorkshopStartConfirm} action="start" />
        ) : null}
      </Modal>
      <Modal ref={modalGetCost} onConfirm={() => null} type="ack">
        <CostTrackerDialog resourceClaim={modalState.resourceClaims?.[0]} />
      </Modal>
      <Modal ref={modalSchedule} onConfirm={onModalScheduleAction} passModifiers={true} title={workshopName}>
        <WorkshopScheduleAction
          action={
            modalState.action === 'scheduleDelete'
              ? 'retirement'
              : modalState.action === 'scheduleStart'
              ? 'start'
              : 'stop'
          }
          workshop={workshop}
          resourceClaims={resourceClaims}
          workshopProvisions={workshopProvisions}
        />
      </Modal>
      {isAdmin || serviceNamespaces.length > 1 ? (
        <PageSection key="topbar" className="workshops-item__topbar" variant={PageSectionVariants.light}>
          <ServiceNamespaceSelect
            currentNamespaceName={serviceNamespaceName}
            serviceNamespaces={serviceNamespaces}
            onSelect={(namespaceName) => {
              if (namespaceName) {
                navigate(`/workshops/${namespaceName}${location.search}`);
              } else {
                navigate(`/workshops${location.search}`);
              }
            }}
          />
        </PageSection>
      ) : null}
      <PageSection key="head" className="workshops-item__head" variant={PageSectionVariants.light}>
        <Split hasGutter>
          <SplitItem isFilled>
            {isAdmin || serviceNamespaces.length > 1 ? (
              <Breadcrumb>
                <BreadcrumbItem
                  render={({ className }) => (
                    <Link to="/workshops" className={className}>
                      Workshops
                    </Link>
                  )}
                />
                <BreadcrumbItem
                  render={({ className }) => (
                    <Link to={`/workshops/${serviceNamespaceName}`} className={className}>
                      {displayName(serviceNamespace)}
                    </Link>
                  )}
                />
                <BreadcrumbItem>{workshopName}</BreadcrumbItem>
              </Breadcrumb>
            ) : (
              <Breadcrumb>
                <BreadcrumbItem
                  render={({ className }) => (
                    <Link to={`/workshops/${serviceNamespaceName}`} className={className}>
                      Workshops
                    </Link>
                  )}
                />
                <BreadcrumbItem>{workshopName}</BreadcrumbItem>
              </Breadcrumb>
            )}
            <Title headingLevel="h4" size="xl">
              {displayName(workshop)}
            </Title>
          </SplitItem>
          <SplitItem>
            <Bullseye>
              <WorkshopActions
                position="right"
                workshopName={workshop.spec.displayName}
                actionHandlers={{
                  delete: () => showModal({ action: 'delete' }),
                  deleteService:
                    selectedResourceClaims.length === 0
                      ? null
                      : () => showModal({ action: 'deleteService', resourceClaims: selectedResourceClaims }),
                  start:
                    resourceClaims.length === 0
                      ? isWorkshopStarted(workshopProvisions)
                        ? null
                        : () => showModal({ action: 'startWorkshop', resourceClaims: [] })
                      : checkWorkshopCanStart(resourceClaims)
                      ? () => showModal({ action: 'startServices', resourceClaims })
                      : null,
                  stop: checkWorkshopCanStop(resourceClaims)
                    ? () => showModal({ action: 'stopServices', resourceClaims })
                    : null,
                }}
              />
            </Bullseye>
          </SplitItem>
        </Split>
      </PageSection>
      <PageSection key="body" variant={PageSectionVariants.light} className="workshops-item__body">
        <Tabs
          activeKey={activeTab || 'details'}
          onSelect={(e, tabIndex) => navigate(`/workshops/${serviceNamespaceName}/${workshopName}/${tabIndex}`)}
        >
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
            <WorkshopsItemDetails
              onWorkshopUpdate={(workshop: Workshop) => mutateWorkshop(workshop)}
              workshop={workshop}
              showModal={showModal}
              resourceClaims={resourceClaims}
              workshopProvisions={workshopProvisions}
            />
          </Tab>
          <Tab eventKey="provision" title={<TabTitleText>Provisioning</TabTitleText>}>
            <WorkshopsItemProvisioning workshopProvisions={workshopProvisions} />
          </Tab>
          <Tab eventKey="services" title={<TabTitleText>Services</TabTitleText>}>
            <WorkshopsItemServices
              modalState={modalState}
              showModal={showModal}
              setSelectedResourceClaims={setSelectedResourceClaims}
              resourceClaims={resourceClaims}
            />
          </Tab>
          <Tab eventKey="users" title={<TabTitleText>Users</TabTitleText>}>
            <WorkshopsItemUserAssignments
              onWorkshopUpdate={(workshop: Workshop) => mutateWorkshop(workshop)}
              workshop={workshop}
            />
          </Tab>
          <Tab eventKey="yaml" title={<TabTitleText>YAML</TabTitleText>}>
            <Editor
              height="500px"
              language="yaml"
              options={{ readOnly: true }}
              theme="vs-dark"
              value={yaml.dump(workshop)}
            />
          </Tab>
        </Tabs>
      </PageSection>
    </>
  );
};

const NotFoundComponent: React.FC<{
  workshopName: string;
  serviceNamespaceName: string;
}> = ({ workshopName, serviceNamespaceName }) => (
  <EmptyState variant="full">
    <EmptyStateIcon icon={ExclamationTriangleIcon} />
    <Title headingLevel="h1" size="lg">
      Workshop not found
    </Title>
    <EmptyStateBody>
      Workshop {workshopName} was not found in {serviceNamespaceName}.
    </EmptyStateBody>
  </EmptyState>
);

const WorkshopsItem: React.FC<{
  activeTab: string;
  serviceNamespaceName: string;
  workshopName: string;
}> = ({ activeTab, serviceNamespaceName, workshopName }) => (
  <ErrorBoundary
    fallbackRender={() => (
      <>
        <NotFoundComponent workshopName={workshopName} serviceNamespaceName={serviceNamespaceName} />
        <Footer />
      </>
    )}
  >
    <WorkshopsItemComponent
      activeTab={activeTab}
      workshopName={workshopName}
      serviceNamespaceName={serviceNamespaceName}
    />
    <Footer />
  </ErrorBoundary>
);

export default WorkshopsItem;
