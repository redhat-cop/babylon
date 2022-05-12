import React from 'react';
import { useEffect, useReducer, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useHistory, useLocation, Link } from 'react-router-dom';
import { ExclamationTriangleIcon, PencilAltIcon, QuestionCircleIcon } from '@patternfly/react-icons';
import { BABYLON_DOMAIN } from '@app/util';
import Editor from '@monaco-editor/react';
const yaml = require('js-yaml');

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
  deleteResourceClaim,
  getResourceClaim,
  getWorkshop,
  listNamespaces,
  requestStatusForAllResourcesInResourceClaim,
  scheduleStopForAllResourcesInResourceClaim,
  setLifespanEndForResourceClaim,
  startAllResourcesInResourceClaim,
  stopAllResourcesInResourceClaim,
} from '@app/api';

import { selectResourceClaim, selectServiceNamespaces, selectUserIsAdmin } from '@app/store';

import { Namespace, NamespaceList, ResourceClaim, ServiceNamespace, Workshop } from '@app/types';
import { displayName, renderContent } from '@app/util';
import { K8sFetchState, cancelFetchActivity, k8sFetchStateReducer } from '@app/K8sFetchState';

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
import ServicesActionModal from './ServicesActionModal';
import ServicesCreateWorkshopModal from './ServicesCreateWorkshopModal';
import ServicesScheduleActionModal from './ServicesScheduleActionModal';
import ServiceUsers from './ServiceUsers';

import './services.css';

interface ModalState {
  action?: string;
  modal?: string;
}

interface ServicesItemProps {
  activeTab: string;
  resourceClaimName: string;
  serviceNamespaceName: string;
}

