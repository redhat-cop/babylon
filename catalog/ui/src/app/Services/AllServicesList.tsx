import React, { useCallback } from 'react';
import { useEffect, useReducer, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link, Redirect, useHistory, useLocation } from 'react-router-dom';

import {
  Breadcrumb,
  BreadcrumbItem,
  DescriptionList,
  DescriptionListTerm,
  DescriptionListGroup,
  DescriptionListDescription,
  EmptyState,
  EmptyStateBody,
  EmptyStateIcon,
  PageSection,
  PageSectionVariants,
  Split,
  SplitItem,
  Title,
} from '@patternfly/react-core';

import { ExclamationTriangleIcon } from '@patternfly/react-icons';

import {
  deleteResourceClaim,
  listNamespaces,
  listResourceClaims,
  scheduleStopForAllResourcesInResourceClaim,
  setLifespanEndForResourceClaim,
  startAllResourcesInResourceClaim,
  stopAllResourcesInResourceClaim,
} from '@app/api';
import { Namespace, NamespaceList, ResourceClaim, ResourceClaimList, ServiceNamespace } from '@app/types';
import {
  selectResourceClaims,
  selectResourceClaimsInNamespace,
  selectServiceNamespaces,
  selectUserIsAdmin,
} from '@app/store';
import KeywordSearchInput from '@app/components/KeywordSearchInput';
import LabInterfaceLink from '@app/components/LabInterfaceLink';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';

import { K8sFetchState, cancelFetchActivity, k8sFetchStateReducer } from '@app/K8sFetchState';

import { checkResourceClaimCanStart, checkResourceClaimCanStop, displayName, BABYLON_DOMAIN } from '@app/util';

import ServiceActions from './ServiceActions';
import ServiceNamespaceSelect from './ServiceNamespaceSelect';
import ServiceStatus from './ServiceStatus';
import ServicesAction from './ServicesAction';
import ServicesScheduleAction from './ServicesScheduleAction';

import './all-services-list.css';
import Modal from '@app/Modal';

const FETCH_BATCH_LIMIT = 30;

function keywordMatch(resourceClaim: ResourceClaim, keyword: string): boolean {
  const keywordLowerCased = keyword.toLowerCase();
  const resourceHandleName = resourceClaim.status?.resourceHandle?.name;
  const guid = resourceHandleName ? resourceHandleName.replace(/^guid-/, '') : null;
  if (resourceClaim.metadata.name.includes(keywordLowerCased)) {
    return true;
  }
  if (displayName(resourceClaim).toLowerCase().includes(keywordLowerCased)) {
    return true;
  }
  if (guid && guid.includes(keywordLowerCased)) {
    return true;
  }
  return false;
}

function pruneResourceClaim(resourceClaim: ResourceClaim): ResourceClaim {
  return {
    apiVersion: resourceClaim.apiVersion,
    kind: resourceClaim.kind,
    metadata: {
      annotations: {
        [`${BABYLON_DOMAIN}/catalogDisplayName`]:
          resourceClaim.metadata.annotations?.[`${BABYLON_DOMAIN}/catalogDisplayName`],
        [`${BABYLON_DOMAIN}/catalogItemDisplayName`]:
          resourceClaim.metadata.annotations?.[`${BABYLON_DOMAIN}/catalogItemDisplayName`],
        [`${BABYLON_DOMAIN}/requester`]: resourceClaim.metadata.annotations?.[`${BABYLON_DOMAIN}/requester`],
      },
      labels: {
        [`${BABYLON_DOMAIN}/catalogItemName`]: resourceClaim.metadata.labels?.[`${BABYLON_DOMAIN}/catalogItemName`],
        [`${BABYLON_DOMAIN}/catalogItemNamespace`]:
          resourceClaim.metadata.labels?.[`${BABYLON_DOMAIN}/catalogItemNamespace`],
      },
      creationTimestamp: resourceClaim.metadata.creationTimestamp,
      name: resourceClaim.metadata.name,
      namespace: resourceClaim.metadata.namespace,
      resourceVersion: resourceClaim.metadata.resourceVersion,
      uid: resourceClaim.metadata.uid,
    },
    spec: resourceClaim.spec,
    status: resourceClaim.status,
  };
}

