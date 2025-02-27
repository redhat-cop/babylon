import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate, useLocation, Link, useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import yaml from 'js-yaml';
import useSWR, { useSWRConfig } from 'swr';
import {
  Breadcrumb,
  BreadcrumbItem,
  Bullseye,
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
  patchWorkshopProvision,
  SERVICES_KEY,
  setWorkshopLifespanEnd,
  startWorkshop,
  startWorkshopServices,
  stopWorkshop,
} from '@app/api';
import {
  NamespaceList,
  ResourceClaim,
  Workshop,
  WorkshopProvision,
  WorkshopUserAssignment,
  WorkshopUserAssignmentList,
} from '@app/types';
import {
  BABYLON_DOMAIN,
  compareK8sObjects,
  compareK8sObjectsArr,
  DEMO_DOMAIN,
  displayName,
  FETCH_BATCH_LIMIT,
  getStageFromK8sObject,
  namespaceToServiceNamespaceMapper,
} from '@app/util';
import useSession from '@app/utils/useSession';
import CostTrackerDialog from '@app/components/CostTrackerDialog';
import Modal, { useModal } from '@app/Modal/Modal';
import ResourceClaimDeleteModal from '@app/components/ResourceClaimDeleteModal';
import WorkshopActionModal from '@app/components/WorkshopActionModal';
import WorkshopActions from './WorkshopActions';
import WorkshopsItemDetails from './WorkshopsItemDetails';
import WorkshopsItemProvisioning from './WorkshopsItemProvisioning';
import WorkshopsItemServices from './WorkshopsItemServices';
import WorkshopsItemUserAssignments from './WorkshopsItemUserAssignments';
import WorkshopScheduleAction from './WorkshopScheduleAction';
import { checkWorkshopCanStart, checkWorkshopCanStop, isWorkshopLocked, isWorkshopStarted } from './workshops-utils';
import Label from '@app/components/Label';
import ProjectSelector from '@app/components/ProjectSelector';
import ErrorBoundaryPage from '@app/components/ErrorBoundaryPage';
import parseDuration from 'parse-duration';

import './workshops-item.css';

export interface ModalState {
  action?:
    | 'delete'
    | 'restartService'
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
  const { mutate } = useSWRConfig();
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
        action === 'restartService' ||
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
    isAdmin || sessionServiceNamespaces.find((ns) => ns.name == serviceNamespaceName) ? true : false;
  const { data: userNamespaceList } = useSWR<NamespaceList>(
    enableFetchUserNamespaces ? apiPaths.NAMESPACES({ labelSelector: 'usernamespace.gpte.redhat.com/user-uid' }) : '',
    fetcher
  );
  const serviceNamespaces = useMemo(() => {
    return enableFetchUserNamespaces
      ? userNamespaceList.items.map(namespaceToServiceNamespaceMapper)
      : sessionServiceNamespaces;
  }, [enableFetchUserNamespaces, sessionServiceNamespaces, userNamespaceList]);

  const { data: workshop, mutate: mutateWorkshop } = useSWR<Workshop>(
    apiPaths.WORKSHOP({ namespace: serviceNamespaceName, workshopName }),
    fetcher,
    {
      refreshInterval: 8000,
      compare: compareK8sObjects,
    }
  );
  const { data: userAssigmentsList, mutate: mutateUserAssigmentsList } = useSWR<WorkshopUserAssignmentList>(
    apiPaths.WORKSHOP_USER_ASSIGNMENTS({
      workshopName,
      namespace: serviceNamespaceName,
    }),
    fetcher,
    {
      refreshInterval: 15000,
    }
  );
  const stage = getStageFromK8sObject(workshop);

