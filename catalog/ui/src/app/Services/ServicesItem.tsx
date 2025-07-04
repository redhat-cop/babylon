// @ts-nocheck
import React, { useCallback, useMemo, useState, useReducer, useEffect } from 'react';
import { useErrorHandler } from 'react-error-boundary';
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
  List,
  ListItem,
  Radio,
  Tooltip,
  TextInput,
  Switch,
} from '@patternfly/react-core';
import {
  apiFetch,
  apiPaths,
  checkSalesforceId,
  deleteResourceClaim,
  fetcher,
  silentFetcher,
  patchResourceClaim,
  requestStatusForAllResourcesInResourceClaim,
  scheduleStartResourceClaim,
  scheduleStopForAllResourcesInResourceClaim,
  scheduleStopResourceClaim,
  SERVICES_KEY,
  setLifespanEndForResourceClaim,
  setLifespanStartForResourceClaim,
  setProvisionRating,
  startAllResourcesInResourceClaim,
  stopAllResourcesInResourceClaim,
} from '@app/api';
import {
  AnarchySubject,
  K8sObject,
  NamespaceList,
  ResourceClaim,
  ServiceActionActions,
  SfdcType,
  Workshop,
  WorkshopUserAssignment,
  WorkshopUserAssignmentList,
} from '@app/types';
import {
  BABYLON_DOMAIN,
  canExecuteAction,
  displayName,
  renderContent,
  isResourceClaimPartOfWorkshop,
  getStageFromK8sObject,
  compareK8sObjects,
  namespaceToServiceNamespaceMapper,
  isLabDeveloper,
  DEMO_DOMAIN,
  getWhiteGloved,
} from '@app/util';
import useSession from '@app/utils/useSession';
import Modal, { useModal } from '@app/Modal/Modal';
import CurrencyAmount from '@app/components/CurrencyAmount';
import ConditionalWrapper from '@app/components/ConditionalWrapper';
import LabInterfaceLink from '@app/components/LabInterfaceLink';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import TimeInterval from '@app/components/TimeInterval';
import WorkshopsItemDetails from '@app/Workshops/WorkshopsItemDetails';
import WorkshopsItemUserAssignments from '@app/Workshops/WorkshopsItemUserAssignments';
import AutoStopDestroy from '@app/components/AutoStopDestroy';
import Label from '@app/components/Label';
import {
  getAutoStopTime,
  getInfoMessageTemplate,
  getMostRelevantResourceAndTemplate,
  getStartTime,
} from './service-utils';
import ServicesAction from './ServicesAction';
import ServiceActions from './ServiceActions';
import ServiceOpenStackConsole from './ServiceOpenStackConsole';
import ProjectSelector from '@app/components/ProjectSelector';
import ServicesCreateWorkshop from './ServicesCreateWorkshop';
import ServicesScheduleAction from './ServicesScheduleAction';
import ServiceUsers from './ServiceUsers';
import ServiceStatus from './ServiceStatus';
import ServiceItemStatus from './ServiceItemStatus';
import InfoTab from './InfoTab';
import ErrorBoundaryPage from '@app/components/ErrorBoundaryPage';
import OutlinedQuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/outlined-question-circle-icon';
import useDebounce from '@app/utils/useDebounce';
import useDebounceState from '@app/utils/useDebounceState';

import './services-item.css';

