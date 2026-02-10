import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate, useLocation, Link, useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import yaml from 'js-yaml';
import useSWR, { useSWRConfig } from 'swr';
import {
  Alert,
  Breadcrumb,
  BreadcrumbItem,
  Bullseye,
  PageSection,
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
  SERVICES_KEY,
  setWorkshopLifespanEnd,
  silentFetcher,
  startWorkshop,
  startWorkshopServices,
  stopWorkshop,
} from '@app/api';
import {
  NamespaceList,
  RequestUsageCost,
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
  displayName,
  FETCH_BATCH_LIMIT,
  getStageFromK8sObject,
  namespaceToServiceNamespaceMapper,
  READY_BY_LEAD_TIME_MS,
} from '@app/util';
import useSession from '@app/utils/useSession';
import Modal, { useModal } from '@app/Modal/Modal';
import ResourceClaimDeleteModal from '@app/components/ResourceClaimDeleteModal';
import WorkshopActionModal from '@app/components/WorkshopActionModal';
import WorkshopActions from './WorkshopActions';
import WorkshopsItemDetails from './WorkshopsItemDetails';
import WorkshopsItemProvisioning from './WorkshopsItemProvisioning';
import WorkshopsItemServices from './WorkshopsItemServices';
import WorkshopsItemUserAssignments from './WorkshopsItemUserAssignments';
import WorkshopScheduleAction from './WorkshopScheduleAction';
import WorkshopInfoTab, { getWorkshopInfoMessageTemplate } from './WorkshopInfoTab';
import { checkWorkshopCanStart, checkWorkshopCanStop, isWorkshopLocked, isWorkshopStarted } from './workshops-utils';
import Label from '@app/components/Label';
import LocalTimestamp from '@app/components/LocalTimestamp';
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
    | 'scheduleDelete'
    | 'scheduleStop'
    | 'scheduleStart'
    | 'scheduleStartDate'
    | 'startWorkshop'
    | 'scheduleReadyByDate';
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
  const [modalSchedule, openModalSchedule] = useModal();
  const { cache } = useSWRConfig();
  const [selectedResourceClaims, setSelectedResourceClaims] = useState<ResourceClaim[]>([]);
  const [highlightAutoDestroy, setHighlightAutoDestroy] = useState(false);
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
      } else if (action === 'scheduleDelete' || action === 'scheduleStop' || action === 'scheduleStart' || action === 'scheduleStartDate' || action === 'scheduleReadyByDate') {
        openModalSchedule();
      }
    },
    [openModalAction, openModalDelete, openModalSchedule],
  );
  const enableFetchUserNamespaces = isAdmin;
  const enableManageWorkshopProvisions =
    isAdmin || sessionServiceNamespaces.find((ns) => ns.name == serviceNamespaceName) ? true : false;
  const { data: userNamespaceList } = useSWR<NamespaceList>(
    enableFetchUserNamespaces ? apiPaths.NAMESPACES({ labelSelector: 'usernamespace.gpte.redhat.com/user-uid' }) : '',
    fetcher,
    {
      revalidateOnMount: false, // Don't revalidate on mount
      dedupingInterval: 10000, // Longer deduping for namespace data
    },
  );
  const serviceNamespaces = useMemo(() => {
    return enableFetchUserNamespaces
      ? userNamespaceList?.items?.map(namespaceToServiceNamespaceMapper) || []
      : sessionServiceNamespaces;
  }, [enableFetchUserNamespaces, sessionServiceNamespaces, userNamespaceList]);

  const { data: workshop, mutate: mutateWorkshop } = useSWR<Workshop>(
    apiPaths.WORKSHOP({ namespace: serviceNamespaceName, workshopName }),
    fetcher,
    {
      refreshInterval: 8000,
      compare: compareK8sObjects,
      revalidateOnMount: true,
      dedupingInterval: 2000, // Dedupe requests within 2s
    },
  );
  const { data: userAssigmentsList, mutate: mutateUserAssigmentsList } = useSWR<WorkshopUserAssignmentList>(
    apiPaths.WORKSHOP_USER_ASSIGNMENTS({
      workshopName,
      namespace: serviceNamespaceName,
    }),
    fetcher,
    {
      refreshInterval: 15000,
      revalidateOnMount: false, // Don't revalidate on mount
      revalidateIfStale: false, // Don't auto-revalidate stale data
      dedupingInterval: 4000, // Dedupe requests
    },
  );

  const stage = getStageFromK8sObject(workshop);

  const { data: usageCost } = useSWR<RequestUsageCost>(
    workshop?.metadata.labels?.[`${BABYLON_DOMAIN}/workshop-id`]
      ? apiPaths.USAGE_COST_WORKSHOP({ workshopId: workshop.metadata.labels?.[`${BABYLON_DOMAIN}/workshop-id`] })
      : null,
    silentFetcher,
    {
      revalidateOnMount: false, // Don't revalidate on mount to prevent extra requests
      revalidateIfStale: false, // Don't auto-revalidate stale data
      dedupingInterval: 5000, // Longer deduping for cost data
    },
  );

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
            }),
          )
        : [],
    {
      revalidateOnMount: false, // Don't revalidate on mount
      revalidateIfStale: false, // Don't auto-revalidate stale data
      dedupingInterval: 3000, // Dedupe requests
    },
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
        }),
      ),
    {
      refreshInterval: 8000,
      compare: compareK8sObjectsArr,
      revalidateOnMount: false, // Don't revalidate on mount
      revalidateIfStale: false, // Don't auto-revalidate stale data
      dedupingInterval: 3000, // Dedupe requests
    },
  );

  // Check if workshop has an info message template
  const hasInfoMessageTemplate = !!getWorkshopInfoMessageTemplate(workshop);

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
    [mutateRC, resourceClaims],
  );

  const mutateUserAssigments = useCallback(
    (userAssigments: WorkshopUserAssignment[]) => {
      const userAssigmentsListClone = Object.assign({}, userAssigmentsList);
      userAssigmentsListClone.items = Array.from(userAssigments);
      mutateUserAssigmentsList(userAssigmentsListClone);
    },
    [mutateUserAssigmentsList, userAssigmentsList],
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
      resourceClaims,
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
      }),
    );
    cache.delete(apiPaths.WORKSHOP({ namespace: serviceNamespaceName, workshopName }));
    cache.delete(
      apiPaths.WORKSHOP_PROVISIONS({
        workshopName: workshop.metadata.name,
        namespace: workshop.metadata.namespace,
        limit: 'ALL',
      }),
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
      let workshopUpdated = await startWorkshop(
        workshop,
        !isWorkshopStarted(workshop, workshopProvisions) ? dateToApiString(new Date(date.getTime())) : null,
        !isWorkshopStarted(workshop, workshopProvisions)
          ? dateToApiString(new Date(date.getTime() + parseDuration('30h')))
          : dateToApiString(new Date(Date.now() + parseDuration('30h'))),
        resourceClaims,
      );
      // If workshop has readyBy date, update it to be provisioning date + lead time
      if (workshop.spec?.lifespan?.readyBy) {
        const newReadyByDate = new Date(date.getTime() + READY_BY_LEAD_TIME_MS);
        workshopUpdated = await patchWorkshop({
          name: workshop.metadata.name,
          namespace: workshop.metadata.namespace,
          patch: {
            spec: {
              lifespan: {
                readyBy: dateToApiString(newReadyByDate),
              },
            },
          },
        });
      }
      mutateWorkshop(workshopUpdated);
      // Highlight auto-destroy in details after changing start date
      setHighlightAutoDestroy(true);
    } else if (modalState.action === 'scheduleStartDate') {
      // Note: date here is already converted back to provisioning time by WorkshopScheduleAction
      const workshopUpdated = await startWorkshop(
        workshop,
        !isWorkshopStarted(workshop, workshopProvisions) ? dateToApiString(new Date(date.getTime())) : null,
        !isWorkshopStarted(workshop, workshopProvisions)
          ? dateToApiString(new Date(date.getTime() + parseDuration('30h')))
          : dateToApiString(new Date(Date.now() + parseDuration('30h'))),
        resourceClaims,
      );
      mutateWorkshop(workshopUpdated);
      // Highlight auto-destroy in details after changing start date
      setHighlightAutoDestroy(true);
    } else if (modalState.action === 'scheduleReadyByDate') {
      const readyByDate = new Date(date.getTime());
      // Calculate auto-stop time: 12 hours after the ready-by date
      const autoStopTime = new Date(readyByDate.getTime() + 12 * 60 * 60 * 1000);
      await startWorkshop(
        workshop,
        !isWorkshopStarted(workshop, workshopProvisions) ? dateToApiString(new Date(date.getTime() + READY_BY_LEAD_TIME_MS)) : null,
        !isWorkshopStarted(workshop, workshopProvisions)
          ? dateToApiString(new Date(date.getTime() + parseDuration('30h')))
          : dateToApiString(new Date(Date.now() + parseDuration('30h'))),
        resourceClaims,
      );
      const workshopUpdated = await patchWorkshop({
        name: workshop.metadata.name,
        namespace: workshop.metadata.namespace,
        patch: {
          spec: {
            lifespan: { readyBy: dateToApiString(readyByDate) },
            actionSchedule: { stop: dateToApiString(autoStopTime) },
          },
        },
      });
      
      mutateWorkshop(workshopUpdated);
      // Highlight auto-destroy in details after changing ready-by date
      setHighlightAutoDestroy(true);
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
          <ResourceClaimDeleteModal
            restart={true}
            onConfirm={onServiceDeleteConfirm}
            resourceClaims={modalState.resourceClaims}
          />
        ) : modalState?.action === 'deleteService' ? (
          <ResourceClaimDeleteModal
            onConfirm={() => onServiceDeleteConfirm(true)}
            resourceClaims={modalState.resourceClaims}
          />
        ) : modalState?.action === 'startServices' ? (
          <WorkshopActionModal onConfirm={onServiceStartConfirm} action="start" />
        ) : modalState?.action === 'stopServices' ? (
          <WorkshopActionModal onConfirm={onServiceStopConfirm} action="stop" />
        ) : modalState?.action === 'startWorkshop' ? (
          <WorkshopActionModal onConfirm={onWorkshopStartConfirm} action="start" />
        ) : null}
      </Modal>
      <Modal ref={modalSchedule} onConfirm={onModalScheduleAction} passModifiers={true} title={displayName(workshop)}>
        <WorkshopScheduleAction
          action={
            modalState.action === 'scheduleDelete'
              ? 'retirement'
              : modalState.action === 'scheduleStart'
                ? 'start'
                : modalState.action === 'scheduleStartDate' || modalState.action === 'scheduleReadyByDate'
                  ? 'start-date'
                  : 'stop'
          }
          workshop={workshop}
          resourceClaims={resourceClaims}
          workshopProvisions={workshopProvisions}
        />
      </Modal>
      {isAdmin || serviceNamespaces.length > 1 ? (
        <PageSection hasBodyWrapper={false} key="topbar" className="workshops-item__topbar">
          <ProjectSelector
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
      <PageSection hasBodyWrapper={false} key="head" className="workshops-item__head">
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
                isLocked={isWorkshopLocked(workshop)}
              />
            </Bullseye>
          </SplitItem>
        </Split>
      </PageSection>
      {workshop.spec?.lifespan?.readyBy && 
       new Date(workshop.spec.lifespan.readyBy).getTime() > Date.now() ? (
        <PageSection hasBodyWrapper={false} key="ready-by-alert">
          <Alert variant="info" isInline title="Scheduled Ready Time">
            This workshop is scheduled to be ready by <LocalTimestamp timestamp={workshop.spec.lifespan.readyBy} />.
          </Alert>
        </PageSection>
      ) : null}
      <PageSection hasBodyWrapper={false} key="body" className="workshops-item__body">
        <Tabs
          activeKey={activeTab || 'details'}
          onSelect={(e, tabIndex) => navigate(`/workshops/${serviceNamespaceName}/${workshopName}/${tabIndex}`)}
        >
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
            {activeTab === 'details' || !activeTab ? (
              <WorkshopsItemDetails
                onWorkshopUpdate={(workshop: Workshop) => mutateWorkshop(workshop)}
                workshop={workshop}
                showModal={showModal}
                resourceClaims={resourceClaims}
                workshopProvisions={workshopProvisions}
                workshopUserAssignments={userAssigmentsList?.items || []}
                usageCost={usageCost}
                highlightAutoDestroy={highlightAutoDestroy}
                onHighlightAutoDestroyComplete={() => setHighlightAutoDestroy(false)}
              />
            ) : null}
          </Tab>
          {hasInfoMessageTemplate ? (
            <Tab eventKey="info" key="info" title={<TabTitleText>Info</TabTitleText>}>
              {activeTab === 'info' ? (
                <WorkshopInfoTab
                  workshop={workshop}
                  resourceClaims={resourceClaims || []}
                  workshopProvisions={workshopProvisions || []}
                  showModal={showModal}
                />
              ) : null}
            </Tab>
          ) : null}
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
                resourceClaims={resourceClaims || []}
                workshopProvisions={workshopProvisions}
                userAssignments={userAssigmentsList?.items || []}
              />
            ) : null}
          </Tab>
          <Tab eventKey="users" title={<TabTitleText>Users</TabTitleText>}>
            {activeTab === 'users' ? (
              <WorkshopsItemUserAssignments
                userAssignments={userAssigmentsList?.items || []}
                onUserAssignmentsUpdate={mutateUserAssigments}
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

const WorkshopsItem: React.FC = () => {
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
