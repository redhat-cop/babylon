import React, { useCallback, useMemo, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useSelector } from 'react-redux';
import { useHistory, useLocation, Link } from 'react-router-dom';
import { ExclamationTriangleIcon, OutlinedClockIcon } from '@patternfly/react-icons';
import { BABYLON_DOMAIN } from '@app/util';
import Editor from '@monaco-editor/react';
import yaml from 'js-yaml';
import {
  Breadcrumb,
  BreadcrumbItem,
  Bullseye,
  Button,
  DescriptionList,
  DescriptionListTerm,
  DescriptionListGroup,
  DescriptionListDescription,
  EmptyState,
  EmptyStateBody,
  EmptyStateIcon,
  PageSection,
  PageSectionVariants,
  Spinner,
  Split,
  SplitItem,
  Tabs,
  Tab,
  TabTitleText,
  Title,
} from '@patternfly/react-core';
import {
  apiPaths,
  deleteResourceClaim,
  fetcher,
  requestStatusForAllResourcesInResourceClaim,
  scheduleStopForAllResourcesInResourceClaim,
  setLifespanEndForResourceClaim,
  startAllResourcesInResourceClaim,
  stopAllResourcesInResourceClaim,
} from '@app/api';
import { selectServiceNamespaces, selectUserIsAdmin } from '@app/store';
import { NamespaceList, ResourceClaim, ServiceNamespace, Workshop } from '@app/types';
import { displayName, renderContent } from '@app/util';
import LabInterfaceLink from '@app/components/LabInterfaceLink';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import TimeInterval from '@app/components/TimeInterval';
import WorkshopsItemDetails from '@app/Workshops/WorkshopsItemDetails';
import WorkshopsItemUserAssignments from '@app/Workshops/WorkshopsItemUserAssignments';
import ServiceActions from './ServiceActions';
import ServiceItemStatus from './ServiceItemStatus';
import ServiceOpenStackConsole from './ServiceOpenStackConsole';
import ServiceNamespaceSelect from './ServiceNamespaceSelect';
import ServiceStatus from './ServiceStatus';
import ServicesAction from './ServicesAction';
import ServicesCreateWorkshop from './ServicesCreateWorkshop';
import ServicesScheduleAction from './ServicesScheduleAction';
import ServiceUsers from './ServiceUsers';
import Modal, { useModal } from '@app/Modal/Modal';
import useSWR from 'swr';

import './services-item.css';