const ComponentDetailsList: React.FC<{
  resourceState: AnarchySubject;
  isAdmin: boolean;
  groups: string[];
  externalPlatformUrl: string;
  isPartOfWorkshop: boolean;
  startDate: Date;
  startTimestamp: string;
  stopDate: Date;
  currentState: string;
  provisionMessages: string | string[];
  provisionDataEntries: [string, unknown][];
}> = ({
  resourceState,
  isAdmin,
  groups,
  externalPlatformUrl,
  isPartOfWorkshop,
  startDate,
  startTimestamp,
  stopDate,
  currentState,
  provisionMessages,
  provisionDataEntries,
}) => {
  const _provisionMessages =
    typeof provisionMessages === 'string'
      ? provisionMessages
      : provisionMessages
        ? provisionMessages
            .map((m) => {
              if (m.includes('~')) {
                return `pass:[${m}]`;
              }
              return m;
            })
            .join('\n')
            .trim()
            .replace(/([^\n])\n(?!\n)/g, '$1 +\n')
        : null;
  const provisionMessagesHtml = useMemo(
    () =>
      _provisionMessages ? (
        <div
          dangerouslySetInnerHTML={{
            __html: renderContent(_provisionMessages, { format: 'asciidoc' }),
          }}
        />
      ) : null,
    [_provisionMessages],
  );
  return (
    <DescriptionList isHorizontal>
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
              <DescriptionListDescription>{provisionMessagesHtml}</DescriptionListDescription>
            </DescriptionListGroup>
          ) : null}
          {isAdmin || isLabDeveloper(groups) || (provisionDataEntries && provisionDataEntries.length > 0) ? (
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
                                  <a href={value} target="_blank" rel="noopener">
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
              {isAdmin || isLabDeveloper(groups) ? (
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
              {(isAdmin || isLabDeveloper(groups)) && resourceState?.status?.towerJobs ? (
                <DescriptionListGroup key="tower-jobs">
                  <DescriptionListTerm>Ansible Jobs</DescriptionListTerm>
                  <DescriptionListDescription>
                    <List style={{ margin: 'var(--pf-v5-global--spacer--sm) 0' }}>
                      {Object.entries(resourceState.status?.towerJobs).map(([stage, towerJob]) =>
                        towerJob.towerJobURL ? (
                          <ListItem key={stage}>
                            <Link
                              to={'https://' + towerJob.towerJobURL}
                              style={{ textTransform: 'capitalize' }}
                              target="_blank"
                            >
                              {stage}
                            </Link>
                          </ListItem>
                        ) : null,
                      )}
                    </List>
                  </DescriptionListDescription>
                </DescriptionListGroup>
              ) : null}
            </ExpandableSection>
          ) : null}
        </>
      ) : null}
    </DescriptionList>
  );
};

function _reducer(
  state: { salesforce_id: string; valid: boolean; completed: boolean; salesforce_type: SfdcType },
  action: {
    type: 'set_salesforceId' | 'complete';
    salesforceId?: string;
    salesforceIdValid?: boolean;
    salesforceType?: SfdcType;
  },
) {
  switch (action.type) {
    case 'set_salesforceId':
      return {
        salesforce_id: action.salesforceId,
        valid: false,
        completed: false,
        salesforce_type: action.salesforceType,
      };
    case 'complete':
      return {
        ...state,
        valid: action.salesforceIdValid,
        completed: true,
      };
  }
}

