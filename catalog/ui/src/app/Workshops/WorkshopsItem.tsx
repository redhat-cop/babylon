import React, { useCallback, useMemo, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useNavigate, useLocation, Link, useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import yaml from 'js-yaml';
import useSWR, { useSWRConfig } from 'swr';
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
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import {
  apiPaths,
  dateToApiString,
  deleteResourceClaim,
  deleteWorkshop,
  fetcher,
  fetcherItemsInAllPages,
  setWorkshopLifespanEnd,
  startWorkshop,
  startWorkshopServices,
  stopWorkshop,
} from '@app/api';
import { NamespaceList, ResourceClaim, ServiceNamespace, Workshop, WorkshopProvision } from '@app/types';
import { BABYLON_DOMAIN, compareK8sObjects, displayName, FETCH_BATCH_LIMIT, getStageFromK8sObject } from '@app/util';
import useSession from '@app/utils/useSession';
import CostTrackerDialog from '@app/components/CostTrackerDialog';
import ServiceNamespaceSelect from '@app/components/ServiceNamespaceSelect';
import Modal, { useModal } from '@app/Modal/Modal';
import Footer from '@app/components/Footer';
import ResourceClaimDeleteModal from '@app/components/ResourceClaimDeleteModal';
import WorkshopActionModal from '@app/components/WorkshopActionModal';
import WorkshopActions from './WorkshopActions';
import WorkshopsItemDetails from './WorkshopsItemDetails';
import WorkshopsItemProvisioning from './WorkshopsItemProvisioning';
import WorkshopsItemServices from './WorkshopsItemServices';
import WorkshopsItemUserAssignments from './WorkshopsItemUserAssignments';
import WorkshopScheduleAction from './WorkshopScheduleAction';
import { checkWorkshopCanStart, checkWorkshopCanStop, isWorkshopStarted } from './workshops-utils';
import Label from '@app/components/Label';

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
  const { isAdmin, serviceNamespaces: sessionServiceNamespaces, workshopNamespaces } = useSession().getSession();
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
  const enableManageWorkshopProvisions =
    isAdmin || workshopNamespaces.find((ns) => ns.name == serviceNamespaceName) ? true : false;
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

  const { data: workshop, mutate: mutateWorkshop } = useSWR<Workshop>(
    apiPaths.WORKSHOP({ namespace: serviceNamespaceName, workshopName }),
    fetcher,
    {
      refreshInterval: 8000,
    }
  );
  const stage = getStageFromK8sObject(workshop);

  const { data: workshopProvisions, mutate: mutateWorkshopProvisions } = useSWR<WorkshopProvision[]>(
    apiPaths.WORKSHOP_PROVISIONS({
      workshopName: workshop.metadata.name,
      namespace: workshop.metadata.namespace,
      limit: 'ALL',
    }),
    () =>
      enableManageWorkshopProvisions
        ? fetcherItemsInAllPages((continueId) =>
            apiPaths.WORKSHOP_PROVISIONS({
              workshopName: workshop.metadata.name,
              namespace: workshop.metadata.namespace,
              limit: FETCH_BATCH_LIMIT,
              continueId,
            })
          )
        : []
  );

  const { data: resourceClaims, mutate } = useSWR<ResourceClaim[]>(
    apiPaths.RESOURCE_CLAIMS({
      namespace: serviceNamespaceName,
      labelSelector: `${BABYLON_DOMAIN}/workshop=${workshop.metadata.name}`,
      limit: 'ALL',
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
      compare: (currentData, newData) => {
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

  /**
   * After confirmmation, delete selected ResourceClaims (services) for Workshop.
   * Replacement services may be created by the workshop-manager depending upon
   * WorkshopProvision configuration.
   */
  async function onServiceDeleteConfirm(): Promise<void> {
    const deleteResourceClaims = modalState.resourceClaims;
    for (const resourceClaim of deleteResourceClaims) {
      await deleteResourceClaim(resourceClaim);
      const { namespace, name: resourceClaimName } = resourceClaim.metadata;
      cache.delete(apiPaths.RESOURCE_CLAIM({ namespace, resourceClaimName }));
    }
    revalidate({ updatedItems: deleteResourceClaims, action: 'delete' });
  }

  /**
   * After confirmation, start all services in Workshop by updating action schedule of
   * the Workshop.
   * The action schedule will propagate to WorkshopProvisions and to ResourceClaims.
   */
  async function onServiceStartConfirm() {
    const workshopUpdated = await startWorkshopServices(workshop);
    mutateWorkshop(workshopUpdated);
  }

  /**
   * After confirmation, set Workshop lifespan to start immediately and set action schedule
   * for auto-stop.
   * The workshop-manager will propagate changes to WorkshopProvisions and ResourceClaims.
   */
  async function onWorkshopStartConfirm() {
    const workshopUpdated = await startWorkshop(workshop, dateToApiString(new Date()), resourceClaims);
    mutateWorkshop(workshopUpdated);
  }

  /**
   * After confirmation, set Workshop action schedule to stop immediately.
   * The workshop-manager will propagate changes to WorkshopProvisions and ResourceClaims.
   */
  async function onServiceStopConfirm() {
    const workshopUpdated = await stopWorkshop(workshop);
    mutateWorkshop(workshopUpdated);
  }

  /**
   * After confirmation, delete Workshop.
   * Deletion will propagate to WorkshopProvisions and ResourceClaims.
   */
  async function onWorkshopDeleteConfirm() {
    await deleteWorkshop(workshop);
    mutateWorkshop(null);
    mutateWorkshopProvisions(null);
    mutate(null);
    navigate(`/services/${serviceNamespaceName}`);
  }

  /**
   * Adjust lifespan or action schedule for Workshop.
   * The workshop-manager will propagate changes to WorkshopProvisions and ResourceClaims.
   */
  async function onModalScheduleAction(date: Date) {
    if (modalState.action === 'scheduleDelete') {
      const workshopUpdated = setWorkshopLifespanEnd(workshop, date);
      mutateWorkshop(workshopUpdated);
    } else if (modalState.action === 'scheduleStop') {
      const workshopUpdated = await stopWorkshop(workshop, date);
      mutateWorkshop(workshopUpdated);
    } else if (modalState.action === 'scheduleStart') {
      const workshopUpdated = await startWorkshop(
        workshop,
        !isWorkshopStarted(workshop, workshopProvisions) ? dateToApiString(date) : null,
        resourceClaims
      );
      mutateWorkshop(workshopUpdated);
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
            allowSelectAll
            isPlain
            isText
            selectWorkshopNamespace
            currentNamespaceName={serviceNamespaceName}
            onSelect={(namespace) => {
              if (namespace) {
                navigate(`/services/${namespace.name}${location.search}`);
              } else {
                navigate(`/services${location.search}`);
              }
            }}
          />
        </PageSection>
      ) : null}
      <PageSection key="head" className="workshops-item__head" variant={PageSectionVariants.light}>
        <Split hasGutter>
          <SplitItem isFilled>
            <Breadcrumb>
              <BreadcrumbItem
                render={({ className }) => (
                  <Link to={`/services/${serviceNamespaceName}`} className={className}>
                    Services
                  </Link>
                )}
              />
              <BreadcrumbItem>{workshopName}</BreadcrumbItem>
            </Breadcrumb>
            <Title headingLevel="h4" size="xl" style={{ display: 'flex', alignItems: 'center' }}>
              {displayName(workshop)}
              {stage !== 'prod' ? <Label>{stage}</Label> : null}
              <Label tooltipDescription={<div>Workshop user interface is enabled</div>}>Workshop UI</Label>
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
                      ? enableManageWorkshopProvisions && !isWorkshopStarted(workshop, workshopProvisions)
                        ? () => showModal({ action: 'startWorkshop', resourceClaims: [] })
                        : null
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
            {activeTab === 'details' ? (
              <WorkshopsItemDetails
                onWorkshopUpdate={(workshop: Workshop) => mutateWorkshop(workshop)}
                workshop={workshop}
                showModal={showModal}
                resourceClaims={resourceClaims}
                workshopProvisions={workshopProvisions}
              />
            ) : null}
          </Tab>
          {enableManageWorkshopProvisions ? (
            <Tab eventKey="provision" title={<TabTitleText>Provisioning</TabTitleText>}>
              {activeTab === 'provision' ? (
                <WorkshopsItemProvisioning workshop={workshop} workshopProvisions={workshopProvisions} />
              ) : null}
            </Tab>
          ) : null}
          <Tab eventKey="instances" title={<TabTitleText>Instances</TabTitleText>}>
            {activeTab === 'instances' ? (
              <WorkshopsItemServices
                modalState={modalState}
                showModal={showModal}
                setSelectedResourceClaims={setSelectedResourceClaims}
                resourceClaims={resourceClaims}
              />
            ) : null}
          </Tab>
          <Tab eventKey="users" title={<TabTitleText>Users</TabTitleText>}>
            {activeTab === 'users' ? (
              <WorkshopsItemUserAssignments
                onWorkshopUpdate={(workshop: Workshop) => mutateWorkshop(workshop)}
                workshop={workshop}
              />
            ) : null}
          </Tab>
          <Tab eventKey="yaml" title={<TabTitleText>YAML</TabTitleText>}>
            {activeTab === 'yaml' ? (
              <Editor
                height="500px"
                language="yaml"
                options={{ readOnly: true }}
                theme="vs-dark"
                value={yaml.dump(workshop)}
              />
            ) : null}
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

const WorkshopsItem: React.FC<{}> = ({}) => {
  const { name: workshopName, namespace: serviceNamespaceName, tab: activeTab = 'details' } = useParams();
  return (
    <ErrorBoundary
      onError={(err) => window['newrelic'] && window['newrelic'].noticeError(err)}
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
};

export default WorkshopsItem;
