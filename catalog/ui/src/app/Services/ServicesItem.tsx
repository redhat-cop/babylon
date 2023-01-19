import React, { useCallback, useMemo, useState } from 'react';
import { ErrorBoundary, useErrorHandler } from 'react-error-boundary';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import yaml from 'js-yaml';
import useSWR, { useSWRConfig } from 'swr';
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionToggle,
  ExpandableSection,
} from '@patternfly/react-core';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import {
  apiPaths,
  deleteResourceClaim,
  fetcher,
  fetchWithUpdatedCostTracker,
  requestStatusForAllResourcesInResourceClaim,
  scheduleStopForAllResourcesInResourceClaim,
  setLifespanEndForResourceClaim,
  setProvisionRating,
  startAllResourcesInResourceClaim,
  stopAllResourcesInResourceClaim,
} from '@app/api';
import {
  AnarchySubject,
  K8sObject,
  NamespaceList,
  ResourceClaim,
  ResourceClaimSpecResource,
  ServiceActionActions,
  ServiceNamespace,
  Workshop,
} from '@app/types';
import { BABYLON_DOMAIN, canExecuteAction, getCostTracker, displayName, renderContent } from '@app/util';
import useSession from '@app/utils/useSession';
import Modal, { useModal } from '@app/Modal/Modal';
import CurrencyAmount from '@app/components/CurrencyAmount';
import Footer from '@app/components/Footer';
import ConditionalWrapper from '@app/components/ConditionalWrapper';
import LabInterfaceLink from '@app/components/LabInterfaceLink';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import TimeInterval from '@app/components/TimeInterval';
import WorkshopsItemDetails from '@app/Workshops/WorkshopsItemDetails';
import WorkshopsItemUserAssignments from '@app/Workshops/WorkshopsItemUserAssignments';
import AutoStopDestroy from '@app/components/AutoStopDestroy';
import { getAutoStopTime, getInfoMessageTemplate, getMostRelevantResourceAndTemplate } from './service-utils';
import ServicesAction from './ServicesAction';
import ServiceActions from './ServiceActions';
import ServiceOpenStackConsole from './ServiceOpenStackConsole';
import ServiceNamespaceSelect from '@app/components/ServiceNamespaceSelect';
import ServicesCreateWorkshop from './ServicesCreateWorkshop';
import ServicesScheduleAction from './ServicesScheduleAction';
import ServiceUsers from './ServiceUsers';
import ServiceStatus from './ServiceStatus';
import ServiceItemStatus from './ServiceItemStatus';
import InfoTab from './InfoTab';

import './services-item.css';