export interface ModalState {
  action?: string;
  modal?: string;
  resourceClaim?: ResourceClaim;
}

export interface ServicesListProps {
  serviceNamespaceName?: string;
}

const AllServicesList: React.FunctionComponent<ServicesListProps> = ({ serviceNamespaceName }) => {
  const history = useHistory();
  const location = useLocation();
  const componentWillUnmount = useRef(false);
  const urlSearchParams = new URLSearchParams(location.search);
  const keywordFilter = urlSearchParams.has('search')
    ? urlSearchParams
        .get('search')
        .trim()
        .split(/ +/)
        .filter((w) => w != '')
    : null;

  const sessionServiceNamespaces: ServiceNamespace[] = useSelector(selectServiceNamespaces);
  const sessionServiceNamespace: ServiceNamespace = serviceNamespaceName
    ? sessionServiceNamespaces.find((ns: ServiceNamespace) => ns.name == serviceNamespaceName)
    : null;
  const sessionResourceClaims = useSelector(selectResourceClaims);
  const sessionResourceClaimsInNamespace = useSelector((state) =>
    selectResourceClaimsInNamespace(state, serviceNamespaceName)
  );
  const userIsAdmin = useSelector(selectUserIsAdmin);

  // Normally resource claims are automatically fetched as a background process
  // by the store, but if the user is an admin and the services list isn't
  // restricted to the admin's service namespaces then we need to use logic
  // in this component to fetch the ResourceClaims.
  const enableFetchResourceClaims: boolean = userIsAdmin && !sessionServiceNamespace;

  // As admin we need to fetch service namespaces for the service namespace dropdown
  const enableFetchUserNamespaces: boolean = userIsAdmin;

  const [resourceClaimsFetchState, reduceResourceClaimsFetchState] = useReducer(k8sFetchStateReducer, null);
  const [userNamespacesFetchState, reduceUserNamespacesFetchState] = useReducer(k8sFetchStateReducer, null);
  const [modalState, setModalState] = React.useState<ModalState>({});
  const modalAction = useRef(null);
  const modalScheduleAction = useRef(null);
  const [selectedUids, setSelectedUids] = React.useState<string[]>([]);

  const serviceNamespaces: ServiceNamespace[] = enableFetchUserNamespaces
    ? userNamespacesFetchState?.items
      ? userNamespacesFetchState.items.map((ns: Namespace): ServiceNamespace => {
          return {
            name: ns.metadata.name,
            displayName: ns.metadata.annotations['openshift.io/display-name'] || ns.metadata.name,
          };
        })
      : []
    : sessionServiceNamespaces;

  const serviceNamespace: ServiceNamespace = serviceNamespaces.find((ns) => ns.name === serviceNamespaceName) || {
    name: serviceNamespaceName,
    displayName: serviceNamespaceName,
  };

  const fetchNamespaces: string[] = serviceNamespaceName
    ? [serviceNamespaceName]
    : userIsAdmin
    ? null
    : serviceNamespaces.map((ns) => ns.name);

  const resourceClaims: ResourceClaim[] = enableFetchResourceClaims
    ? (resourceClaimsFetchState?.filteredItems as ResourceClaim[]) || []
    : (serviceNamespaceName ? sessionResourceClaimsInNamespace : sessionResourceClaims).filter(filterResourceClaim);

  // Trigger continue fetching more resource claims on scroll.
  if (enableFetchResourceClaims) {
    const primaryAppContainer = document.getElementById('primary-app-container');
    primaryAppContainer.onscroll = (e) => {
      const scrollable = e.target as any;
      const scrollRemaining = scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight;
      if (
        scrollRemaining < 500 &&
        !resourceClaimsFetchState?.finished &&
        resourceClaimsFetchState.limit <= resourceClaimsFetchState.filteredItems.length
      ) {
        reduceResourceClaimsFetchState({
          type: 'modify',
          limit: resourceClaimsFetchState.limit + FETCH_BATCH_LIMIT,
        });
      }
    };
  }

  function filterResourceClaim(resourceClaim: ResourceClaim): boolean {
    if (!userIsAdmin && resourceClaim.spec.resources[0].provider?.name === 'babylon-service-request-configmap') {
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
  }

  async function fetchResourceClaims(): Promise<void> {
    const resourceClaimList: ResourceClaimList = await listResourceClaims({
      continue: resourceClaimsFetchState.continue,
      limit: FETCH_BATCH_LIMIT,
      namespace: resourceClaimsFetchState.namespace,
    });
    if (!resourceClaimsFetchState.activity.canceled) {
      reduceResourceClaimsFetchState({
        type: 'post',
        k8sObjectList: resourceClaimList,
        refreshInterval: 5000,
        refresh: (): void => {
          reduceResourceClaimsFetchState({ type: 'startRefresh' });
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

  async function onModalAction(): Promise<void> {
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
    if (enableFetchResourceClaims) {
      if (modalState.action === 'delete') {
        reduceResourceClaimsFetchState({
          type: 'removeItems',
          items: resourceClaimUpdates,
        });
      } else {
        reduceResourceClaimsFetchState({
          type: 'updateItems',
          items: resourceClaimUpdates,
        });
      }
    }
  }

  async function onModalScheduleAction(date: Date): Promise<void> {
    const resourceClaimUpdate: ResourceClaim =
      modalState.action === 'retirement'
        ? await setLifespanEndForResourceClaim(modalState.resourceClaim, date)
        : await scheduleStopForAllResourcesInResourceClaim(modalState.resourceClaim, date);
    if (enableFetchResourceClaims) {
      reduceResourceClaimsFetchState({
        type: 'updateItems',
        items: [resourceClaimUpdate],
      });
    }
  }

  async function performModalActionForResourceClaim(resourceClaim: ResourceClaim): Promise<ResourceClaim> {
    if (modalState.action === 'delete') {
      return await deleteResourceClaim(resourceClaim);
    } else if (modalState.action === 'start' && checkResourceClaimCanStart(resourceClaim)) {
      return await startAllResourcesInResourceClaim(resourceClaim);
    } else if (modalState.action === 'stop' && checkResourceClaimCanStop(resourceClaim)) {
      return await stopAllResourcesInResourceClaim(resourceClaim);
    } else {
      console.warn(`Unkown action ${modalState.action}`);
      return resourceClaim;
    }
  }

  // Track unmount for other effect cleanups
  useEffect(() => {
    return () => {
      componentWillUnmount.current = true;
    };
  }, []);

  // Trigger user namespaces fetch for admin.
  useEffect(() => {
    if (userIsAdmin) {
      reduceUserNamespacesFetchState({ type: 'startFetch' });
    }
  }, [userIsAdmin]);

  // Fetch or continue fetching resource claims
  useEffect(() => {
    if (
      resourceClaimsFetchState?.canContinue &&
      (resourceClaimsFetchState.refreshing ||
        resourceClaimsFetchState.filteredItems.length < resourceClaimsFetchState.limit)
    ) {
      fetchResourceClaims();
    }
    return () => {
      if (componentWillUnmount.current) {
        cancelFetchActivity(resourceClaimsFetchState);
      }
    };
  }, [resourceClaimsFetchState]);

  // Fetch or continue fetching user namespaces
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

  // Reload on filter change
  useEffect(() => {
    if (enableFetchResourceClaims) {
      if (
        !resourceClaimsFetchState ||
        JSON.stringify(fetchNamespaces) !== JSON.stringify(resourceClaimsFetchState?.namespaces)
      ) {
        reduceResourceClaimsFetchState({
          type: 'startFetch',
          filter: filterResourceClaim,
          limit: FETCH_BATCH_LIMIT,
          namespaces: fetchNamespaces,
          prune: pruneResourceClaim,
        });
      } else if (resourceClaimsFetchState) {
        reduceResourceClaimsFetchState({
          type: 'modify',
          filter: filterResourceClaim,
        });
      }
    } else if (resourceClaimsFetchState) {
      cancelFetchActivity(resourceClaimsFetchState);
    }
  }, [enableFetchResourceClaims, JSON.stringify(fetchNamespaces), JSON.stringify(keywordFilter)]);

  const showModal = useCallback(
    ({ modal, action, resourceClaim }: { modal: string; action: string; resourceClaim?: ResourceClaim }) => {
      if (modal === 'action') {
        setModalState({ action, resourceClaim });
        modalAction.current.open();
      }
      if (modal === 'scheduleAction') {
        setModalState({ action, resourceClaim });
        modalScheduleAction.current.open();
      }
    },
    [modalAction, modalScheduleAction, setModalState]
  );

  // Show loading until whether the user is admin is determined.
  if (userIsAdmin === null || (enableFetchUserNamespaces && !userNamespacesFetchState?.finished)) {
    return (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={LoadingIcon} />
        </EmptyState>
      </PageSection>
    );
  }

  if (serviceNamespaces.length === 0) {
    return (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={ExclamationTriangleIcon} />
          <Title headingLevel="h1" size="lg">
            No Service Access
          </Title>
          <EmptyStateBody>Your account has no access to services.</EmptyStateBody>
        </EmptyState>
      </PageSection>
    );
  }

  if (serviceNamespaces.length === 1 && !serviceNamespaceName) {
    return <Redirect to={`/services/${serviceNamespaces[0].name}`} />;
  }

  return (
    <>
      <Modal ref={modalAction} onConfirm={onModalAction} title={null}>
        <ServicesAction action={modalState.action} resourceClaim={modalState.resourceClaim} />
      </Modal>
      <Modal ref={modalScheduleAction} onConfirm={onModalScheduleAction} title={null}>
        <ServicesScheduleAction action={modalState.action} resourceClaim={modalState.resourceClaim} />
      </Modal>
      {serviceNamespaces.length > 1 ? (
        <PageSection key="topbar" className="all-services-list__topbar" variant={PageSectionVariants.light}>
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
      <PageSection key="head" className="all-services-list__head" variant={PageSectionVariants.light}>
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
                history.push(`${location.pathname}?${urlSearchParams.toString()}`);
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
      {resourceClaims.length === 0 ? (
        enableFetchResourceClaims && !resourceClaimsFetchState?.finished ? (
          <PageSection key="body-loading">
            <EmptyState variant="full">
              <EmptyStateIcon icon={LoadingIcon} />
            </EmptyState>
          </PageSection>
        ) : (
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
        )
      ) : (
        <PageSection key="body" className="all-services-list__body" variant={PageSectionVariants.light}>
          <SelectableTable
            columns={(serviceNamespaceName ? [] : ['Project']).concat([
              'Name',
              'GUID',
              'Status',
              'Lab Interface',
              'Created At',
              'Actions',
            ])}
            onSelectAll={(isSelected) => {
              if (isSelected) {
                setSelectedUids(resourceClaims.map((resourceClaim) => resourceClaim.metadata.uid));
              } else {
                setSelectedUids([]);
              }
            }}
            rows={resourceClaims.map((resourceClaim: ResourceClaim) => {
              const resourceHandle = resourceClaim.status?.resourceHandle;
              const guid = resourceHandle?.name ? resourceHandle.name.replace(/^guid-/, '') : null;
              const rcServiceNamespace: ServiceNamespace = serviceNamespaces.find(
                (ns: ServiceNamespace) => ns.name === resourceClaim.metadata.namespace
              );
              const specResources = resourceClaim.spec.resources || [];
              const resources = (resourceClaim.status?.resources || []).map((r) => r.state);

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

              // Available actions depends on kind of service
              const actionHandlers = {
                delete: () => showModal({ action: 'delete', modal: 'action', resourceClaim: resourceClaim }),
                lifespan: () =>
                  showModal({ action: 'retirement', modal: 'scheduleAction', resourceClaim: resourceClaim }),
              };
              if (resources.find((r) => r?.kind === 'AnarchySubject')) {
                actionHandlers['runtime'] = () =>
                  showModal({ action: 'stop', modal: 'scheduleAction', resourceClaim: resourceClaim });
                actionHandlers['start'] = () =>
                  showModal({ action: 'start', modal: 'action', resourceClaim: resourceClaim });
                actionHandlers['stop'] = () =>
                  showModal({ action: 'stop', modal: 'action', resourceClaim: resourceClaim });
              }

              // Only include project/namespace column if namespace is not selected.
              const cells: any[] = serviceNamespaceName
                ? []
                : [
                    <>
                      <Link key="services" to={`/services/${resourceClaim.metadata.namespace}`}>
                        {rcServiceNamespace?.displayName || resourceClaim.metadata.namespace}
                      </Link>
                      {userIsAdmin ? (
                        <OpenshiftConsoleLink key="console" resource={resourceClaim} linkToNamespace={true} />
                      ) : null}
                    </>,
                  ];

              // Add other columns
              cells.push(
                // Name
                <>
                  <Link
                    key="services"
                    to={`/services/${resourceClaim.metadata.namespace}/${resourceClaim.metadata.name}`}
                  >
                    {displayName(resourceClaim)}
                  </Link>
                  {userIsAdmin ? <OpenshiftConsoleLink key="console" resource={resourceClaim} /> : null}
                </>,
                // GUID
                <>
                  {guid
                    ? userIsAdmin
                      ? [
                          <Link key="admin" to={`/admin/resourcehandles/${resourceHandle.name}`}>
                            {guid}
                          </Link>,
                          <OpenshiftConsoleLink key="console" reference={resourceHandle} />,
                        ]
                      : guid
                    : '-'}
                </>,
                // Status
                specResources.length > 1 ? (
                  <div>
                    <DescriptionList isHorizontal>
                      {specResources.map((specResource, i) => {
                        const componentDisplayName =
                          resourceClaim.metadata.annotations?.[`${BABYLON_DOMAIN}/displayNameComponent${i}`] ||
                          specResource.name ||
                          specResource.provider?.name;
                        return (
                          <DescriptionListGroup key={i}>
                            <DescriptionListTerm key="term">{componentDisplayName}</DescriptionListTerm>
                            <DescriptionListDescription key="description">
                              <ServiceStatus
                                creationTime={Date.parse(resourceClaim.metadata.creationTimestamp)}
                                resource={resources?.[i]}
                                resourceTemplate={specResource.template}
                              />
                            </DescriptionListDescription>
                          </DescriptionListGroup>
                        );
                      })}
                    </DescriptionList>
                  </div>
                ) : specResources.length == 1 ? (
                  <div>
                    <ServiceStatus
                      creationTime={Date.parse(resourceClaim.metadata.creationTimestamp)}
                      resource={resources?.[0]}
                      resourceTemplate={specResources[0].template}
                    />
                  </div>
                ) : (
                  '...'
                ),
                // Lab Interface
                labUserInterfaceUrl ? (
                  <div>
                    <LabInterfaceLink
                      url={labUserInterfaceUrl}
                      data={labUserInterfaceData}
                      method={labUserInterfaceMethod}
                      variant="secondary"
                    />
                  </div>
                ) : (
                  '-'
                ),
                // Created At
                <>
                  <LocalTimestamp key="timestamp" timestamp={resourceClaim.metadata.creationTimestamp} />
                  <br key="break" />
                  (<TimeInterval key="interval" toTimestamp={resourceClaim.metadata.creationTimestamp} />)
                </>,
                // Actions
                <>
                  <ServiceActions
                    position="right"
                    resourceClaim={resourceClaim}
                    actionHandlers={actionHandlers}
                    iconOnly={true}
                  />
                </>
              );

              return {
                cells: cells,
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
          {enableFetchResourceClaims && !resourceClaimsFetchState?.finished && !resourceClaimsFetchState?.refreshing ? (
            <EmptyState variant="full">
              <EmptyStateIcon icon={LoadingIcon} />
            </EmptyState>
          ) : null}
        </PageSection>
      )}
    </>
  );
};

export default AllServicesList;