  const { data: workshopProvisions } = useSWR<WorkshopProvision[]>(
    workshop
      ? apiPaths.WORKSHOP_PROVISIONS({
          workshopName: workshop.metadata.name,
          namespace: workshop.metadata.namespace,
          limit: 'ALL',
        })
      : null,
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

  const { data: resourceClaims, mutate: mutateRC } = useSWR<ResourceClaim[]>(
    workshop
      ? apiPaths.RESOURCE_CLAIMS({
          namespace: serviceNamespaceName,
          labelSelector: `${BABYLON_DOMAIN}/workshop=${workshop.metadata.name}`,
          limit: 'ALL',
        })
      : null,
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
      compare: compareK8sObjectsArr,
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
          mutateRC(resourceClaimsCpy);
        }
      }
    },
    [mutateRC, resourceClaims]
  );

  const mutateUserAssigments = useCallback(
    (userAssigments: WorkshopUserAssignment[]) => {
      const userAssigmentsListClone = Object.assign({}, userAssigmentsList);
      userAssigmentsListClone.items = Array.from(userAssigments);
      mutateUserAssigmentsList(userAssigmentsListClone);
    },
    [mutateUserAssigmentsList, userAssigmentsList]
  );

  /**
   * After confirmmation, delete selected ResourceClaims (services) for Workshop.
   * Replacement services may be created by the workshop-manager depending upon
   * WorkshopProvision configuration.
   */
  async function onServiceDeleteConfirm(reduceWorkshopCount = false): Promise<void> {
    const deleteResourceClaims = modalState.resourceClaims;
    if (reduceWorkshopCount) {
      const count = Math.max(workshopProvisions[0].spec.count - deleteResourceClaims.length, 0);
      await patchWorkshopProvision({
        name: workshopProvisions[0].metadata.name,
        namespace: workshopProvisions[0].metadata.namespace,
        patch: { spec: { count } },
      });
      mutate(
        apiPaths.WORKSHOP_PROVISIONS({
          workshopName: workshopProvisions[0].metadata.labels['babylon.gpte.redhat.com/workshop'],
          namespace: workshopProvisions[0].metadata.namespace,
          limit: 'ALL',
        }),
      );
    }
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
    const workshopUpdated = await startWorkshop(
      workshop,
      dateToApiString(new Date()),
      dateToApiString(new Date(Date.now() + parseDuration('30h'))),
      resourceClaims
    );
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
    cache.delete(SERVICES_KEY({ namespace: workshop.metadata.namespace }));
    cache.delete(
      apiPaths.RESOURCE_CLAIMS({
        namespace: serviceNamespaceName,
        labelSelector: `${BABYLON_DOMAIN}/workshop=${workshop.metadata.name}`,
        limit: 'ALL',
      })
    );
    cache.delete(apiPaths.WORKSHOP({ namespace: serviceNamespaceName, workshopName }));
    cache.delete(
      apiPaths.WORKSHOP_PROVISIONS({
        workshopName: workshop.metadata.name,
        namespace: workshop.metadata.namespace,
        limit: 'ALL',
      })
    );
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
        !isWorkshopStarted(workshop, workshopProvisions)
          ? dateToApiString(new Date(date.getTime()))
          : null,
        !isWorkshopStarted(workshop, workshopProvisions)
          ? dateToApiString(new Date(date.getTime() + parseDuration('30h')))
          : dateToApiString(new Date(Date.now() + parseDuration('30h'))),
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
        {modalState?.action === 'restartService' ? (
          <ResourceClaimDeleteModal restart={true} onConfirm={onServiceDeleteConfirm} resourceClaims={modalState.resourceClaims} />
        ) : modalState?.action === 'deleteService' ? (
          <ResourceClaimDeleteModal onConfirm={() => onServiceDeleteConfirm(true)} resourceClaims={modalState.resourceClaims} />
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
          <ProjectSelector
            currentNamespaceName={serviceNamespaceName}
            onSelect={(namespace) => {
              if (namespace) {
                navigate(`/services/${namespace.name}${location.search}`);
              } else {
                navigate(`/services${location.search}`);
              }
            }}
            isPlain={true}
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
              {stage !== 'prod' ? <Label key="workshop-item__stage">{stage}</Label> : null}
              <Label key="workshop-item__ui" tooltipDescription={<div>Workshop user interface is enabled</div>}>
                Workshop UI
              </Label>
            </Title>
          </SplitItem>
          <SplitItem>
            <Bullseye>
              <WorkshopActions
                position="right"
                workshopName={workshop.spec.displayName}
                actionHandlers={{
                  delete: () => showModal({ action: 'delete' }),
                  restartService:
                    Array.isArray(selectedResourceClaims) && selectedResourceClaims.length === 0
                      ? null
                      : () => showModal({ action: 'restartService', resourceClaims: selectedResourceClaims }),
                  deleteService:
                    Array.isArray(selectedResourceClaims) && selectedResourceClaims.length === 0
                      ? null
                      : () => showModal({ action: 'deleteService', resourceClaims: selectedResourceClaims }),
                  start:
                    Array.isArray(resourceClaims) && resourceClaims.length === 0
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
                isLocked={isWorkshopLocked(workshop, isAdmin)}
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
          {/* @ts-ignore */}
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
            {activeTab === 'details' ? (
              <WorkshopsItemDetails
                onWorkshopUpdate={(workshop: Workshop) => mutateWorkshop(workshop)}
                workshop={workshop}
                showModal={showModal}
                resourceClaims={resourceClaims}
                workshopProvisions={workshopProvisions}
                workshopUserAssignments={userAssigmentsList.items}
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
          {/* @ts-ignore */}
          <Tab eventKey="instances" title={<TabTitleText>Instances</TabTitleText>}>
            {activeTab === 'instances' ? (
              <WorkshopsItemServices
                modalState={modalState}
                showModal={showModal}
                setSelectedResourceClaims={setSelectedResourceClaims}
                resourceClaims={resourceClaims || []}
                workshopProvisions={workshopProvisions}
                userAssignments={userAssigmentsList.items}
              />
            ) : null}
          </Tab>
          {/* @ts-ignore */}
          <Tab eventKey="users" title={<TabTitleText>Users</TabTitleText>}>
            {activeTab === 'users' ? (
              <WorkshopsItemUserAssignments
                userAssignments={userAssigmentsList.items}
                onUserAssignmentsUpdate={mutateUserAssigments}
              />
            ) : null}
          </Tab>
          {/* @ts-ignore */}
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

const WorkshopsItem: React.FC<{}> = () => {
  const { name: workshopName, namespace: serviceNamespaceName, tab: activeTab = 'details' } = useParams();
  return (
    <ErrorBoundaryPage namespace={workshopName} name={serviceNamespaceName} type="Workshop">
      <WorkshopsItemComponent
        activeTab={activeTab}
        workshopName={workshopName}
        serviceNamespaceName={serviceNamespaceName}
      />
    </ErrorBoundaryPage>
  );
};

export default WorkshopsItem;