const ComponentDetailsList: React.FC<{
  resourceState: AnarchySubject;
  isAdmin: boolean;
  resourceClaim: ResourceClaim;
  resourceSpec: ResourceClaimSpecResource;
  externalPlatformUrl: string;
  isPartOfWorkshop: boolean;
  startDate: Date;
  startTimestamp: string;
  stopDate: Date;
  currentState: string;
  provisionMessages: any;
  provisionDataEntries: [string, unknown][];
}> = ({
  resourceState,
  isAdmin,
  resourceClaim,
  resourceSpec,
  externalPlatformUrl,
  isPartOfWorkshop,
  startDate,
  startTimestamp,
  stopDate,
  currentState,
  provisionMessages,
  provisionDataEntries,
}) => (
  <DescriptionList isHorizontal>
    <DescriptionListGroup>
      <DescriptionListTerm>Status</DescriptionListTerm>
      <DescriptionListDescription>
        <ServiceStatus
          creationTime={Date.parse(resourceClaim.metadata.creationTimestamp)}
          resource={resourceState}
          resourceTemplate={resourceSpec?.template}
          resourceClaim={resourceClaim}
        />
      </DescriptionListDescription>
    </DescriptionListGroup>
    {resourceState?.kind === 'AnarchySubject' ? (
      <>
        {externalPlatformUrl || isPartOfWorkshop ? null : startDate && Number(startDate) > Date.now() ? (
          <DescriptionListGroup>
            <DescriptionListTerm>Scheduled Start</DescriptionListTerm>
            <DescriptionListDescription>
              <LocalTimestamp timestamp={startTimestamp} />
              <span style={{ padding: '0 6px' }}>
                (<TimeInterval toTimestamp={startTimestamp} />)
              </span>
            </DescriptionListDescription>
          </DescriptionListGroup>
        ) : stopDate && Number(stopDate) > Date.now() ? null : currentState !== 'stopped' ? (
          <DescriptionListGroup>
            <DescriptionListTerm>Scheduled Stop</DescriptionListTerm>
            <DescriptionListDescription>Now</DescriptionListDescription>
          </DescriptionListGroup>
        ) : null}
        {provisionMessages ? (
          <DescriptionListGroup>
            <DescriptionListTerm>Provision Messages</DescriptionListTerm>
            <DescriptionListDescription>
              <div
                dangerouslySetInnerHTML={{
                  __html: renderContent(
                    (typeof provisionMessages === 'string' ? provisionMessages : provisionMessages.join('\n'))
                      .replace(/^\s+|\s+$/g, '')
                      .replace(/([^\n])\n(?!\n)/g, '$1 +\n')
                  ),
                }}
              />
            </DescriptionListDescription>
          </DescriptionListGroup>
        ) : null}
        {isAdmin || (provisionDataEntries && provisionDataEntries.length > 0) ? (
          <ExpandableSection toggleText="Advanced settings">
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
            {isAdmin ? (
              <DescriptionListGroup>
                <DescriptionListTerm>UUID</DescriptionListTerm>
                <DescriptionListDescription>
                  {resourceState?.spec?.vars?.job_vars?.uuid || <p>-</p>}
                </DescriptionListDescription>
              </DescriptionListGroup>
            ) : null}
            {isAdmin && resourceState ? (
              <DescriptionListGroup key="anarchy-namespace">
                <DescriptionListTerm>Anarchy Namespace</DescriptionListTerm>
                <DescriptionListDescription>
                  <Link to={`/admin/anarchysubjects/${resourceState.metadata.namespace}`}>
                    {resourceState.metadata.namespace}
                  </Link>
                  <OpenshiftConsoleLink resource={resourceState} linkToNamespace />
                </DescriptionListDescription>
              </DescriptionListGroup>
            ) : null}
            {isAdmin && resourceState ? (
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
            ) : null}
            {isAdmin && resourceState ? (
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
            ) : null}
          </ExpandableSection>
        ) : null}
      </>
    ) : null}
  </DescriptionList>
);

