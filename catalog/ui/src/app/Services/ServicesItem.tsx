import React, { useCallback, useMemo, useState, useEffect } from 'react';
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
  FormGroup,
  Label as PFLabel,
  LabelGroup,
  PageSection,
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
  Tooltip,
  TextInput,
  Switch,
  NumberInput,
  Alert,
  Popover,
} from '@patternfly/react-core';
import { Modal as PFModal, ModalBody as PFModalBody, ModalFooter as PFModalFooter, ModalHeader as PFModalHeader } from '@patternfly/react-core';
import {
  apiPaths,
  deleteResourceClaim,
  fetcher,
  silentFetcher,
  optionalFetcher,
  FORBIDDEN_RESPONSE,
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
  createServiceAccessConfig,
  patchServiceAccessConfig,
  deleteServiceAccessConfig,
} from '@app/api';
import {
  AnarchySubject,
  CatalogItem,
  K8sObject,
  NamespaceList,
  RequestUsageCost,
  ResourceClaim,
  ServiceAccessConfig,
  ServiceActionActions,
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
  parseSalesforceItems,
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
import { getAutoStopTime, getInfoMessageTemplate, getStartTime, isResourceClaimLocked } from './service-utils';
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
import useDebounceState from '@app/utils/useDebounceState';
import SalesforceItemsList from '@app/components/SalesforceItemsList';
import SalesforceItemsEditModal from '@app/components/SalesforceItemsEditModal';
import useSWRImmutable from 'swr/immutable';
import { PlusCircleIcon } from '@patternfly/react-icons';
import useInterfaceConfig from '@app/utils/useInterfaceConfig';
import UserDisabledModal from '@app/components/UserDisabledModal';

import ResourcePoolSelector from '@app/components/ResourcePoolSelector';

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
  const [now] = useState(() => Date.now());
  return (
    <DescriptionList isHorizontal>
      {resourceState?.kind === 'AnarchySubject' ? (
        <>
          {externalPlatformUrl || isPartOfWorkshop ? null : startDate && Number(startDate) > now ? (
            <DescriptionListGroup>
              <DescriptionListTerm>Scheduled Start</DescriptionListTerm>
              <DescriptionListDescription>
                <LocalTimestamp timestamp={startTimestamp} />
                <span style={{ padding: '0 6px' }}>
                  (<TimeInterval toTimestamp={startTimestamp} />)
                </span>
              </DescriptionListDescription>
            </DescriptionListGroup>
          ) : stopDate && Number(stopDate) > now ? null : currentState !== 'stopped' ? (
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
                                  <a href={value} target="_blank" rel="noopener noreferrer">
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
                    <List style={{ margin: 'var(--pf-t--global--spacer--sm)' }}>
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

const ServicesItemComponent: React.FC<{
  activeTab: string;
  resourceClaimName: string;
  serviceNamespaceName: string;
}> = ({ activeTab, resourceClaimName, serviceNamespaceName }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { sfdc_enabled } = useInterfaceConfig();
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
  // Show 404 when resourceClaim is not found or is being deleted
  useErrorHandler(error?.status === 404 || resourceClaim?.metadata?.deletionTimestamp ? { status: 404 } : null);
  const { data: catalogItem } = useSWRImmutable<CatalogItem>(
    resourceClaim.metadata.labels?.[`${BABYLON_DOMAIN}/catalogItemName`]
      ? apiPaths.CATALOG_ITEM({
          namespace: resourceClaim.metadata.labels[`${BABYLON_DOMAIN}/catalogItemNamespace`],
          name: resourceClaim.metadata.labels[`${BABYLON_DOMAIN}/catalogItemName`],
        })
      : null,
    silentFetcher,
  );

  const [serviceAlias, setServiceAlias] = useState(
    resourceClaim.metadata.annotations?.[`${DEMO_DOMAIN}/service-alias`] || '',
  );
  const debouncedServiceAlias = useDebounceState(serviceAlias, 300);
  const opsEffortAnnotation = resourceClaim.metadata.annotations?.[`${DEMO_DOMAIN}/ops-effort`];
  const opsEffortFromAnnotation = useMemo(() => parseInt(opsEffortAnnotation || '0', 10) || 0, [opsEffortAnnotation]);
  const [opsEffort, setOpsEffort] = useState<number>(opsEffortFromAnnotation);
  const debouncedOpsEffort = useDebounceState(opsEffort, 300);
  const resourcePoolAnnotation = resourceClaim.metadata.annotations?.['poolboy.gpte.redhat.com/resource-pool-name'];
  const [selectedResourcePool, setSelectedResourcePool] = useState<string | undefined>(resourcePoolAnnotation);
  const salesforceItems = parseSalesforceItems(resourceClaim.metadata.annotations || {});
  const [modalAction, openModalAction] = useModal();
  const [modalScheduleAction, openModalScheduleAction] = useModal();
  const [modalCreateWorkshop, openModalCreateWorkshop] = useModal();
  const [modalEditSalesforce, setModalEditSalesforce] = useState(false);
  const [modalAddServiceAccess, setModalAddServiceAccess] = useState(false);
  const [isUserDisabledModalOpen, setIsUserDisabledModalOpen] = useState(false);
  const [newServiceAccessEmail, setNewServiceAccessEmail] = useState('');
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

  const isPartOfWorkshop = isResourceClaimPartOfWorkshop(resourceClaim);

  const {
    data: serviceAccessConfigResponse,
    isLoading: serviceAccessLoading,
    mutate: mutateServiceAccessConfig,
  } = useSWR<ServiceAccessConfig | typeof FORBIDDEN_RESPONSE | null>(
    !isPartOfWorkshop && (isAdmin || sessionServiceNamespaces.some((ns) => ns.name === resourceClaim.metadata.namespace))
      ? apiPaths.SERVICE_ACCESS_CONFIG({
          namespace: resourceClaim.metadata.namespace,
          name: resourceClaim.metadata.name,
        })
      : null,
    optionalFetcher,
  );
  const canManageCollaborators = (sessionServiceNamespaces.some((ns) => ns.name === resourceClaim.metadata.namespace) && serviceAccessConfigResponse !== FORBIDDEN_RESPONSE) || isAdmin;
  const serviceAccessConfig = canManageCollaborators ? serviceAccessConfigResponse as ServiceAccessConfig | null : null;

  const serviceAccessUsers = useMemo(() => {
    if (!serviceAccessConfig?.spec?.users) return [];
    return serviceAccessConfig.spec.users.map((u) => u.name);
  }, [serviceAccessConfig]);

  async function handleAddServiceAccessUser() {
    const email = newServiceAccessEmail.trim();
    if (!email) return;

    const updatedUsers = [...serviceAccessUsers, email];

    try {
      if (serviceAccessConfig) {
        const updatedConfig = await patchServiceAccessConfig({
          name: resourceClaim.metadata.name,
          namespace: resourceClaim.metadata.namespace,
          users: updatedUsers,
        });
        mutateServiceAccessConfig(updatedConfig);
      } else {
        const newConfig = await createServiceAccessConfig({
          name: resourceClaim.metadata.name,
          namespace: resourceClaim.metadata.namespace,
          serviceName: resourceClaim.metadata.name,
          serviceNamespace: resourceClaim.metadata.namespace,
          serviceKind: 'ResourceClaim',
          users: updatedUsers,
        });
        mutateServiceAccessConfig(newConfig);
      }
    } catch (error) {
      console.error('Failed to update ServiceAccessConfig:', error);
    }

    setNewServiceAccessEmail('');
    setModalAddServiceAccess(false);
  }

  async function handleRemoveServiceAccessUser(emailToRemove: string) {
    const updatedUsers = serviceAccessUsers.filter((email: string) => email !== emailToRemove);

    try {
      if (updatedUsers.length === 0) {
        await deleteServiceAccessConfig({
          name: resourceClaim.metadata.name,
          namespace: resourceClaim.metadata.namespace,
        });
        mutateServiceAccessConfig(null);
      } else {
        const updatedConfig = await patchServiceAccessConfig({
          name: resourceClaim.metadata.name,
          namespace: resourceClaim.metadata.namespace,
          users: updatedUsers,
        });
        mutateServiceAccessConfig(updatedConfig);
      }
    } catch (error) {
      console.error('Failed to update ServiceAccessConfig:', error);
    }
  }

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
  }, [
    debouncedServiceAlias,
    mutate,
    resourceClaim.metadata.annotations,
    resourceClaim.metadata.name,
    resourceClaim.metadata.namespace,
  ]);

  useEffect(() => {
    setOpsEffort(opsEffortFromAnnotation);
  }, [opsEffortFromAnnotation]);

  useEffect(() => {
    if (debouncedOpsEffort !== opsEffortFromAnnotation) {
      const opsEffortValue =
        typeof debouncedOpsEffort === 'number' ? debouncedOpsEffort : Number(debouncedOpsEffort) || 0;
      patchResourceClaim(resourceClaim.metadata.namespace, resourceClaim.metadata.name, {
        metadata: {
          annotations: {
            [`${DEMO_DOMAIN}/ops-effort`]: String(opsEffortValue),
          },
        },
      }).then((updatedResourceClaim) => {
        mutate(updatedResourceClaim);
      });
    }
  }, [
    debouncedOpsEffort,
    opsEffortFromAnnotation,
    mutate,
    resourceClaim.metadata.name,
    resourceClaim.metadata.namespace,
  ]);

  useEffect(() => {
    setSelectedResourcePool(resourcePoolAnnotation);
  }, [resourcePoolAnnotation]);

  async function handleResourcePoolChange(poolName: string | undefined) {
    setSelectedResourcePool(poolName);
    mutate(
      await patchResourceClaim(resourceClaim.metadata.namespace, resourceClaim.metadata.name, {
        metadata: {
          annotations: {
            'poolboy.gpte.redhat.com/resource-pool-name': poolName || null,
          },
        },
      }),
    );
  }

  async function handleLockedChange(_: unknown, isChecked: boolean) {
    mutate(
      await patchResourceClaim(resourceClaim.metadata.namespace, resourceClaim.metadata.name, {
        metadata: {
          labels: {
            [`${DEMO_DOMAIN}/lock-enabled`]: String(isChecked),
          },
        },
      }),
    );
  }

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
  const isCollaborator = !isAdmin && !sessionServiceNamespaces.some((ns) => ns.name === serviceNamespaceName);
  const workshopName = resourceClaim.metadata?.labels?.[`${BABYLON_DOMAIN}/workshop`];
  const externalPlatformUrl = resourceClaim.metadata?.annotations?.[`${BABYLON_DOMAIN}/internalPlatformUrl`];
  const whiteGloved = getWhiteGloved(resourceClaim);
  const isLocked = isResourceClaimLocked(resourceClaim);
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

  const actionHandlers: {
    runtime?: () => void;
    lifespan?: () => void;
    delete?: () => void;
    start?: () => void;
    stop?: () => void;
    manageWorkshop?: () => void;
    rate?: () => void;
  } = {
    delete: () => showModal({ action: 'delete', modal: 'action', resourceClaim }),
    lifespan: () => showModal({ action: 'retirement', modal: 'scheduleAction', resourceClaim }),
  };
  
  if (anarchySubjects.find((anarchySubject) => canExecuteAction(anarchySubject, 'start'))) {
    actionHandlers.start = () => showModal({ action: 'start', modal: 'action', resourceClaim });
  }
  if (anarchySubjects.find((anarchySubject) => canExecuteAction(anarchySubject, 'stop'))) {
    actionHandlers.stop = () => showModal({ action: 'stop', modal: 'action', resourceClaim });
    actionHandlers.runtime = () => showModal({ action: 'stop', modal: 'scheduleAction', resourceClaim });
  }
  if (isPartOfWorkshop) {
    actionHandlers.manageWorkshop = () => navigate(`/workshops/${serviceNamespace.name}/${workshopName}`);
  } else {
    actionHandlers.rate = () => showModal({ action: 'rate', modal: 'action', resourceClaim });
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
        return data?.labUserInterfaceUrl || data?.lab_ui_url || data?.bookbag_url || data?.showroom_primary_view_url;
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
        globalMutate(apiPaths.USER_RATING({ requestUid: resourceClaim.metadata.uid }));
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
      <Modal
        ref={modalCreateWorkshop}
        onConfirm={onModalWorkshopCreate}
        passModifiers={true}
        onError={(error: unknown) => {
          if ((error as Response).status === 403) {
            setIsUserDisabledModalOpen(true);
          }
        }}
      >
        <ServicesCreateWorkshop resourceClaim={resourceClaim} />
      </Modal>
      <UserDisabledModal
        isOpen={isUserDisabledModalOpen}
        onClose={() => setIsUserDisabledModalOpen(false)}
      />
      <Modal ref={modalScheduleAction} onConfirm={onModalScheduleAction} passModifiers={true}>
        <ServicesScheduleAction
          action={
            {
              delete: 'retirement',
              retirement: 'retirement',
              start: 'start',
              stop: 'stop',
            }[modalState.action ?? 'stop']
          }
          resourceClaim={resourceClaim}
        />
      </Modal>
      {isAdmin || serviceNamespaces.length > 1 ? (
        <PageSection hasBodyWrapper={false} key="topbar" className="services-item__topbar">
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
      <PageSection hasBodyWrapper={false} key="head" className="services-item__head">
        <Split hasGutter>
          <SplitItem isFilled>
            {isAdmin || serviceNamespaces.length > 1 ? (
              <Breadcrumb>
                <BreadcrumbItem
                  render={({ className }) => (
                    <Link to="/services" className={className}>
                      My Services
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
                      My Services
                    </Link>
                  )}
                />
                <BreadcrumbItem>{resourceClaimName}</BreadcrumbItem>
              </Breadcrumb>
            )}
            <Title headingLevel="h4" size="xl" style={{ display: 'flex', alignItems: 'center' }}>
              {displayName(resourceClaim)}
              {isCollaborator ? (
                <Label key="service-item__collaborator" tooltipDescription={<div>You have been granted access to this service as a collaborator</div>}>
                  Shared Service
                </Label>
              ) : null}
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
                <ServiceActions position="right" resourceClaim={resourceClaim} actionHandlers={actionHandlers} canManageCollaborators={canManageCollaborators} />
              )}
            </Bullseye>
          </SplitItem>
        </Split>
      </PageSection>
      {resourceClaim.spec.resources &&
      resourceClaim.spec.resources[0].provider.name === 'babylon-service-request-configmap' &&
      !isAdmin ? (
        <PageSection hasBodyWrapper={false} key="body" className="services-item__body" style={{ paddingTop: '1em' }}>
          <p>Thank you for your interest in {catalogItem?.spec.displayName || 'this service'}.</p>
        </PageSection>
      ) : (
        <PageSection hasBodyWrapper={false} key="body" className="services-item__body">
          <Tabs
            activeKey={activeTab ? activeTab : hasInfoMessageTemplate ? 'info' : 'details'}
            onSelect={(e, tabIndex) => navigate(`/services/${serviceNamespaceName}/${resourceClaimName}/${tabIndex}`)}
          >
            {hasInfoMessageTemplate ? (
              <Tab eventKey="info" key="info" title={<TabTitleText>Info</TabTitleText>}>
                {activeTab === 'info' || !activeTab ? (
                  <InfoTab resourceClaim={resourceClaim} showModal={showModal} />
                ) : null}
              </Tab>
            ) : null}
            <Tab eventKey="details" key="details" title={<TabTitleText>Details</TabTitleText>}>
              {activeTab === 'details' || (!activeTab && !hasInfoMessageTemplate) ? (
                <DescriptionList isHorizontal>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Name</DescriptionListTerm>
                    <DescriptionListDescription>
                      {catalogItem?.metadata.namespace && catalogItem?.metadata.name ? (
                        <Link to={`/catalog?item=${catalogItem?.metadata.namespace}/${catalogItem?.metadata.name}`}>
                          {resourceClaim.metadata.name}
                        </Link>
                      ) : (
                        <p>{resourceClaim.metadata.name}</p>
                      )}
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
                          onChange={async (_event: unknown, value: string) => {
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
                          type="auto-start"
                          onClick={() => {
                            if (!isLocked) {
                              showModal({ action: 'start', modal: 'scheduleAction', resourceClaim });
                            }
                          }}
                          isDisabled={isLocked}
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
                          if (!isLocked) {
                            showModal({ action: 'stop', modal: 'scheduleAction', resourceClaim });
                          }
                        }}
                        isDisabled={isLocked}
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
                            if (!isLocked) {
                              showModal({ action: 'retirement', modal: 'scheduleAction', resourceClaim });
                            }
                          }}
                          isDisabled={isLocked}
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
                    <DescriptionListTerm>
                      Amount spent{' '}
                      <Popover
                        triggerAction="hover"
                        headerContent="How is Amount spent calculated?"
                        bodyContent={
                          <div>
                            <p>
                              Amount spent represents an estimated cost based on the cloud provider and service backing
                              this environment. Cost calculations follow provider-specific models and are updated once
                              per day.
                            </p>
                            <p>
                              <strong>Cost models by provider and service</strong>
                            </p>
                            <p>
                              <strong>AWS and Azure</strong>
                              <br />
                              Costs are sourced directly from the cloud account or subscription and accrue from
                              provisioning to deletion of resources.
                            </p>
                            <p>
                              <strong>OpenShift CNV</strong>
                              <br />
                              Costs are calculated using a fixed hourly price list, based on project usage, and accrue
                              from provisioning to deletion.
                            </p>
                            <p>
                              <strong>GCP</strong>
                              <br />
                              Costs are sourced directly from the associated GCP project.
                            </p>
                            <p>
                              The amount shown is the total accumulated cost, starting from the provision start date
                              and time, including any initial provisioning or pool-related resources.
                            </p>
                          </div>
                        }
                      >
                        <OutlinedQuestionCircleIcon
                          aria-label="Amount spent calculation information"
                          className="tooltip-icon-only"
                          style={{ cursor: 'pointer' }}
                        />
                      </Popover>
                    </DescriptionListTerm>
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

                  <DescriptionListGroup>
                    <DescriptionListTerm>Status</DescriptionListTerm>
                    <DescriptionListDescription>
                      <ServiceStatus resourceClaim={resourceClaim} />
                    </DescriptionListDescription>
                  </DescriptionListGroup>

                  {!isPartOfWorkshop && sfdc_enabled ? (
                    <DescriptionListGroup>
                      <DescriptionListTerm>Salesforce IDs</DescriptionListTerm>
                      <DescriptionListDescription>
                        <SalesforceItemsList items={salesforceItems} />
                        <Button
                          variant="plain"
                          icon={<PlusCircleIcon />}
                          onClick={() => setModalEditSalesforce(true)}
                          style={{ alignSelf: 'flex-start' }}
                        >
                          Add Salesforce IDs
                        </Button>
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  ) : null}

                  {!isPartOfWorkshop && canManageCollaborators ? (
                    <DescriptionListGroup>
                      <DescriptionListTerm>
                        Share service{' '}
                        <Tooltip position="right" content={<p>Users who have access to this service.</p>}>
                          <OutlinedQuestionCircleIcon
                            aria-label="Users who have access to this service."
                            className="tooltip-icon-only"
                          />
                        </Tooltip>
                      </DescriptionListTerm>
                      <DescriptionListDescription>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--pf-t--global--spacer--sm)' }}>
                          {serviceAccessLoading ? (
                            <Spinner size="md" />
                          ) : serviceAccessUsers.length > 0 ? (
                            <LabelGroup>
                              {serviceAccessUsers.map((email: string) => (
                                <PFLabel
                                  key={email}
                                  onClose={() => handleRemoveServiceAccessUser(email)}
                                  closeBtnAriaLabel={`Remove ${email}`}
                                >
                                  {email}
                                </PFLabel>
                              ))}
                            </LabelGroup>
                          ) : (
                            <span style={{ color: 'var(--pf-t--global--color--nonstatus--gray--default)' }}>
                              No users configured
                            </span>
                          )}
                          <Button
                            variant="link"
                            icon={<PlusCircleIcon />}
                            onClick={() => setModalAddServiceAccess(true)}
                            style={{ alignSelf: 'flex-start', paddingLeft: 0, paddingTop: 0, paddingBottom: 0, paddingRight: 0 }}
                          >
                            Share service
                          </Button>
                        </div>
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  ) : null}

                  {!isPartOfWorkshop && isAdmin ? (
                    <>
                      <DescriptionListGroup className="services-item__admin-section">
                        <DescriptionListTerm>Admin Settings</DescriptionListTerm>
                        <DescriptionListDescription className="services-item__admin-description">
                          <div className="services-item__admin-fields">
                            <div className="services-item__admin-field">
                              <Switch
                                id="white-glove-switch"
                                aria-label="White-Glove Support"
                                label="White-Glove Support (for admins to tick when giving a white gloved experience)"
                                isChecked={whiteGloved}
                                hasCheckIcon
                                onChange={async (_event: unknown, isChecked: boolean) => {
                                  mutate(
                                    await patchResourceClaim(
                                      resourceClaim.metadata.namespace,
                                      resourceClaim.metadata.name,
                                      {
                                        metadata: {
                                          labels: {
                                            [`${DEMO_DOMAIN}/white-glove`]: String(isChecked),
                                          },
                                        },
                                      },
                                    ),
                                  );
                                }}
                              />
                            </div>
                            <div className="services-item__admin-field">
                              <div className="service-item__group-control--single" style={{ maxWidth: 350 }}>
                                <label htmlFor="ops-effort-input">
                                  Ops Effort
                                </label>
                                <NumberInput
                                  id="ops-effort-input"
                                  aria-label="Ops Effort"
                                  min={0}
                                  value={opsEffort}
                                  onMinus={() => {
                                    const newValue = Math.max(0, (typeof opsEffort === 'number' ? opsEffort : 0) - 1);
                                    setOpsEffort(newValue);
                                  }}
                                  onPlus={() => {
                                    const newValue = (typeof opsEffort === 'number' ? opsEffort : 0) + 1;
                                    setOpsEffort(newValue);
                                  }}
                                  onChange={(event: React.FormEvent<HTMLInputElement>) => {
                                    const inputValue = event.currentTarget.value;
                                    const value = inputValue === '' ? 0 : parseInt(inputValue, 10);
                                    if (!isNaN(value) && value >= 0) {
                                      setOpsEffort(value);
                                    }
                                  }}
                                />
                                <Tooltip
                                  position="right"
                                  content={<div>Operations effort value for this workshop.</div>}
                                >
                                  <OutlinedQuestionCircleIcon
                                    aria-label="Operations effort value for this workshop."
                                    className="tooltip-icon-only"
                                  />
                                </Tooltip>
                              </div>
                            </div>
                            <div
                              className="services-item__admin-field"
                              style={{ marginTop: 'var(--pf-t--global--spacer--md)' }}
                            >
                              <Switch
                                id="lock-switch"
                                aria-label="Locked"
                                label="Locked"
                                isChecked={isLocked}
                                hasCheckIcon
                                onChange={handleLockedChange}
                              />
                            </div>
                            <div
                              className="services-item__admin-field"
                              style={{ marginTop: 'var(--pf-t--global--spacer--md)' }}
                            >
                              <div className="service-item__group-control--single" style={{ maxWidth: 350 }}>
                                <label htmlFor="resource-pool-selector">Resource Pool</label>
                                <ResourcePoolSelector
                                  disableAutoSelect
                                  selectedPool={selectedResourcePool}
                                  onSelect={handleResourcePoolChange}
                                />
                                <Tooltip
                                  position="right"
                                  content={<p>Select a specific resource pool for this service.</p>}
                                >
                                  <OutlinedQuestionCircleIcon
                                    aria-label="Select a specific resource pool for this service"
                                    className="tooltip-icon-only"
                                  />
                                </Tooltip>
                              </div>
                            </div>
                          </div>
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    </>
                  ) : null}
                  <ConditionalWrapper
                    condition={resourceClaim.spec.resources && resourceClaim.spec.resources.length > 1}
                    wrapper={(children) => (
                      <section>
                        <header>
                          <h3
                            style={{
                              fontSize: 'var(--pf-t--global--font--size--sm)',
                              fontWeight: 'var(--pf-t--global--font--weight--heading--bold)',
                              lineHeight: 'var(--pf-t--global--font--line-height--heading)',
                              marginBottom: 'var(--pf-t--global--spacer--sm)',
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
                          catalogItem?.spec.linkedComponents?.find((c) => c.name == resourceStatus.name)?.displayName ||
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
                                key === 'showroom_primary_view_url' ||
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
                                <AccordionItem isExpanded={expanded.includes(`item-${idx}`)}>
                                  <AccordionToggle id={`item-${idx}`} onClick={() => toggle(`item-${idx}`)}>
                                    {componentDisplayName}
                                  </AccordionToggle>
                                  <AccordionContent id={`item-${idx}`}>{children}</AccordionContent>
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
              <Tab eventKey="status" key="status" title={<TabTitleText>Status</TabTitleText>}>
                {activeTab === 'status' ? (
                  <ServiceItemStatus onCheckStatusRequest={onCheckStatusRequest} resourceClaim={resourceClaim} />
                ) : null}
              </Tab>
            ) : null}

            {consoleEnabled ? (
              <Tab eventKey="console" key="console" title={<TabTitleText>Console</TabTitleText>}>
                {activeTab === 'console' ? <ServiceOpenStackConsole resourceClaim={resourceClaim} /> : null}
              </Tab>
            ) : null}

            {workshopName && !isPartOfWorkshop ? (
              <Tab eventKey="workshop" key="workshop" title={<TabTitleText>Workshop</TabTitleText>}>
                {activeTab === 'workshop' ? (
                  <WorkshopsItemDetails
                    onWorkshopUpdate={(workshop) => mutateWorkshop(workshop)}
                    workshop={workshop}
                    workshopUserAssignments={userAssigmentsList.items}
                  />
                ) : null}
              </Tab>
            ) : null}
            {workshopName && !isPartOfWorkshop ? (
              <Tab eventKey="users" key="users" title={<TabTitleText>Users</TabTitleText>}>
                {activeTab === 'users' ? (
                  <WorkshopsItemUserAssignments
                    onUserAssignmentsUpdate={mutateUserAssigments}
                    userAssignments={userAssigmentsList.items}
                  />
                ) : null}
              </Tab>
            ) : serviceHasUsers ? (
              <Tab eventKey="users" key="enable-users" title={<TabTitleText>Users</TabTitleText>}>
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
            <Tab eventKey="yaml" key="yaml" title={<TabTitleText>YAML</TabTitleText>}>
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
      <SalesforceItemsEditModal
        isOpen={modalEditSalesforce}
        onClose={() => setModalEditSalesforce(false)}
        items={salesforceItems}
        onSave={async (next) => {
          const rc = await patchResourceClaim(resourceClaim.metadata.namespace, resourceClaim.metadata.name, {
            metadata: { annotations: { 'demo.redhat.com/salesforce-items': JSON.stringify(next) } },
          });
          mutate(rc);
        }}
        isAdmin={isAdmin}
      />
      <PFModal
        variant="medium"
        isOpen={modalAddServiceAccess}
        onClose={() => {
          setModalAddServiceAccess(false);
          setNewServiceAccessEmail('');
        }}
        aria-label="Share service"
      >
        <PFModalHeader title="Share service" />
        <PFModalBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--pf-t--global--spacer--md)' }}>
            <Alert variant="info" isInline title="Grant user access">
              By adding a user&apos;s email, they will gain access to manage this service. Please use
              the email address associated with their account on the Demo platform.
            </Alert>
            <FormGroup label="Email address" isRequired fieldId="service-access-email">
              <TextInput
                id="service-access-email"
                type="email"
                value={newServiceAccessEmail}
                onChange={(_event, value) => setNewServiceAccessEmail(value)}
                placeholder="user@example.com"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newServiceAccessEmail.trim()) {
                    handleAddServiceAccessUser();
                  }
                }}
              />
            </FormGroup>
          </div>
        </PFModalBody>
        <PFModalFooter>
          <Button
            key="add"
            variant="primary"
            onClick={handleAddServiceAccessUser}
            isDisabled={!newServiceAccessEmail.trim()}
          >
            Add
          </Button>
          <Button
            key="cancel"
            variant="link"
            onClick={() => {
              setModalAddServiceAccess(false);
              setNewServiceAccessEmail('');
            }}
          >
            Cancel
          </Button>
        </PFModalFooter>
      </PFModal>
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