const ServicesItemComponent: React.FC<{
  activeTab: string;
  resourceClaimName: string;
  serviceNamespaceName: string;
}> = ({ activeTab, resourceClaimName, serviceNamespaceName }) => {
  const history = useHistory();
  const location = useLocation();
  const sessionServiceNamespaces = useSelector(selectServiceNamespaces);
  const userIsAdmin: boolean = useSelector(selectUserIsAdmin);
  const [modalState, setModalState] = useState<{
    action?: string;
    resourceClaim?: ResourceClaim;
  }>({});
  const [modalAction, openModalAction] = useModal();
  const [modalScheduleAction, openModalScheduleAction] = useModal();
  const [modalCreateWorkshop, openModalCreateWorkshop] = useModal();

  const {
    data: resourceClaim,
    mutate,
    error,
  } = useSWR<ResourceClaim>(apiPaths.RESOURCE_CLAIM({ namespace: serviceNamespaceName, resourceClaimName }), fetcher, {
    refreshInterval: 8000,
  });
  if (error) throw error;
  // As admin we need to fetch service namespaces for the service namespace dropdown
  const enableFetchUserNamespaces: boolean = userIsAdmin;
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
  const externalPlatformUrl = resourceClaim.metadata?.annotations?.[`${BABYLON_DOMAIN}/internalPlatformUrl`];
  const resources = (resourceClaim.status?.resources || []).map((r) => r.state);
  const userData = JSON.parse(resourceClaim.metadata?.annotations?.[`${BABYLON_DOMAIN}/userData`] || 'null');
  const statusEnabled = resources.find(
    (resource) =>
      resource?.status?.supportedActions?.status && resource?.status?.towerJobs?.provision?.completeTimestamp
  )
    ? true
    : false;

  const catalogItemDisplayName =
    resourceClaim.metadata?.annotations?.[`${BABYLON_DOMAIN}/catalogItemDisplayName`] ||
    resourceClaim.metadata?.labels?.[`${BABYLON_DOMAIN}/catalogItemName`];

  const actionHandlers = {
    delete: () => showModal({ action: 'delete', modal: 'action' }),
    lifespan: () => showModal({ action: 'retirement', modal: 'scheduleAction' }),
  };
  if (resources.find((r) => r?.kind === 'AnarchySubject')) {
    actionHandlers['runtime'] = () => showModal({ action: 'stop', modal: 'scheduleAction' });
    actionHandlers['start'] = () => showModal({ action: 'start', modal: 'action' });
    actionHandlers['stop'] = () => showModal({ action: 'stop', modal: 'action' });
  }

  // Find lab user interface information either in the resource claim or inside resources
  // associated with the provisioned service.
  const labUserInterfaceData =
    resourceClaim.metadata?.annotations?.[`${BABYLON_DOMAIN}/labUserInterfaceData`] ||
    resources
      .map((r) =>
        r?.kind === 'AnarchySubject' ? r?.spec?.vars?.provision_data?.lab_ui_data : r?.data?.labUserInterfaceData
      )
      .map((j) => (typeof j === 'string' ? JSON.parse(j) : j))
      .find((u) => u != null);

  const labUserInterfaceMethod =
    resourceClaim.metadata?.annotations?.[`${BABYLON_DOMAIN}/labUserInterfaceMethod`] ||
    resources
      .map((r) =>
        r?.kind === 'AnarchySubject' ? r?.spec?.vars?.provision_data?.lab_ui_method : r?.data?.labUserInterfaceMethod
      )
      .find((u) => u != null);
  const labUserInterfaceUrl =
    resourceClaim.metadata?.annotations?.[`${BABYLON_DOMAIN}/labUserInterfaceUrl`] ||
    resources
      .map((r) => {
        const data = r?.kind === 'AnarchySubject' ? r.spec?.vars?.provision_data : r?.data;
        return data?.labUserInterfaceUrl || data?.lab_ui_url || data?.bookbag_url;
      })
      .find((u) => u != null);

  const serviceHasUsers: boolean = (resourceClaim.status?.resources || []).find(
    (r) => r.state?.spec?.vars?.provision_data?.users
  )
    ? true
    : false;

  const workshopName: string = resourceClaim.metadata?.labels?.[`${BABYLON_DOMAIN}/workshop`];
  const workshopProvisionName: string = resourceClaim.metadata?.labels?.[`${BABYLON_DOMAIN}/workshop-provision`];

  const { data: workshop, mutate: mutateWorkshop } = useSWR<Workshop>(
    workshopName ? apiPaths.WORKSHOP({ namespace: serviceNamespaceName, workshopName }) : null,
    fetcher,
    { refreshInterval: 8000 }
  );

  async function onModalAction(): Promise<void> {
    if (modalState.action === 'delete') {
      deleteResourceClaim(resourceClaim);
      history.push(`/services/${serviceNamespaceName}`);
    } else {
      const resourceClaimUpdate: ResourceClaim =
        modalState.action === 'start'
          ? await startAllResourcesInResourceClaim(resourceClaim)
          : await stopAllResourcesInResourceClaim(resourceClaim);
      mutate(resourceClaimUpdate);
    }
  }

  async function onModalScheduleAction(date: Date): Promise<void> {
    const resourceClaimUpdate: ResourceClaim =
      modalState.action === 'retirement'
        ? await setLifespanEndForResourceClaim(resourceClaim, date)
        : await scheduleStopForAllResourcesInResourceClaim(resourceClaim, date);
    mutate(resourceClaimUpdate);
  }

  async function onWorkshopCreate({
    resourceClaim,
    workshop,
  }: {
    resourceClaim: ResourceClaim;
    workshop: Workshop;
  }): Promise<void> {
    mutate(resourceClaim);
    mutateWorkshop(workshop);
  }

  async function onCheckStatusRequest(): Promise<void> {
    const resourceClaimUpdate: ResourceClaim = await requestStatusForAllResourcesInResourceClaim(resourceClaim);
    mutate(resourceClaimUpdate);
  }

  const showModal = useCallback(
    ({
      modal,
      action,
    }: {
      modal: 'action' | 'scheduleAction' | 'createWorkshop';
      action: 'start' | 'stop' | 'delete' | 'retirement';
    }) => {
      if (modal === 'action') {
        setModalState({ action });
        openModalAction();
      }
      if (modal === 'scheduleAction') {
        setModalState({ action });
        openModalScheduleAction();
      }
      if (modal === 'createWorkshop') {
        setModalState({ action });
        openModalCreateWorkshop();
      }
    },
    [openModalAction, openModalCreateWorkshop, openModalScheduleAction]
  );

  return (
    <>
      <Modal ref={modalAction} onConfirm={onModalAction} passModifiers={true}>
        <ServicesAction action={modalState.action} resourceClaim={resourceClaim} />
      </Modal>
      <Modal ref={modalCreateWorkshop} onConfirm={onWorkshopCreate} passModifiers={true}>
        <ServicesCreateWorkshop resourceClaim={resourceClaim} />
      </Modal>
      <Modal ref={modalScheduleAction} onConfirm={onModalScheduleAction} passModifiers={true}>
        <ServicesScheduleAction action={modalState.action} resourceClaim={resourceClaim} />
      </Modal>
      {userIsAdmin || serviceNamespaces.length > 1 ? (
        <PageSection key="topbar" className="services-item__topbar" variant={PageSectionVariants.light}>
          <ServiceNamespaceSelect
            currentNamespaceName={serviceNamespaceName}
            serviceNamespaces={serviceNamespaces}
            onSelect={(namespaceName) => {
              if (namespaceName) {
                history.push(`/services/${namespaceName}${location.search}`);
              } else {
                history.push(`/services${location.search}`);
              }
            }}
          />
        </PageSection>
      ) : null}
      <PageSection key="head" className="services-item__head" variant={PageSectionVariants.light}>
        <Split hasGutter>
          <SplitItem isFilled>
            {userIsAdmin || serviceNamespaces.length > 1 ? (
              <Breadcrumb>
                <BreadcrumbItem
                  render={({ className }) => (
                    <Link to="/services" className={className}>
                      Services
                    </Link>
                  )}
                />
                <BreadcrumbItem
                  render={({ className }) => (
                    <Link to={`/services/${serviceNamespaceName}`} className={className}>
                      {displayName(serviceNamespace)}
                    </Link>
                  )}
                />
                <BreadcrumbItem>{resourceClaimName}</BreadcrumbItem>
              </Breadcrumb>
            ) : (
              <Breadcrumb>
                <BreadcrumbItem
                  render={({ className }) => (
                    <Link to={`/services/${serviceNamespaceName}`} className={className}>
                      Services
                    </Link>
                  )}
                />
                <BreadcrumbItem>{resourceClaimName}</BreadcrumbItem>
              </Breadcrumb>
            )}
            <Title headingLevel="h4" size="xl">
              {displayName(resourceClaim)}
            </Title>
          </SplitItem>
          <SplitItem>
            <Bullseye>
              {externalPlatformUrl ? (
                <Button component="a" href={externalPlatformUrl} target="_blank" variant="tertiary">
                  {externalPlatformUrl}
                </Button>
              ) : (
                <ServiceActions position="right" resourceClaim={resourceClaim} actionHandlers={actionHandlers} />
              )}
            </Bullseye>
          </SplitItem>
        </Split>
      </PageSection>
      {resourceClaim.spec.resources[0].provider.name === 'babylon-service-request-configmap' && !userIsAdmin ? (
        <PageSection
          key="body"
          variant={PageSectionVariants.light}
          className="services-item__body"
          style={{ paddingTop: '1em' }}
        >
          <p>Thank you for your interest in {catalogItemDisplayName || 'this service'}.</p>
        </PageSection>
      ) : (
        <PageSection key="body" variant={PageSectionVariants.light} className="services-item__body">
          <Tabs
            activeKey={activeTab || 'details'}
            onSelect={(e, tabIndex) =>
              history.push(`/services/${serviceNamespaceName}/${resourceClaimName}/${tabIndex}`)
            }
          >
            <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
              <DescriptionList isHorizontal>
                <DescriptionListGroup>
                  <DescriptionListTerm>Name</DescriptionListTerm>
                  <DescriptionListDescription>
                    {resourceClaim.metadata.name}
                    {userIsAdmin ? <OpenshiftConsoleLink resource={resourceClaim} /> : null}
                  </DescriptionListDescription>
                </DescriptionListGroup>
                {labUserInterfaceUrl ? (
                  <DescriptionListGroup>
                    <DescriptionListTerm>Lab Instructions</DescriptionListTerm>
                    <DescriptionListDescription>
                      <LabInterfaceLink
                        url={labUserInterfaceUrl}
                        data={labUserInterfaceData}
                        method={labUserInterfaceMethod}
                      />
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                ) : null}
                <DescriptionListGroup>
                  <DescriptionListTerm>Requested On</DescriptionListTerm>
                  <DescriptionListDescription>
                    <LocalTimestamp timestamp={resourceClaim.metadata.creationTimestamp} />
                  </DescriptionListDescription>
                </DescriptionListGroup>
                {!externalPlatformUrl && resourceClaim?.status?.lifespan?.end ? (
                  <DescriptionListGroup>
                    <DescriptionListTerm>Auto-destroy</DescriptionListTerm>
                    {resourceClaim.status?.lifespan?.end ? (
                      <DescriptionListDescription>
                        <Button
                          key="auto-destroy"
                          variant="control"
                          isDisabled={!resourceClaim.status?.lifespan}
                          onClick={() => {
                            showModal({ action: 'retirement', modal: 'scheduleAction' });
                          }}
                          icon={<OutlinedClockIcon />}
                          iconPosition="right"
                          className="services-item__schedule-btn"
                        >
                          <LocalTimestamp timestamp={resourceClaim.status.lifespan.end} />
                          <span style={{ padding: '0 6px' }}>
                            (<TimeInterval toTimestamp={resourceClaim.status.lifespan.end} />)
                          </span>
                        </Button>
                        {resourceClaim.spec?.lifespan?.end &&
                        resourceClaim.spec.lifespan.end != resourceClaim.status.lifespan.end ? (
                          <>
                            {' '}
                            <Spinner size="md" />
                          </>
                        ) : null}
                      </DescriptionListDescription>
                    ) : (
                      <p>-</p>
                    )}
                  </DescriptionListGroup>
                ) : null}
                <DescriptionListGroup>
                  <DescriptionListTerm>GUID</DescriptionListTerm>
                  <DescriptionListDescription>
                    {userIsAdmin && resourceClaim?.status?.resourceHandle ? (
                      <>
                        <Link key="admin" to={`/admin/resourcehandles/${resourceClaim.status.resourceHandle.name}`}>
                          <code>{resourceClaim.status.resourceHandle.name.substring(5)}</code>
                        </Link>
                        <OpenshiftConsoleLink key="console" reference={resourceClaim.status.resourceHandle} />
                      </>
                    ) : (
                      <code>{resourceClaim?.status?.resourceHandle?.name.substring(5) || '...'}</code>
                    )}
                  </DescriptionListDescription>
                </DescriptionListGroup>
              </DescriptionList>
              {resourceClaim.spec.resources.map((resourceSpec, idx) => {
                const resourceStatus = resourceClaim.status?.resources[idx];
                const resourceState = resourceStatus?.state;
                const componentDisplayName =
                  resourceClaim.metadata.annotations?.[`${BABYLON_DOMAIN}/displayNameComponent${idx}`] ||
                  resourceSpec.name ||
                  resourceSpec.provider?.name;
                const currentState =
                  resourceState?.kind === 'AnarchySubject' ? resourceState.spec.vars?.current_state : 'available';
                const provisionData =
                  resourceState?.kind === 'AnarchySubject'
                    ? resourceState.spec.vars?.provision_data
                    : JSON.parse(resourceState?.data?.userData || '{}');
                const provisionMessages =
                  resourceState?.kind === 'AnarchySubject'
                    ? resourceState?.spec?.vars?.provision_messages
                    : provisionData?.msg;
                const provisionDataEntries = provisionData
                  ? Object.entries(provisionData).filter(([key]) => {
                      if (
                        key === 'bookbag_url' ||
                        key === 'lab_ui_url' ||
                        key === 'labUserInterfaceUrl' ||
                        key === 'msg' ||
                        key === 'users'
                      ) {
                        return false;
                      }
                      if (userData) {
                        if (userData[key]) {
                          return true;
                        } else {
                          return false;
                        }
                      } else {
                        return true;
                      }
                    })
                  : null;
                const stopTimestamp =
                  resourceState?.kind === 'AnarchySubject'
                    ? resourceSpec.template?.spec.vars?.action_schedule?.stop ||
                      resourceState?.spec.vars.action_schedule?.stop
                    : null;
                const stopTime = stopTimestamp ? Date.parse(stopTimestamp) : null;
                const stopDate = stopTime ? new Date(stopTime) : null;
                const startTimestamp =
                  resourceState?.kind == 'AnarchySubject'
                    ? resourceSpec.template?.spec.vars?.action_schedule?.start ||
                      resourceState?.spec.vars.action_schedule?.start
                    : null;
                const startTime = startTimestamp ? Date.parse(startTimestamp) : null;
                const startDate = startTime ? new Date(startTime) : null;
                return (
                  <div key={idx} className="services-item__body-resource">
                    {resourceClaim.spec.resources.length > 1 ? <h2>{componentDisplayName}</h2> : null}
                    <DescriptionList isHorizontal>
                      {resourceState?.kind == 'AnarchySubject' ? (
                        <>
                          <DescriptionListGroup>
                            <DescriptionListTerm>UUID</DescriptionListTerm>
                            <DescriptionListDescription>
                              {resourceState?.spec?.vars?.job_vars?.uuid || <p>-</p>}
                            </DescriptionListDescription>
                          </DescriptionListGroup>
                          <DescriptionListGroup>
                            <DescriptionListTerm>Status</DescriptionListTerm>
                            <DescriptionListDescription>
                              <ServiceStatus
                                creationTime={Date.parse(resourceClaim.metadata.creationTimestamp)}
                                resource={resourceState}
                                resourceTemplate={resourceSpec.template}
                              />
                            </DescriptionListDescription>
                          </DescriptionListGroup>
                          {externalPlatformUrl ? null : startDate && Number(startDate) > Date.now() ? (
                            <DescriptionListGroup>
                              <DescriptionListTerm>Scheduled Start</DescriptionListTerm>
                              <DescriptionListDescription>
                                <LocalTimestamp timestamp={startTimestamp} />
                                <span style={{ padding: '0 6px' }}>
                                  (<TimeInterval toTimestamp={startTimestamp} />)
                                </span>
                              </DescriptionListDescription>
                            </DescriptionListGroup>
                          ) : stopDate && Number(stopDate) > Date.now() ? (
                            <DescriptionListGroup>
                              <DescriptionListTerm>Auto-Stop</DescriptionListTerm>
                              <DescriptionListDescription>
                                <Button
                                  key="auto-stop"
                                  variant="control"
                                  icon={<OutlinedClockIcon />}
                                  iconPosition="right"
                                  onClick={() => showModal({ action: 'stop', modal: 'scheduleAction' })}
                                  className="services-item__schedule-btn"
                                >
                                  <LocalTimestamp timestamp={stopTimestamp} />
                                  <span style={{ padding: '0 6px' }}>
                                    (<TimeInterval toTimestamp={stopTimestamp} />)
                                  </span>
                                </Button>
                              </DescriptionListDescription>
                            </DescriptionListGroup>
                          ) : currentState !== 'stopped' ? (
                            <DescriptionListGroup>
                              <DescriptionListTerm>Scheduled Stop</DescriptionListTerm>
                              <DescriptionListDescription>Now</DescriptionListDescription>
                            </DescriptionListGroup>
                          ) : (
                            <DescriptionListGroup>
                              <DescriptionListTerm>Scheduled Stop</DescriptionListTerm>
                              <DescriptionListDescription>-</DescriptionListDescription>
                            </DescriptionListGroup>
                          )}
                          {userIsAdmin && resourceState ? (
                            <>
                              <DescriptionListGroup key="anarchy-namespace">
                                <DescriptionListTerm>Anarchy Namespace</DescriptionListTerm>
                                <DescriptionListDescription>
                                  <Link to={`/admin/anarchysubjects/${resourceState.metadata.namespace}`}>
                                    {resourceState.metadata.namespace}
                                  </Link>
                                  <OpenshiftConsoleLink resource={resourceState} linkToNamespace />
                                </DescriptionListDescription>
                              </DescriptionListGroup>
                              <DescriptionListGroup key="anarchy-governor">
                                <DescriptionListTerm>AnarchyGovernor</DescriptionListTerm>
                                <DescriptionListDescription>
                                  <Link
                                    to={`/admin/anarchygovernors/${resourceState.metadata.namespace}/${resourceState.spec.governor}`}
                                  >
                                    {resourceState.spec.governor}
                                  </Link>
                                  <OpenshiftConsoleLink
                                    reference={{
                                      apiVersion: 'anarchy.gpte.redhat.com/v1',
                                      kind: 'AnarchyGovernor',
                                      name: resourceState.spec.governor,
                                      namespace: resourceState.metadata.namespace,
                                    }}
                                  />
                                </DescriptionListDescription>
                              </DescriptionListGroup>
                              <DescriptionListGroup key="anarchy-subject">
                                <DescriptionListTerm>AnarchySubject</DescriptionListTerm>
                                <DescriptionListDescription>
                                  <Link
                                    to={`/admin/anarchysubjects/${resourceState.metadata.namespace}/${resourceState.metadata.name}`}
                                  >
                                    {resourceState.metadata.name}
                                  </Link>
                                  <OpenshiftConsoleLink resource={resourceState} />
                                </DescriptionListDescription>
                              </DescriptionListGroup>
                            </>
                          ) : null}
                        </>
                      ) : null}
                      {provisionDataEntries && provisionDataEntries.length > 0 ? (
                        <DescriptionListGroup>
                          <DescriptionListTerm>Provision Data</DescriptionListTerm>
                          <DescriptionListDescription>
                            <DescriptionList isHorizontal className="services-item__provision-data">
                              {provisionDataEntries
                                .sort((a, b) => a[0].localeCompare(b[0]))
                                .map(([key, value]) => (
                                  <DescriptionListGroup key={key}>
                                    <DescriptionListTerm>{key}</DescriptionListTerm>
                                    <DescriptionListDescription>
                                      {typeof value === 'string' ? (
                                        value.startsWith('https://') ? (
                                          <a href={value}>
                                            <code>{value}</code>
                                          </a>
                                        ) : (
                                          <code>{value}</code>
                                        )
                                      ) : (
                                        <code>{JSON.stringify(value)}</code>
                                      )}
                                    </DescriptionListDescription>
                                  </DescriptionListGroup>
                                ))}
                            </DescriptionList>
                          </DescriptionListDescription>
                        </DescriptionListGroup>
                      ) : null}
                      {provisionMessages ? (
                        <DescriptionListGroup>
                          <DescriptionListTerm>Provision Messages</DescriptionListTerm>
                          <DescriptionListDescription>
                            <div
                              dangerouslySetInnerHTML={{
                                __html: renderContent(
                                  (typeof provisionMessages === 'string'
                                    ? provisionMessages
                                    : provisionMessages.join('\n')
                                  )
                                    .replace(/^\s+|\s+$/g, '')
                                    .replace(/([^\n])\n(?!\n)/g, '$1 +\n')
                                ),
                              }}
                            />
                          </DescriptionListDescription>
                        </DescriptionListGroup>
                      ) : null}
                    </DescriptionList>
                  </div>
                );
              })}
            </Tab>
            {statusEnabled ? (
              <Tab eventKey="status" title={<TabTitleText>Status</TabTitleText>}>
                <ServiceItemStatus onCheckStatusRequest={onCheckStatusRequest} resourceClaim={resourceClaim} />
              </Tab>
            ) : null}
            {(resourceClaim.status?.resources || []).find((r) => {
              const provision_data = r.state?.spec?.vars?.provision_data;
              if (provision_data?.osp_cluster_api || provision_data?.openstack_auth_url) {
                return true;
              } else {
                return false;
              }
            }) ? (
              <Tab eventKey="console" title={<TabTitleText>Console</TabTitleText>}>
                {activeTab == 'console' ? <ServiceOpenStackConsole resourceClaim={resourceClaim} /> : null}
              </Tab>
            ) : null}
            {workshopName && !workshopProvisionName ? (
              [
                <Tab eventKey="workshop" key="workshop" title={<TabTitleText>Workshop</TabTitleText>}>
                  {workshop ? (
                    <WorkshopsItemDetails
                      onWorkshopUpdate={(workshop) => mutateWorkshop(workshop)}
                      workshop={workshop}
                    />
                  ) : (
                    <PageSection>
                      <EmptyState variant="full">
                        <EmptyStateIcon icon={LoadingIcon} />
                      </EmptyState>
                    </PageSection>
                  )}
                </Tab>,
                <Tab eventKey="users" key="users" title={<TabTitleText>Users</TabTitleText>}>
                  {workshop ? (
                    <WorkshopsItemUserAssignments
                      onWorkshopUpdate={(workshop) => mutateWorkshop(workshop)}
                      workshop={workshop}
                    />
                  ) : (
                    <PageSection>
                      <EmptyState variant="full">
                        <EmptyStateIcon icon={LoadingIcon} />
                      </EmptyState>
                    </PageSection>
                  )}
                </Tab>,
              ]
            ) : serviceHasUsers ? (
              <Tab eventKey="users" title={<TabTitleText>Users</TabTitleText>}>
                {!workshopName ? (
                  <Button
                    className="services-item__create-workshop-button"
                    onClick={() => {
                      setModalState({ action: 'createWorkshop' });
                    }}
                  >
                    Create Workshop Interface
                  </Button>
                ) : null}
                <ServiceUsers resourceClaim={resourceClaim} />
              </Tab>
            ) : null}
            <Tab eventKey="yaml" title={<TabTitleText>YAML</TabTitleText>}>
              <Editor
                height="500px"
                language="yaml"
                options={{ readOnly: true }}
                theme="vs-dark"
                value={yaml.dump(resourceClaim)}
              />
            </Tab>
          </Tabs>
        </PageSection>
      )}
    </>
  );
};

const NotFoundComponent: React.FC<{
  resourceClaimName: string;
  serviceNamespaceName: string;
}> = ({ resourceClaimName, serviceNamespaceName }) => (
  <EmptyState variant="full">
    <EmptyStateIcon icon={ExclamationTriangleIcon} />
    <Title headingLevel="h1" size="lg">
      Service not found
    </Title>
    <EmptyStateBody>
      ResourceClaim {resourceClaimName} was not found in {serviceNamespaceName}.
    </EmptyStateBody>
  </EmptyState>
);

const ServicesItem: React.FC<{
  activeTab: string;
  resourceClaimName: string;
  serviceNamespaceName: string;
}> = ({ activeTab, resourceClaimName, serviceNamespaceName }) => (
  <ErrorBoundary
    fallbackRender={() => (
      <NotFoundComponent resourceClaimName={resourceClaimName} serviceNamespaceName={serviceNamespaceName} />
    )}
  >
    <ServicesItemComponent
      activeTab={activeTab}
      resourceClaimName={resourceClaimName}
      serviceNamespaceName={serviceNamespaceName}
    />
  </ErrorBoundary>
);

export default ServicesItem;