const ServicesItem: React.FunctionComponent<ServicesItemProps> = ({
  activeTab,
  resourceClaimName,
  serviceNamespaceName,
}) => {
  const history = useHistory();
  const location = useLocation();
  const componentWillUnmount = useRef(false);
  const sessionResourceClaim = useSelector((state) =>
    selectResourceClaim(state, serviceNamespaceName, resourceClaimName)
  );
  const sessionServiceNamespaces = useSelector(selectServiceNamespaces);
  const sessionServiceNamespace = sessionServiceNamespaces.find(
    (ns: ServiceNamespace) => ns.name == serviceNamespaceName
  );
  const userIsAdmin: boolean = useSelector(selectUserIsAdmin);
  // Enable fetching resource claims if namespace is not background fetched by the redux store.
  const resourceClaimFetchEnabled: boolean = userIsAdmin && !sessionServiceNamespace ? true : false;

  const [modalState, setModalState] = React.useState<ModalState>({});
  const [resourceClaimFetchState, reduceResourceClaimFetchState] = useReducer(k8sFetchStateReducer, null);
  const [userNamespacesFetchState, reduceUserNamespacesFetchState] = useReducer(k8sFetchStateReducer, null);
  const [workshopFetchState, reduceWorkshopFetchState] = useReducer(k8sFetchStateReducer, null);

  const serviceNamespaces: ServiceNamespace[] = userNamespacesFetchState?.items
    ? userNamespacesFetchState.items.map((ns: Namespace): ServiceNamespace => {
        return {
          name: ns.metadata.name,
          displayName: ns.metadata.annotations['openshift.io/display-name'] || ns.metadata.name,
        };
      })
    : sessionServiceNamespaces;
  const serviceNamespace: ServiceNamespace = (serviceNamespaces || []).find(
    (ns) => ns.name === serviceNamespaceName
  ) || { name: serviceNamespaceName, displayName: serviceNamespaceName };

  const resourceClaim: ResourceClaim | null = sessionServiceNamespace
    ? sessionResourceClaim
    : (resourceClaimFetchState?.item as ResourceClaim);
  const externalPlatformUrl = resourceClaim?.metadata?.annotations?.[`${BABYLON_DOMAIN}/internalPlatformUrl`];
  const resources = (resourceClaim?.status?.resources || []).map((r) => r.state);
  const userData = JSON.parse(resourceClaim?.metadata?.annotations?.[`${BABYLON_DOMAIN}/userData`] || 'null');
  const statusEnabled = resources.find(
    (resource) =>
      resource?.status?.supportedActions?.status && resource?.status?.towerJobs?.provision?.completeTimestamp
  )
    ? true
    : false;
  const workshop: Workshop | null = workshopFetchState?.item as Workshop;

  const catalogItemDisplayName =
    resourceClaim?.metadata?.annotations?.[`${BABYLON_DOMAIN}/catalogItemDisplayName`] ||
    resourceClaim?.metadata?.labels?.[`${BABYLON_DOMAIN}/catalogItemName`];

  const actionHandlers = {
    delete: () => setModalState({ action: 'delete', modal: 'action' }),
    lifespan: () => setModalState({ action: 'retirement', modal: 'scheduleAction' }),
  };
  if (resources.find((r) => r?.kind === 'AnarchySubject')) {
    actionHandlers['runtime'] = () => setModalState({ action: 'stop', modal: 'scheduleAction' });
    actionHandlers['start'] = () => setModalState({ action: 'start', modal: 'action' });
    actionHandlers['stop'] = () => setModalState({ action: 'stop', modal: 'action' });
  }

  // Find lab user interface information either in the resource claim or inside resources
  // associated with the provisioned service.
  const labUserInterfaceData =
    resourceClaim?.metadata?.annotations?.[`${BABYLON_DOMAIN}/labUserInterfaceData`] ||
    resources
      .map((r) =>
        r?.kind === 'AnarchySubject' ? r?.spec?.vars?.provision_data?.lab_ui_data : r?.data?.labUserInterfaceData
      )
      .map((j) => (typeof j === 'string' ? JSON.parse(j) : j))
      .find((u) => u != null);

  const labUserInterfaceMethod =
    resourceClaim?.metadata?.annotations?.[`${BABYLON_DOMAIN}/labUserInterfaceMethod`] ||
    resources
      .map((r) =>
        r?.kind === 'AnarchySubject' ? r?.spec?.vars?.provision_data?.lab_ui_method : r?.data?.labUserInterfaceMethod
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

  const serviceHasUsers: boolean = (resourceClaim?.status?.resources || []).find(
    (r) => r.state?.spec?.vars?.provision_data?.users
  )
    ? true
    : false;

  const workshopName: string = resourceClaim?.metadata?.labels?.[`${BABYLON_DOMAIN}/workshop`];
  const workshopProvisionName: string = resourceClaim?.metadata?.labels?.[`${BABYLON_DOMAIN}/workshop-provision`];

  async function fetchResourceClaim(): Promise<void> {
    let resourceClaim: ResourceClaim = null;
    try {
      resourceClaim = await getResourceClaim(serviceNamespaceName, resourceClaimName);
    } catch (error) {
      if (!(error instanceof Response && error.status === 404)) {
        throw error;
      }
    }
    if (!resourceClaimFetchState.activity.canceled) {
      reduceResourceClaimFetchState({
        type: 'post',
        item: resourceClaim,
        refreshInterval: 3000,
        refresh: (): void => {
          reduceResourceClaimFetchState({ type: 'startRefresh' });
        },
      });
    }
  }

  async function fetchUserNamespaces(): Promise<void> {
    const userNamespaceList: NamespaceList = await listNamespaces({
      labelSelector: 'usernamespace.gpte.redhat.com/user-uid',
    });
    if (!userNamespacesFetchState.activity.canceled) {
      reduceUserNamespacesFetchState({
        type: 'post',
        k8sObjectList: userNamespaceList,
      });
    }
  }

  async function fetchWorkshop(): Promise<void> {
    let workshop: Workshop = null;
    try {
      workshop = await getWorkshop(serviceNamespaceName, workshopName);
    } catch (error) {
      if (!(error instanceof Response && error.status === 404)) {
        throw error;
      }
    }
    if (!workshopFetchState.activity.canceled) {
      reduceWorkshopFetchState({
        type: 'post',
        item: workshop,
        refreshInterval: 8000,
        refresh: (): void => {
          reduceWorkshopFetchState({ type: 'startRefresh' });
        },
      });
    }
  }

  async function onModalAction(): Promise<void> {
    if (modalState.action === 'delete') {
      deleteResourceClaim(resourceClaim);
      history.push(`/services/${serviceNamespaceName}`);
    } else {
      const resourceClaimUpdate: ResourceClaim =
        modalState.action === 'start'
          ? await startAllResourcesInResourceClaim(resourceClaim)
          : await stopAllResourcesInResourceClaim(resourceClaim);
      if (resourceClaimFetchEnabled) {
        reduceResourceClaimFetchState({ type: 'updateItem', item: resourceClaimUpdate });
      }
    }
    setModalState({});
  }

  async function onModalScheduleAction(date: Date): Promise<void> {
    const resourceClaimUpdate: ResourceClaim =
      modalState.action === 'retirement'
        ? await setLifespanEndForResourceClaim(resourceClaim, date)
        : await scheduleStopForAllResourcesInResourceClaim(resourceClaim, date);
    if (resourceClaimFetchEnabled) {
      reduceResourceClaimFetchState({ type: 'updateItem', item: resourceClaimUpdate });
    }
    setModalState({});
  }

  async function onWorkshopCreate({
    resourceClaim,
    workshop,
  }: {
    resourceClaim: ResourceClaim;
    workshop: Workshop;
  }): Promise<void> {
    if (resourceClaimFetchEnabled) {
      reduceResourceClaimFetchState({ type: 'updateItem', item: resourceClaim });
    }
    reduceWorkshopFetchState({ type: 'updateItem', item: workshop });
    setModalState({});
  }

  async function onCheckStatusRequest(): Promise<void> {
    const resourceClaimUpdate: ResourceClaim = await requestStatusForAllResourcesInResourceClaim(resourceClaim);
    if (resourceClaimFetchEnabled) {
      reduceResourceClaimFetchState({ type: 'updateItem', item: resourceClaimUpdate });
    }
  }

  // Track unmount for other effect cleanups
  useEffect(() => {
    return () => {
      componentWillUnmount.current = true;
    };
  }, []);

  // Start fetch of user namespaces for admin users
  useEffect(() => {
    if (userIsAdmin) {
      reduceUserNamespacesFetchState({ type: 'startFetch' });
    }
  }, [userIsAdmin]);

  // Start fetching resource claim
  useEffect(() => {
    if (resourceClaimFetchEnabled) {
      reduceResourceClaimFetchState({ type: 'startFetch' });
    }
  }, [resourceClaimFetchEnabled, resourceClaimName, serviceNamespaceName]);

  // Start fetching workshop
  useEffect(() => {
    if (workshopName) {
      reduceWorkshopFetchState({ type: 'startFetch' });
    }
  }, [workshopName]);

  // Fetch user namespaces
  useEffect(() => {
    if (userNamespacesFetchState?.canContinue) {
      fetchUserNamespaces();
    }
    return () => {
      if (componentWillUnmount.current) {
        cancelFetchActivity(userNamespacesFetchState);
      }
    };
  }, [userNamespacesFetchState]);

  // Fetch ResourceClaim
  useEffect(() => {
    if (resourceClaimFetchState?.canContinue) {
      fetchResourceClaim();
    }
    return () => {
      if (componentWillUnmount.current) {
        cancelFetchActivity(resourceClaimFetchState);
      }
    };
  }, [resourceClaimFetchState]);

  // Fetch Workshop
  useEffect(() => {
    if (workshopFetchState?.canContinue) {
      fetchWorkshop();
    }
    return () => {
      if (componentWillUnmount.current) {
        cancelFetchActivity(workshopFetchState);
      }
    };
  }, [workshopFetchState]);

  // Show loading until whether the user is admin is determined.
  if (userIsAdmin === null) {
    return (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={LoadingIcon} />
        </EmptyState>
      </PageSection>
    );
  }

  // Show loading or not found
  if (!resourceClaim) {
    if (resourceClaimFetchEnabled && (!resourceClaimFetchState || resourceClaimFetchState.item === undefined)) {
      return (
        <PageSection>
          <EmptyState variant="full">
            <EmptyStateIcon icon={LoadingIcon} />
          </EmptyState>
        </PageSection>
      );
    } else {
      return (
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
    }
  }

  return (
    <>
      {modalState.modal === 'action' ? (
        <ServicesActionModal
          key="actionModal"
          action={modalState.action}
          isOpen={true}
          onClose={() => setModalState({})}
          onConfirm={onModalAction}
          resourceClaim={resourceClaim}
        />
      ) : modalState.modal === 'createWorkshop' ? (
        <ServicesCreateWorkshopModal
          key="createWorkshopModal"
          isOpen={true}
          onClose={() => setModalState({})}
          onCreate={onWorkshopCreate}
          resourceClaim={resourceClaim}
        />
      ) : modalState.modal === 'scheduleAction' ? (
        <ServicesScheduleActionModal
          key="scheduleActionModal"
          action={modalState.action}
          isOpen={true}
          onClose={() => setModalState({})}
          onConfirm={(date) => onModalScheduleAction(date)}
          resourceClaim={resourceClaim}
        />
      ) : null}
      {userIsAdmin || serviceNamespaces.length > 1 ? (
        <PageSection key="topbar" className="services-topbar" variant={PageSectionVariants.light}>
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
      <PageSection key="head" className="services-item-head" variant={PageSectionVariants.light}>
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
          className="services-item-body"
          style={{ paddingTop: '1em' }}
        >
          <p>Thank you for your interest in {catalogItemDisplayName || 'this service'}.</p>
        </PageSection>
      ) : (
        <PageSection key="body" variant={PageSectionVariants.light} className="services-item-body">
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
                    <DescriptionListTerm>Retirement</DescriptionListTerm>
                    {resourceClaim.status?.lifespan?.end ? (
                      <DescriptionListDescription>
                        <Button
                          variant="plain"
                          onClick={() => {
                            setModalState({ action: 'retirement', modal: 'scheduleAction' });
                          }}
                        >
                          <LocalTimestamp timestamp={resourceClaim.status.lifespan.end} /> (
                          <TimeInterval toTimestamp={resourceClaim.status.lifespan.end} />)
                          {resourceClaim.spec?.lifespan?.end &&
                          resourceClaim.spec.lifespan.end != resourceClaim.status.lifespan.end ? (
                            <>
                              {' '}
                              <Spinner size="md" />
                            </>
                          ) : null}{' '}
                          <PencilAltIcon className="edit" />
                        </Button>
                      </DescriptionListDescription>
                    ) : (
                      '...'
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
                const desiredState =
                  resourceState?.kind === 'AnarchySubject' ? resourceState.spec.vars?.desired_state : null;
                const provisionData =
                  resourceState?.kind === 'AnarchySubject'
                    ? resourceState.spec.vars?.provision_data
                    : JSON.parse(resourceState?.data?.userData || '{}');
                const provisionMessages =
                  resourceState?.kind === 'AnarchySubject'
                    ? resourceState?.spec?.vars?.provision_messages
                    : provisionData?.msg;
                const provisionDataEntries = provisionData
                  ? Object.entries(provisionData).filter(([key, value]) => {
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
                  <div key={idx} className="services-item-body-resource">
                    {resourceClaim.spec.resources.length > 1 ? (
                      <h2 className="rhpds-component-display-name">{componentDisplayName}</h2>
                    ) : null}
                    <DescriptionList isHorizontal>
                      {resourceState?.kind == 'AnarchySubject' ? (
                        <>
                          <DescriptionListGroup>
                            <DescriptionListTerm>UUID</DescriptionListTerm>
                            <DescriptionListDescription>
                              {resourceState?.spec?.vars?.job_vars?.uuid || '...'}
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
                                <LocalTimestamp timestamp={startTimestamp} /> (
                                <TimeInterval toTimestamp={startTimestamp} />)
                              </DescriptionListDescription>
                            </DescriptionListGroup>
                          ) : stopDate && Number(stopDate) > Date.now() ? (
                            <DescriptionListGroup>
                              <DescriptionListTerm>Scheduled Stop</DescriptionListTerm>
                              <DescriptionListDescription>
                                <Button
                                  variant="plain"
                                  onClick={() => {
                                    setModalState({ action: 'stop', modal: 'action' });
                                  }}
                                >
                                  <LocalTimestamp timestamp={stopTimestamp} /> (
                                  <TimeInterval toTimestamp={stopTimestamp} />) <PencilAltIcon className="edit" />
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
                      {provisionDataEntries && provisionDataEntries.length > 0 ? (
                        <DescriptionListGroup>
                          <DescriptionListTerm>Provision Data</DescriptionListTerm>
                          <DescriptionListDescription>
                            <DescriptionList isHorizontal className="rhpds-user-data">
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
                <Tab eventKey="workshop" title={<TabTitleText>Workshop</TabTitleText>}>
                  {workshop ? (
                    <WorkshopsItemDetails
                      onWorkshopUpdate={(workshop) => reduceWorkshopFetchState({ type: 'updateItem', item: workshop })}
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
                <Tab eventKey="users" title={<TabTitleText>Users</TabTitleText>}>
                  {workshop ? (
                    <WorkshopsItemUserAssignments
                      onWorkshopUpdate={(workshop) => reduceWorkshopFetchState({ type: 'updateItem', item: workshop })}
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
                    className="services-create-workshop-button"
                    onClick={() => {
                      setModalState({ action: 'createWorkshop', modal: 'createWorkshop' });
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

export default ServicesItem;