const ServicesItemComponent: React.FC<{
  activeTab: string;
  resourceClaimName: string;
  serviceNamespaceName: string;
}> = ({ activeTab, resourceClaimName, serviceNamespaceName }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, serviceNamespaces: sessionServiceNamespaces } = useSession().getSession();
  const { cache } = useSWRConfig();
  const [expanded, setExpanded] = useState([]);

  const {
    data: resourceClaim,
    mutate,
    error,
  } = useSWR<ResourceClaim>(
    apiPaths.RESOURCE_CLAIM({ namespace: serviceNamespaceName, resourceClaimName }),
    (path) =>
      fetchWithUpdatedCostTracker({
        path,
        initialResourceClaim: cache.get(apiPaths.RESOURCE_CLAIM({ namespace: serviceNamespaceName, resourceClaimName }))
          ?.data,
      }),
    {
      refreshInterval: 8000,
    }
  );
  useErrorHandler(error?.status === 404 ? error : null);

  const [modalAction, openModalAction] = useModal();
  const [modalScheduleAction, openModalScheduleAction] = useModal();
  const [modalCreateWorkshop, openModalCreateWorkshop] = useModal();
  const [modalState, setModalState] = useState<{
    action: ServiceActionActions;
    resourceClaim?: ResourceClaim;
    rating?: {
      rate: number;
      comment: string;
    };
  }>({ action: null });

  // As admin we need to fetch service namespaces for the service namespace dropdown
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
  const workshopName = resourceClaim.metadata?.labels?.[`${BABYLON_DOMAIN}/workshop`];
  const workshopProvisionName = resourceClaim.metadata?.labels?.[`${BABYLON_DOMAIN}/workshop-provision`];
  const externalPlatformUrl = resourceClaim.metadata?.annotations?.[`${BABYLON_DOMAIN}/internalPlatformUrl`];
  const isPartOfWorkshop = !!workshopProvisionName;
  const resourcesK8sObj = (resourceClaim.status?.resources || []).map((r: { state?: K8sObject }) => r.state);
  const anarchySubjects = resourcesK8sObj
    .filter((r: K8sObject) => r?.kind === 'AnarchySubject')
    .map((r) => r as AnarchySubject);
  const userData = JSON.parse(resourceClaim.metadata?.annotations?.[`${BABYLON_DOMAIN}/userData`] || 'null');
  const statusEnabled = anarchySubjects.find((anarchySubject) => canExecuteAction(anarchySubject, 'status'))
    ? true
    : false;
  const consoleEnabled = (resourceClaim.status?.resources || []).find((r) => {
    const provision_data = r.state?.spec?.vars?.provision_data;
    return provision_data?.osp_cluster_api || provision_data?.openstack_auth_url;
  });

  const catalogItemDisplayName =
    resourceClaim.metadata?.annotations?.[`${BABYLON_DOMAIN}/catalogItemDisplayName`] ||
    resourceClaim.metadata?.labels?.[`${BABYLON_DOMAIN}/catalogItemName`];

  const actionHandlers = {
    delete: () => showModal({ action: 'delete', modal: 'action', resourceClaim }),
    lifespan: () => showModal({ action: 'retirement', modal: 'scheduleAction', resourceClaim }),
  };
  if (anarchySubjects.find((anarchySubject) => canExecuteAction(anarchySubject, 'start'))) {
    actionHandlers['start'] = () => showModal({ action: 'start', modal: 'action', resourceClaim });
  }
  if (anarchySubjects.find((anarchySubject) => canExecuteAction(anarchySubject, 'stop'))) {
    actionHandlers['stop'] = () => showModal({ action: 'stop', modal: 'action', resourceClaim });
    actionHandlers['runtime'] = () => showModal({ action: 'stop', modal: 'scheduleAction', resourceClaim });
  }
  if (isPartOfWorkshop) {
    actionHandlers['manageWorkshop'] = () => navigate(`/workshops/${serviceNamespace.name}/${workshopName}`);
  } else {
    actionHandlers['rate'] = () => showModal({ action: 'rate', modal: 'action', resourceClaim });
  }

  // Find lab user interface information either in the resource claim or inside resources
  // associated with the provisioned service.
  const labUserInterfaceData =
    resourceClaim.metadata?.annotations?.[`${BABYLON_DOMAIN}/labUserInterfaceData`] ||
    resourcesK8sObj
      .map((r) => {
        if (r?.kind === 'AnarchySubject') {
          const anarchySubject = r as AnarchySubject;
          return anarchySubject.spec?.vars?.provision_data?.lab_ui_data;
        }
        return r?.data?.labUserInterfaceData;
      })
      .map((j) => (typeof j === 'string' ? JSON.parse(j) : j))
      .find((u) => u != null);

  const labUserInterfaceMethod =
    resourceClaim.metadata?.annotations?.[`${BABYLON_DOMAIN}/labUserInterfaceMethod`] ||
    resourcesK8sObj
      .map((r) => {
        if (r?.kind === 'AnarchySubject') {
          const anarchySubject = r as AnarchySubject;
          return anarchySubject.spec?.vars?.provision_data?.lab_ui_method;
        }
        return r?.data?.labUserInterfaceMethod;
      })
      .find((u) => u != null);
  const labUserInterfaceUrl =
    resourceClaim.metadata?.annotations?.[`${BABYLON_DOMAIN}/labUserInterfaceUrl`] ||
    resourcesK8sObj
      .map((r) => {
        let data = r?.data;
        if (r?.kind === 'AnarchySubject') {
          const anarchySubject = r as AnarchySubject;
          data = anarchySubject.spec?.vars?.provision_data;
        }
        return data?.labUserInterfaceUrl || data?.lab_ui_url || data?.bookbag_url;
      })
      .find((u) => u != null);

  const serviceHasUsers = (resourceClaim.status?.resources || []).find(
    (r) => r.state?.spec?.vars?.provision_data?.users
  )
    ? true
    : false;

  const { data: workshop, mutate: mutateWorkshop } = useSWR<Workshop>(
    workshopName ? apiPaths.WORKSHOP({ namespace: serviceNamespaceName, workshopName }) : null,
    fetcher,
    { refreshInterval: 8000 }
  );

  const costTracker = getCostTracker(resourceClaim);
  const autoStopTime = getAutoStopTime(resourceClaim);
  const hasInfoMessageTemplate = !!getInfoMessageTemplate(resourceClaim);

  async function onModalAction(): Promise<void> {
    if (modalState.action === 'delete') {
      deleteResourceClaim(resourceClaim);
      cache.delete(apiPaths.RESOURCE_CLAIM({ namespace: serviceNamespaceName, resourceClaimName }));
      navigate(`/services/${serviceNamespaceName}`);
    } else if (modalState.action === 'stop' || modalState.action === 'start') {
      const resourceClaimUpdate =
        modalState.action === 'start'
          ? await startAllResourcesInResourceClaim(resourceClaim)
          : await stopAllResourcesInResourceClaim(resourceClaim);
      mutate(resourceClaimUpdate);
    }
    if (modalState.action === 'rate' || modalState.action === 'delete') {
      if (modalState.rating) {
        const provisionUuids = resourceClaim.status.resources
          .map((r) => r.state?.spec?.vars?.job_vars?.uuid)
          .filter(Boolean);
        for (const provisionUuid of provisionUuids) {
          await setProvisionRating(provisionUuid, modalState.rating.rate, modalState.rating.comment);
          cache.delete(apiPaths.PROVISION_RATING({ provisionUuid }));
        }
      }
    }
  }

  async function onModalScheduleAction(date: Date): Promise<void> {
    const resourceClaimUpdate =
      modalState.action === 'retirement'
        ? await setLifespanEndForResourceClaim(resourceClaim, date)
        : await scheduleStopForAllResourcesInResourceClaim(resourceClaim, date);
    mutate(resourceClaimUpdate);
  }

  function onModalWorkshopCreate() {
    mutate();
    mutateWorkshop();
  }

  async function onCheckStatusRequest(): Promise<void> {
    const resourceClaimUpdate = await requestStatusForAllResourcesInResourceClaim(resourceClaim);
    mutate(resourceClaimUpdate);
  }

  const showModal = useCallback(
    ({
      modal,
      action,
      resourceClaim,
    }: {
      modal: 'action' | 'scheduleAction' | 'createWorkshop';
      action?: ServiceActionActions;
      resourceClaim?: ResourceClaim;
    }) => {
      if (modal === 'action') {
        setModalState({ action, resourceClaim });
        openModalAction();
      }
      if (modal === 'scheduleAction') {
        setModalState({ action });
        openModalScheduleAction();
      }
      if (modal === 'createWorkshop') {
        openModalCreateWorkshop();
      }
    },
    [openModalAction, openModalCreateWorkshop, openModalScheduleAction]
  );

  const toggle = (id: string) => {
    const index = expanded.indexOf(id);
    const newExpanded: string[] =
      index >= 0 ? [...expanded.slice(0, index), ...expanded.slice(index + 1, expanded.length)] : [...expanded, id];
    setExpanded(newExpanded);
  };

  return (
    <>
      <Modal ref={modalAction} onConfirm={onModalAction} passModifiers={true}>
        <ServicesAction actionState={modalState} setActionState={setModalState} />
      </Modal>
      <Modal ref={modalCreateWorkshop} onConfirm={onModalWorkshopCreate} passModifiers={true}>
        <ServicesCreateWorkshop resourceClaim={resourceClaim} />
      </Modal>
      <Modal ref={modalScheduleAction} onConfirm={onModalScheduleAction} passModifiers={true}>
        <ServicesScheduleAction
          action={modalState.action === 'retirement' ? 'retirement' : 'stop'}
          resourceClaim={resourceClaim}
        />
      </Modal>
      {isAdmin || serviceNamespaces.length > 1 ? (
        <PageSection key="topbar" className="services-item__topbar" variant={PageSectionVariants.light}>
          <ServiceNamespaceSelect
            allowSelectAll
            isPlain
            isText
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
      <PageSection key="head" className="services-item__head" variant={PageSectionVariants.light}>
        <Split hasGutter>
          <SplitItem isFilled>
            {isAdmin || serviceNamespaces.length > 1 ? (
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
      {resourceClaim.spec.resources[0].provider.name === 'babylon-service-request-configmap' && !isAdmin ? (
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
            activeKey={activeTab ? activeTab : hasInfoMessageTemplate ? 'info' : 'details'}
            onSelect={(e, tabIndex) => navigate(`/services/${serviceNamespaceName}/${resourceClaimName}/${tabIndex}`)}
          >
            {hasInfoMessageTemplate ? (
              <Tab eventKey="info" title={<TabTitleText>Info</TabTitleText>}>
                {activeTab === 'info' || !activeTab ? (
                  <InfoTab resourceClaim={resourceClaim} showModal={showModal} />
                ) : null}
              </Tab>
            ) : null}
            <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
              {activeTab === 'details' || (!activeTab && !hasInfoMessageTemplate) ? (
                <DescriptionList isHorizontal>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Name</DescriptionListTerm>
                    <DescriptionListDescription>
                      {resourceClaim.metadata.name}
                      {isAdmin ? <OpenshiftConsoleLink resource={resourceClaim} /> : null}
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
                    <DescriptionListTerm>GUID</DescriptionListTerm>
                    <DescriptionListDescription>
                      {isAdmin && resourceClaim.status?.resourceHandle ? (
                        <>
                          <Link key="admin" to={`/admin/resourcehandles/${resourceClaim.status.resourceHandle.name}`}>
                            <code>{resourceClaim.status.resourceHandle.name.substring(5)}</code>
                          </Link>
                          <OpenshiftConsoleLink key="console" reference={resourceClaim.status.resourceHandle} />
                        </>
                      ) : (
                        <code>{resourceClaim.status?.resourceHandle?.name.substring(5) || '...'}</code>
                      )}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Requested On</DescriptionListTerm>
                    <DescriptionListDescription>
                      <LocalTimestamp timestamp={resourceClaim.metadata.creationTimestamp} />
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  <DescriptionListGroup>
                    <DescriptionListTerm>Auto-stop</DescriptionListTerm>
                    <DescriptionListDescription>
                      <AutoStopDestroy
                        type="auto-stop"
                        onClick={() => {
                          showModal({ action: 'stop', modal: 'scheduleAction', resourceClaim });
                        }}
                        resourceClaim={resourceClaim}
                        className="services-item__schedule-btn"
                        time={autoStopTime}
                        variant="extended"
                      ></AutoStopDestroy>
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  {!externalPlatformUrl && !isPartOfWorkshop && resourceClaim.status?.lifespan?.end ? (
                    <DescriptionListGroup>
                      <DescriptionListTerm>Auto-destroy</DescriptionListTerm>
                      <DescriptionListDescription>
                        <AutoStopDestroy
                          type="auto-destroy"
                          onClick={() => {
                            showModal({ action: 'retirement', modal: 'scheduleAction', resourceClaim });
                          }}
                          time={resourceClaim.status?.lifespan?.end}
                          className="services-item__schedule-btn"
                          variant="extended"
                          resourceClaim={resourceClaim}
                        >
                          {resourceClaim.spec?.lifespan?.end &&
                          resourceClaim.spec.lifespan.end != resourceClaim.status.lifespan.end ? (
                            <>
                              {' '}
                              <Spinner size="md" />
                            </>
                          ) : null}
                        </AutoStopDestroy>
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  ) : null}

                  {costTracker ? (
                    <DescriptionListGroup>
                      <DescriptionListTerm>Amount spent</DescriptionListTerm>
                      <DescriptionListDescription>
                        {costTracker.estimatedCost ? (
                          <p>
                            <CurrencyAmount amount={costTracker.estimatedCost} />{' '}
                            <span className="services-item__estimated-cost-label">
                              (Estimated by the cloud provider)
                            </span>
                          </p>
                        ) : (
                          'No data available'
                        )}
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  ) : null}

                  {resourceClaim.spec.resources.length > 1 ? (
                    <DescriptionListGroup>
                      <DescriptionListTerm>Status</DescriptionListTerm>
                      <DescriptionListDescription>
                        <ServiceStatus
                          creationTime={Date.parse(resourceClaim.metadata.creationTimestamp)}
                          resource={getMostRelevantResourceAndTemplate(resourceClaim).resource}
                          resourceTemplate={getMostRelevantResourceAndTemplate(resourceClaim).template}
                          resourceClaim={resourceClaim}
                        />
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  ) : null}

                  <ConditionalWrapper
                    condition={resourceClaim.spec.resources.length > 1}
                    wrapper={(children) => (
                      <section>
                        <header>
                          <h3
                            style={{
                              fontSize: 'var(--pf-global--FontSize--sm)',
                              fontWeight: 'var(--pf-global--FontWeight--bold)',
                              lineHeight: 'var(--pf-global--LineHeight--sm)',
                              marginBottom: 'var(--pf-global--spacer--sm)',
                            }}
                          >
                            Components
                          </h3>
                        </header>
                        <Accordion asDefinitionList={false} style={{ maxWidth: '600px' }}>
                          {children}
                        </Accordion>
                      </section>
                    )}
                  >
                    <div>
                      {(resourceClaim.spec?.resources || []).map((resourceSpec, idx) => {
                        const resourceStatus = resourceClaim.status?.resources?.[idx];
                        const resourceState = resourceStatus?.state;
                        const componentDisplayName =
                          resourceClaim.metadata.annotations?.[`${BABYLON_DOMAIN}/displayNameComponent${idx}`] ||
                          resourceSpec.name ||
                          resourceSpec.provider?.name;
                        const currentState =
                          resourceState?.kind === 'AnarchySubject'
                            ? resourceState.spec.vars?.current_state
                            : 'available';
                        const stopTimestamp =
                          resourceState?.kind === 'AnarchySubject'
                            ? resourceSpec.template?.spec.vars?.action_schedule?.stop ||
                              resourceState?.spec.vars.action_schedule?.stop
                            : null;
                        const stopTime = stopTimestamp ? Date.parse(stopTimestamp) : null;
                        const stopDate = stopTime ? new Date(stopTime) : null;
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

                        const startTimestamp =
                          resourceState?.kind == 'AnarchySubject'
                            ? resourceSpec.template?.spec.vars?.action_schedule?.start ||
                              resourceState?.spec.vars.action_schedule?.start
                            : null;
                        const startTime = startTimestamp ? Date.parse(startTimestamp) : null;
                        const startDate = startTime ? new Date(startTime) : null;

                        return (
                          <ConditionalWrapper
                            key={idx}
                            condition={resourceClaim.spec.resources.length > 1}
                            wrapper={(children) => (
                              <AccordionItem>
                                <AccordionToggle
                                  isExpanded={expanded.includes(`item-${idx}`)}
                                  id={`item-${idx}`}
                                  onClick={() => toggle(`item-${idx}`)}
                                >
                                  {componentDisplayName}
                                </AccordionToggle>
                                <AccordionContent isHidden={!expanded.includes(`item-${idx}`)} id={`item-${idx}`}>
                                  {children}
                                </AccordionContent>
                              </AccordionItem>
                            )}
                          >
                            <ComponentDetailsList
                              resourceState={resourceState}
                              isAdmin={isAdmin}
                              resourceClaim={resourceClaim}
                              resourceSpec={resourceSpec}
                              externalPlatformUrl={externalPlatformUrl}
                              isPartOfWorkshop={isPartOfWorkshop}
                              startDate={startDate}
                              startTimestamp={startTimestamp}
                              stopDate={stopDate}
                              currentState={currentState}
                              provisionDataEntries={provisionDataEntries}
                              provisionMessages={provisionMessages}
                            />
                          </ConditionalWrapper>
                        );
                      })}
                    </div>
                  </ConditionalWrapper>
                </DescriptionList>
              ) : null}
            </Tab>
            {statusEnabled ? (
              <Tab eventKey="status" title={<TabTitleText>Status</TabTitleText>}>
                {activeTab === 'status' ? (
                  <ServiceItemStatus onCheckStatusRequest={onCheckStatusRequest} resourceClaim={resourceClaim} />
                ) : null}
              </Tab>
            ) : null}
            {consoleEnabled ? (
              <Tab eventKey="console" title={<TabTitleText>Console</TabTitleText>}>
                {activeTab === 'console' ? <ServiceOpenStackConsole resourceClaim={resourceClaim} /> : null}
              </Tab>
            ) : null}
            {workshopName && !workshopProvisionName ? (
              [
                <Tab eventKey="workshop" key="workshop" title={<TabTitleText>Workshop</TabTitleText>}>
                  {activeTab === 'workshop' ? (
                    <WorkshopsItemDetails
                      onWorkshopUpdate={(workshop) => mutateWorkshop(workshop)}
                      workshop={workshop}
                    />
                  ) : null}
                </Tab>,
                <Tab eventKey="users" key="users" title={<TabTitleText>Users</TabTitleText>}>
                  {activeTab === 'users' ? (
                    <WorkshopsItemUserAssignments
                      onWorkshopUpdate={(workshop) => mutateWorkshop(workshop)}
                      workshop={workshop}
                    />
                  ) : null}
                </Tab>,
              ]
            ) : serviceHasUsers ? (
              <Tab eventKey="users" title={<TabTitleText>Users</TabTitleText>}>
                {activeTab === 'users' ? (
                  <>
                    {!workshopName ? (
                      <Button
                        className="services-item__create-workshop-button"
                        onClick={() => {
                          showModal({ modal: 'createWorkshop', resourceClaim });
                        }}
                      >
                        Enable workshop user interface
                      </Button>
                    ) : null}
                    <ServiceUsers resourceClaim={resourceClaim} />
                  </>
                ) : null}
              </Tab>
            ) : null}
            <Tab eventKey="yaml" title={<TabTitleText>YAML</TabTitleText>}>
              {activeTab === 'yaml' ? (
                <Editor
                  height="500px"
                  language="yaml"
                  options={{ readOnly: true }}
                  theme="vs-dark"
                  value={yaml.dump(resourceClaim)}
                />
              ) : null}
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
    onError={(err) => window['newrelic'] && window['newrelic'].noticeError(err)}
    fallbackRender={() => (
      <>
        <NotFoundComponent resourceClaimName={resourceClaimName} serviceNamespaceName={serviceNamespaceName} />
        <Footer />
      </>
    )}
  >
    <ServicesItemComponent
      activeTab={activeTab}
      resourceClaimName={resourceClaimName}
      serviceNamespaceName={serviceNamespaceName}
    />
    <Footer />
  </ErrorBoundary>
);

export default ServicesItem;