const ServicesItemComponent: React.FC<{
  activeTab: string;
  resourceClaimName: string;
  serviceNamespaceName: string;
}> = ({ activeTab, resourceClaimName, serviceNamespaceName }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const debouncedApiFetch = useDebounce(apiFetch, 1000);
  const { isAdmin, groups, serviceNamespaces: sessionServiceNamespaces } = useSession().getSession();
  const { mutate: globalMutate, cache } = useSWRConfig();
  const [expanded, setExpanded] = useState([]);
  const {
    data: resourceClaim,
    mutate,
    error,
  } = useSWR<ResourceClaim>(apiPaths.RESOURCE_CLAIM({ namespace: serviceNamespaceName, resourceClaimName }), fetcher, {
    refreshInterval: 8000,
    compare: compareK8sObjects,
  });
  useErrorHandler(error?.status === 404 ? error : null);

  const [salesforceObj, dispatchSalesforceObj] = useReducer(_reducer, {
    salesforce_id: resourceClaim.metadata.annotations[`${DEMO_DOMAIN}/salesforce-id`] || '',
    valid: !!resourceClaim.metadata.annotations[`${DEMO_DOMAIN}/salesforce-id`],
    completed: resourceClaim.metadata.annotations[`${DEMO_DOMAIN}/salesforce-id`] ? false : true,
    salesforce_type: (resourceClaim.metadata.annotations[`${DEMO_DOMAIN}/sales-type`] as SfdcType) || null,
  });
  const [serviceAlias, setServiceAlias] = useState(
    resourceClaim.metadata.annotations?.[`${DEMO_DOMAIN}/service-alias`] || '',
  );
  const debouncedServiceAlias = useDebounceState(serviceAlias, 300);
  const [modalAction, openModalAction] = useModal();
  const [modalScheduleAction, openModalScheduleAction] = useModal();
  const [modalCreateWorkshop, openModalCreateWorkshop] = useModal();
  const [modalState, setModalState] = useState<{
    action: ServiceActionActions;
    resourceClaim?: ResourceClaim;
    rating?: {
      rate: number;
      useful: 'yes' | 'no' | 'not applicable';
      comment: string;
    };
    submitDisabled: boolean;
  }>({ action: null, submitDisabled: false });

  useEffect(() => {
    if (!salesforceObj.completed) {
      checkSalesforceId(salesforceObj.salesforce_id, debouncedApiFetch, salesforceObj.salesforce_type).then(
        ({ valid, message }: { valid: boolean; message?: string }) =>
          dispatchSalesforceObj({ type: 'complete', salesforceIdValid: valid }),
      );
    } else if (
      resourceClaim.metadata.annotations?.[`${DEMO_DOMAIN}/salesforce-id`] !== salesforceObj.salesforce_id ||
      resourceClaim.metadata.annotations?.[`${DEMO_DOMAIN}/sales-type`] !== salesforceObj.salesforce_type
    ) {
      patchResourceClaim(resourceClaim.metadata.namespace, resourceClaim.metadata.name, {
        metadata: {
          annotations: {
            [`${DEMO_DOMAIN}/salesforce-id`]: salesforceObj.salesforce_id,
            [`${DEMO_DOMAIN}/sales-type`]: salesforceObj.salesforce_type,
          },
        },
      });
    }
  }, [dispatchSalesforceObj, salesforceObj, debouncedApiFetch]);

  useEffect(() => {
    if (debouncedServiceAlias !== resourceClaim.metadata.annotations?.[`${DEMO_DOMAIN}/service-alias`]) {
      patchResourceClaim(resourceClaim.metadata.namespace, resourceClaim.metadata.name, {
        metadata: {
          annotations: {
            [`${DEMO_DOMAIN}/service-alias`]: debouncedServiceAlias,
          },
        },
      }).then((updatedResourceClaim) => {
        mutate(updatedResourceClaim);
      });
    }
  }, [debouncedServiceAlias]);

  // As admin we need to fetch service namespaces for the service namespace dropdown
  const { data: userNamespaceList } = useSWR<NamespaceList>(
    isAdmin ? apiPaths.NAMESPACES({ labelSelector: 'usernamespace.gpte.redhat.com/user-uid' }) : '',
    fetcher,
  );
  const serviceNamespaces = useMemo(() => {
    return isAdmin ? userNamespaceList.items.map(namespaceToServiceNamespaceMapper) : sessionServiceNamespaces;
  }, [isAdmin, sessionServiceNamespaces, userNamespaceList]);
  const serviceNamespace = serviceNamespaces.find((ns) => ns.name === serviceNamespaceName) || {
    name: serviceNamespaceName,
    displayName: serviceNamespaceName,
  };
  const workshopName = resourceClaim.metadata?.labels?.[`${BABYLON_DOMAIN}/workshop`];
  const externalPlatformUrl = resourceClaim.metadata?.annotations?.[`${BABYLON_DOMAIN}/internalPlatformUrl`];
  const isPartOfWorkshop = isResourceClaimPartOfWorkshop(resourceClaim);
  const whiteGloved = getWhiteGloved(resourceClaim);
  const resourcesK8sObj = (resourceClaim.status?.resources || []).map((r: { state?: K8sObject }) => r.state);
  const anarchySubjects = resourcesK8sObj
    .filter((r: K8sObject) => r?.kind === 'AnarchySubject')
    .map((r) => r as AnarchySubject);
  const userData = JSON.parse(resourceClaim.metadata?.annotations?.[`${BABYLON_DOMAIN}/userData`] || 'null');
  const statusEnabled = false; //anarchySubjects.find((anarchySubject) => canExecuteAction(anarchySubject, 'status')) ? true : false;
  const consoleEnabled =
    resourceClaim.status?.summary?.provision_data?.osp_cluster_api ||
    resourceClaim.status?.summary?.provision_data?.openstack_auth_url ||
    (resourceClaim.status?.resources || []).find((r) => {
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
    (r) => r.state?.spec?.vars?.provision_data?.users,
  )
    ? true
    : false;

  const { data: workshop, mutate: mutateWorkshop } = useSWR<Workshop>(
    workshopName ? apiPaths.WORKSHOP({ namespace: serviceNamespaceName, workshopName }) : null,
    fetcher,
    {
      refreshInterval: 8000,
      compare: compareK8sObjects,
    },
  );
  const { data: userAssigmentsList, mutate: mutateUserAssigmentsList } = useSWR<WorkshopUserAssignmentList>(
    workshopName
      ? apiPaths.WORKSHOP_USER_ASSIGNMENTS({
          workshopName,
          namespace: serviceNamespaceName,
        })
      : null,
    fetcher,
    {
      refreshInterval: 15000,
    },
  );

  const { data: usageCost } = useSWR<RequestUsageCost>(
    apiPaths.USAGE_COST_REQUEST({ requestId: resourceClaim.metadata.uid }),
    silentFetcher,
  );

  const autoStopTime = getAutoStopTime(resourceClaim);
  const startTime = getStartTime(resourceClaim);
  const hasInfoMessageTemplate = !!getInfoMessageTemplate(resourceClaim);
  const stage = getStageFromK8sObject(resourceClaim);

  async function onModalAction(): Promise<void> {
    if (modalState.action === 'stop' || modalState.action === 'start') {
      const resourceClaimUpdate =
        modalState.action === 'start'
          ? resourceClaim.status?.summary
            ? await scheduleStartResourceClaim(resourceClaim)
            : await startAllResourcesInResourceClaim(resourceClaim)
          : resourceClaim.status?.summary
            ? await scheduleStopResourceClaim(resourceClaim)
            : await stopAllResourcesInResourceClaim(resourceClaim);
      mutate(resourceClaimUpdate);
      globalMutate(SERVICES_KEY({ namespace: resourceClaim.metadata.namespace }));
    }
    if (modalState.action === 'rate' || modalState.action === 'delete') {
      if (modalState.rating && (modalState.rating.rate !== null || modalState.rating.comment?.trim())) {
        await setProvisionRating(
          resourceClaim.metadata.uid,
          modalState.rating.rate,
          modalState.rating.comment,
          modalState.rating.useful,
        );
        globalMutate(apiPaths.USER_RATING({ requestUuid: resourceClaim.metadata.uid }));
      }
    }
    if (modalState.action === 'delete') {
      await deleteResourceClaim(resourceClaim);
      cache.delete(
        apiPaths.RESOURCE_CLAIM({
          namespace: resourceClaim.metadata.namespace,
          resourceClaimName: resourceClaim.metadata.name,
        }),
      );
      cache.delete(SERVICES_KEY({ namespace: resourceClaim.metadata.namespace }));
      navigate(`/services/${serviceNamespaceName}`);
    }
  }

  async function onModalScheduleAction(date: Date) {
    let resourceClaimUpdate = null;
    if (modalState.action === 'retirement') {
      resourceClaimUpdate = await setLifespanEndForResourceClaim(resourceClaim, date);
    } else if (modalState.action === 'start') {
      resourceClaimUpdate = await setLifespanStartForResourceClaim(resourceClaim, date);
    } else {
      if (resourceClaim.status?.summary) {
        resourceClaimUpdate = await scheduleStopResourceClaim(resourceClaim, date);
      } else {
        resourceClaimUpdate = await scheduleStopForAllResourcesInResourceClaim(resourceClaim, date);
      }
    }

    mutate(resourceClaimUpdate);
  }

  function onModalWorkshopCreate() {
    mutate();
    mutateWorkshop();
  }

  async function onCheckStatusRequest() {
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
        setModalState({ action, resourceClaim, submitDisabled: false });
        openModalAction();
      }
      if (modal === 'scheduleAction') {
        setModalState({ action, submitDisabled: false });
        openModalScheduleAction();
      }
      if (modal === 'createWorkshop') {
        openModalCreateWorkshop();
      }
    },
    [openModalAction, openModalCreateWorkshop, openModalScheduleAction],
  );

  const toggle = (id: string) => {
    const index = expanded.indexOf(id);
    const newExpanded: string[] =
      index >= 0 ? [...expanded.slice(0, index), ...expanded.slice(index + 1, expanded.length)] : [...expanded, id];
    setExpanded(newExpanded);
  };

  const mutateUserAssigments = useCallback(
    (userAssigments: WorkshopUserAssignment[]) => {
      const userAssigmentsListClone = Object.assign({}, userAssigmentsList);
      userAssigmentsListClone.items = Array.from(userAssigments);
      mutateUserAssigmentsList(userAssigmentsListClone);
    },
    [mutateUserAssigmentsList, userAssigmentsList],
  );

  return (
    <>
      <Modal ref={modalAction} onConfirm={onModalAction} passModifiers={true} isDisabled={modalState.submitDisabled}>
        <ServicesAction actionState={modalState} setActionState={setModalState} />
      </Modal>
      <Modal ref={modalCreateWorkshop} onConfirm={onModalWorkshopCreate} passModifiers={true}>
        <ServicesCreateWorkshop resourceClaim={resourceClaim} />
      </Modal>
      <Modal ref={modalScheduleAction} onConfirm={onModalScheduleAction} passModifiers={true}>
        <ServicesScheduleAction action={modalState.action || 'stop'} resourceClaim={resourceClaim} />
      </Modal>
      {isAdmin || serviceNamespaces.length > 1 ? (
        <PageSection key="topbar" className="services-item__topbar" variant={PageSectionVariants.light}>
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
            <Title headingLevel="h4" size="xl" style={{ display: 'flex', alignItems: 'center' }}>
              {displayName(resourceClaim)}
              {stage !== 'prod' ? <Label>{stage}</Label> : null}
              {workshopName ? (
                <Label
                  key="service-item__workshop-ui"
                  tooltipDescription={<div>Workshop user interface is enabled</div>}
                >
                  Workshop UI
                </Label>
              ) : null}
              {serviceAlias ? (
                <Label key="service-alias" tooltipDescription={<div>Alias name for the service</div>}>
                  {serviceAlias}
                </Label>
              ) : null}
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
      {resourceClaim.spec.resources &&
      resourceClaim.spec.resources[0].provider.name === 'babylon-service-request-configmap' &&
      !isAdmin ? (
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
              /* @ts-ignore */
              <Tab eventKey="info" title={<TabTitleText>Info</TabTitleText>}>
                {activeTab === 'info' || !activeTab ? (
                  <InfoTab resourceClaim={resourceClaim} showModal={showModal} />
                ) : null}
              </Tab>
            ) : null}
            {/* @ts-ignore */}
            <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
              {activeTab === 'details' || (!activeTab && !hasInfoMessageTemplate) ? (
                <DescriptionList isHorizontal>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Name</DescriptionListTerm>
                    <DescriptionListDescription>
                      <Link
                        to={`/catalog?item=${
                          resourceClaim.metadata.labels?.[`${BABYLON_DOMAIN}/catalogItemNamespace`]
                        }/${resourceClaim.metadata.labels?.[`${BABYLON_DOMAIN}/catalogItemName`]}`}
                      >
                        {resourceClaim.metadata.name}
                      </Link>
                      {isAdmin ? <OpenshiftConsoleLink resource={resourceClaim} /> : null}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Alias</DescriptionListTerm>
                    <DescriptionListDescription>
                      <div
                        className="service-item__group-control--single"
                        style={{ maxWidth: 300, paddingBottom: '16px' }}
                      >
                        <TextInput
                          type="text"
                          key="service-alias"
                          id="service-alias"
                          onChange={async (_event: any, value: string) => {
                            setServiceAlias(value);
                          }}
                          value={serviceAlias}
                        />
                        <Tooltip position="right" content={<div>Alias name for the service.</div>}>
                          <OutlinedQuestionCircleIcon
                            aria-label="Alias name for the service."
                            className="tooltip-icon-only"
                          />
                        </Tooltip>
                      </div>
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

                  {startTime && startTime > Date.now() ? (
                    <DescriptionListGroup>
                      <DescriptionListTerm>Start</DescriptionListTerm>
                      <DescriptionListDescription>
                        <AutoStopDestroy
                          type="start"
                          onClick={() => {
                            showModal({ action: 'start', modal: 'scheduleAction', resourceClaim });
                          }}
                          resourceClaim={resourceClaim}
                          className="services-item__schedule-btn"
                          time={startTime}
                          variant="extended"
                        ></AutoStopDestroy>
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  ) : null}

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

                  <DescriptionListGroup>
                    <DescriptionListTerm>Amount spent</DescriptionListTerm>
                    <DescriptionListDescription>
                      {usageCost?.total_cost ? (
                        <p>
                          <CurrencyAmount amount={usageCost.total_cost} />{' '}
                          <span className="services-item__estimated-cost-label">
                            (Last update <TimeInterval toTimestamp={usageCost.last_update} />)
                          </span>
                        </p>
                      ) : (
                        'No data available'
                      )}
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  {resourceClaim.spec.resources?.length > 0 ||
                  resourceClaim.status?.summary ||
                  new Date(resourceClaim.spec.lifespan.start).getTime() > new Date().getTime() ? (
                    <DescriptionListGroup>
                      <DescriptionListTerm>Status</DescriptionListTerm>
                      <DescriptionListDescription>
                        <ServiceStatus
                          creationTime={Date.parse(resourceClaim.metadata.creationTimestamp)}
                          resource={getMostRelevantResourceAndTemplate(resourceClaim).resource}
                          resourceTemplate={getMostRelevantResourceAndTemplate(resourceClaim).template}
                          resourceClaim={resourceClaim}
                          summary={resourceClaim.status?.summary}
                        />
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  ) : null}

                  {!isPartOfWorkshop ? (
                    <DescriptionListGroup>
                      <DescriptionListTerm>Salesforce ID</DescriptionListTerm>

                      <div>
                        <div className="service-item__group-control--single" style={{ padding: '8px' }}>
                          <Radio
                            isChecked={'campaign' === salesforceObj.salesforce_type}
                            name="sfdc-type"
                            onChange={() =>
                              dispatchSalesforceObj({
                                ...salesforceObj,
                                salesforceType: 'campaign',
                                type: 'set_salesforceId',
                                salesforceId: salesforceObj.salesforce_id,
                              })
                            }
                            label="Campaign"
                            id="sfdc-type-campaign"
                          ></Radio>
                          <Radio
                            isChecked={'opportunity' === salesforceObj.salesforce_type}
                            name="sfdc-type"
                            onChange={() => {
                              dispatchSalesforceObj({
                                ...salesforceObj,
                                type: 'set_salesforceId',
                                salesforceType: 'opportunity',
                                salesforceId: salesforceObj.salesforce_id,
                              });
                            }}
                            label="Opportunity"
                            id="sfdc-type-opportunity"
                          ></Radio>
                          <Radio
                            isChecked={'project' === salesforceObj.salesforce_type}
                            name="sfdc-type"
                            onChange={() =>
                              dispatchSalesforceObj({
                                ...salesforceObj,
                                type: 'set_salesforceId',
                                salesforceType: 'project',
                                salesforceId: salesforceObj.salesforce_id,
                              })
                            }
                            label="Project"
                            id="sfdc-type-project"
                          ></Radio>
                          <Tooltip
                            position="right"
                            content={<div>Salesforce ID type: Opportunity ID, Campaign ID or Project ID.</div>}
                          >
                            <OutlinedQuestionCircleIcon
                              aria-label="Salesforce ID type: Opportunity ID, Campaign ID or Project ID."
                              className="tooltip-icon-only"
                            />
                          </Tooltip>
                        </div>
                        <div
                          className="service-item__group-control--single"
                          style={{ maxWidth: 300, paddingBottom: '16px' }}
                        >
                          <TextInput
                            type="text"
                            key="salesforce_id"
                            id="salesforce_id"
                            onChange={(_event: any, value: string) =>
                              dispatchSalesforceObj({
                                ...salesforceObj,
                                type: 'set_salesforceId',
                                salesforceId: value,
                                salesforceType: salesforceObj.salesforce_type,
                              })
                            }
                            value={salesforceObj.salesforce_id}
                            validated={
                              salesforceObj.salesforce_id
                                ? salesforceObj.completed && salesforceObj.valid
                                  ? 'success'
                                  : salesforceObj.completed
                                    ? 'error'
                                    : 'default'
                                : 'default'
                            }
                          />
                          <Tooltip
                            position="right"
                            content={<div>Salesforce Opportunity ID, Campaign ID or Project ID.</div>}
                          >
                            <OutlinedQuestionCircleIcon
                              aria-label="Salesforce Opportunity ID, Campaign ID or Project ID."
                              className="tooltip-icon-only"
                            />
                          </Tooltip>
                        </div>
                      </div>
                    </DescriptionListGroup>
                  ) : null}

                  {!isPartOfWorkshop && isAdmin ? (
                    <DescriptionListGroup>
                      <DescriptionListTerm> </DescriptionListTerm>
                      <DescriptionListDescription>
                        <Switch
                          id="white-glove-switch"
                          aria-label="White-Glove Support"
                          label="White-Glove Support (for admins to tick when giving a white gloved experience)"
                          isChecked={whiteGloved}
                          hasCheckIcon
                          onChange={async (_event: any, isChecked: boolean) => {
                            mutate(
                              await patchResourceClaim(resourceClaim.metadata.namespace, resourceClaim.metadata.name, {
                                metadata: {
                                  labels: {
                                    [`${DEMO_DOMAIN}/white-glove`]: String(isChecked),
                                  },
                                },
                              }),
                            );
                          }}
                        />
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  ) : null}
                  <ConditionalWrapper
                    condition={resourceClaim.spec.resources && resourceClaim.spec.resources.length > 1}
                    wrapper={(children) => (
                      <section>
                        <header>
                          <h3
                            style={{
                              fontSize: 'var(--pf-v5-global--FontSize--sm)',
                              fontWeight: 'var(--pf-v5-global--FontWeight--bold)',
                              lineHeight: 'var(--pf-v5-global--LineHeight--sm)',
                              marginBottom: 'var(--pf-v5-global--spacer--sm)',
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
                      {(resourceClaim.status?.resources || []).map((resourceStatus, idx) => {
                        const resourceState = resourceStatus?.state;
                        const componentDisplayName =
                          resourceClaim.metadata.annotations?.[`${BABYLON_DOMAIN}/displayNameComponent${idx}`] ||
                          resourceStatus?.name;
                        const currentState =
                          resourceState?.kind === 'AnarchySubject'
                            ? resourceState.spec.vars?.current_state
                            : 'available';
                        const stopTimestamp =
                          resourceState?.kind === 'AnarchySubject'
                            ? resourceState?.spec.vars.action_schedule?.stop
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
                            ? resourceState?.spec.vars.action_schedule?.start
                            : null;
                        const startTime = startTimestamp ? Date.parse(startTimestamp) : null;
                        const startDate = startTime ? new Date(startTime) : null;

                        return (
                          <ConditionalWrapper
                            key={idx}
                            condition={resourceClaim.status?.resources && resourceClaim.status.resources.length > 1}
                            wrapper={(children) => (
                              <Accordion asDefinitionList={false} style={{ maxWidth: '600px' }}>
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
                              </Accordion>
                            )}
                          >
                            <ComponentDetailsList
                              resourceState={resourceState}
                              isAdmin={isAdmin}
                              groups={groups}
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
              /* @ts-ignore */
              <Tab eventKey="status" title={<TabTitleText>Status</TabTitleText>}>
                {activeTab === 'status' ? (
                  <ServiceItemStatus onCheckStatusRequest={onCheckStatusRequest} resourceClaim={resourceClaim} />
                ) : null}
              </Tab>
            ) : null}

            {consoleEnabled ? (
              /* @ts-ignore */
              <Tab eventKey="console" title={<TabTitleText>Console</TabTitleText>}>
                {activeTab === 'console' ? <ServiceOpenStackConsole resourceClaim={resourceClaim} /> : null}
              </Tab>
            ) : null}

            {workshopName && !isPartOfWorkshop ? (
              [
                /* @ts-ignore */
                <Tab eventKey="workshop" key="workshop" title={<TabTitleText>Workshop</TabTitleText>}>
                  {activeTab === 'workshop' ? (
                    <WorkshopsItemDetails
                      onWorkshopUpdate={(workshop) => mutateWorkshop(workshop)}
                      workshop={workshop}
                      workshopUserAssignments={userAssigmentsList.items}
                    />
                  ) : null}
                </Tab>,
                <Tab eventKey="users" key="users" title={<TabTitleText>Users</TabTitleText>}>
                  {activeTab === 'users' ? (
                    <WorkshopsItemUserAssignments
                      onUserAssignmentsUpdate={mutateUserAssigments}
                      userAssignments={userAssigmentsList.items}
                    />
                  ) : null}
                </Tab>,
              ]
            ) : serviceHasUsers ? (
              /* @ts-ignore */
              <Tab eventKey="users" title={<TabTitleText>Users</TabTitleText>}>
                {activeTab === 'users' ? (
                  <>
                    {!workshopName &&
                    resourceClaim.metadata?.annotations?.[`${DEMO_DOMAIN}/workshopUiDisabled`] !== 'true' ? (
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
            {/* @ts-ignore */}
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

const ServicesItem: React.FC<{
  activeTab: string;
  resourceClaimName: string;
  serviceNamespaceName: string;
}> = ({ activeTab, resourceClaimName, serviceNamespaceName }) => (
  <ErrorBoundaryPage namespace={serviceNamespaceName} name={resourceClaimName} type="Service">
    <ServicesItemComponent
      activeTab={activeTab}
      resourceClaimName={resourceClaimName}
      serviceNamespaceName={serviceNamespaceName}
    />
  </ErrorBoundaryPage>
);

export default ServicesItem;
