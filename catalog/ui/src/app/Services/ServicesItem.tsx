import React from "react";
import { useEffect, useReducer, useState } from "react";
import { useSelector } from 'react-redux';
import { useHistory, useLocation, Link } from 'react-router-dom';
import { PencilAltIcon, QuestionCircleIcon } from '@patternfly/react-icons';

import Editor from "@monaco-editor/react";
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
  listNamespaces,
  scheduleStopForAllResourcesInResourceClaim,
  setLifespanEndForResourceClaim,
  startAllResourcesInResourceClaim,
  stopAllResourcesInResourceClaim,
} from '@app/api';

import {
  selectResourceClaim,
  selectServiceNamespaces,
  selectUserIsAdmin,
} from '@app/store';

import { Namespace, NamespaceList, ResourceClaim, ServiceNamespace } from '@app/types';
import { displayName, renderContent } from '@app/util';

import LabInterfaceLink from '@app/components/LabInterfaceLink';
import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import TimeInterval from '@app/components/TimeInterval';

import ServiceActions from './ServiceActions';
import ServiceOpenStackConsole from './ServiceOpenStackConsole';
import ServiceNamespaceSelect from './ServiceNamespaceSelect';
import ServiceStatus from './ServiceStatus';
import ServicesActionModal from './ServicesActionModal';
import ServicesScheduleActionModal from './ServicesScheduleActionModal';

import './services.css';

export interface FetchState {
  canceled?: boolean;
  refreshTimeout?: any;
}

export interface FetchStateAction {
  type?: string;
}

export interface ModalState {
  action?: string;
  modal?: string;
  resourceClaim?: ResourceClaim;
}

export interface ServicesItemProps {
  activeTab: string;
  resourceClaimName: string;
  serviceNamespaceName: string;
}

function cancelFetchState(fetchState:FetchState): void {
  if (fetchState) {
    fetchState.canceled = true;
    if (fetchState.refreshTimeout) {
      clearTimeout(fetchState.refreshTimeout);
    }
  }
}

function fetchStateReducer(state:FetchState, action:FetchStateAction): FetchState {
  // Any change in state cancels previous activity.
  cancelFetchState(state);
  switch (action.type) {
    case 'cancel':
      return null;
    case 'start':
      return {};
    default:
      throw new Error();
  }
}

const ServicesItem: React.FunctionComponent<ServicesItemProps> = ({
  activeTab, resourceClaimName, serviceNamespaceName
}) => {
  const history = useHistory();
  const location = useLocation();
  const sessionResourceClaim = useSelector(
    (state) => selectResourceClaim(state, serviceNamespaceName, resourceClaimName)
  );
  const sessionServiceNamespaces = useSelector(selectServiceNamespaces);
  const sessionServiceNamespace = sessionServiceNamespaces.find(
    (ns:ServiceNamespace) => ns.name == serviceNamespaceName
  );
  const userIsAdmin:boolean = useSelector(selectUserIsAdmin);
  const fetchEnabled:boolean = userIsAdmin && !sessionServiceNamespace ? true : false;

  const [fetchState, reduceFetchState] = useReducer(fetchStateReducer, null);
  const [fetchedResourceClaim, setFetchedResourceClaim] = useState<ResourceClaim|null>(null);
  const [modalState, setModalState] = React.useState<ModalState>({});
  const [serviceNamespaces, setServiceNamespaces] = useState<ServiceNamespace[]>(null);
  const serviceNamespace:ServiceNamespace = (serviceNamespaces || []).find(ns => ns.name === serviceNamespaceName);

  const resourceClaim = sessionServiceNamespace ? sessionResourceClaim : fetchedResourceClaim;
  const externalPlatformUrl = resourceClaim?.metadata?.annotations?.['babylon.gpte.redhat.com/externalPlatformUrl'];
  const resources = (resourceClaim?.status?.resources || []).map(r => r.state);
  const userData = JSON.parse(resourceClaim?.metadata?.annotations?.['babylon.gpte.redhat.com/userData'] || 'null');

  const catalogItemDisplayName = (
    resourceClaim?.metadata?.annotations?.["babylon.gpte.redhat.com/catalogItemDisplayName"] ||
    resourceClaim?.metadata?.labels?.["babylon.gpte.redhat.com/catalogItemName"]
  );

  const actionHandlers = {
    delete: () => setModalState({action: 'delete', modal: 'action'}),
    lifespan: () => setModalState({action: 'retirement', modal: 'scheduleAction'}),
  };
  if (resources.find(r => r?.kind === 'AnarchySubject')) {
    actionHandlers['runtime'] = () => setModalState({action: 'stop', modal: 'scheduleAction'});
    actionHandlers['start'] = () => setModalState({action: 'start', modal: 'action'});
    actionHandlers['stop'] = () => setModalState({action: 'stop', modal: 'action'});
  }

  // Find lab user interface information either in the resource claim or inside resources
  // associated with the provisioned service.
  const labUserInterfaceData = (
    resourceClaim?.metadata?.annotations?.['babylon.gpte.redhat.com/labUserInterfaceData'] ||
    resources.map(
      r => r?.kind === 'AnarchySubject' ? r?.spec?.vars?.provision_data?.lab_ui_data : r?.data?.labUserInterfaceData
    ).map(j => typeof(j) === 'string' ? JSON.parse(j) : j).find(u => u != null)
  );

  const labUserInterfaceMethod = (
    resourceClaim?.metadata?.annotations?.['babylon.gpte.redhat.com/labUserInterfaceMethod'] ||
    resources.map(
      r => r?.kind === 'AnarchySubject' ? r?.spec?.vars?.provision_data?.lab_ui_method : r?.data?.labUserInterfaceMethod
    ).find(u => u != null)
  );
  const labUserInterfaceUrl = (
    resourceClaim?.metadata?.annotations?.['babylon.gpte.redhat.com/labUserInterfaceUrl'] ||
    resources.map(r => {
      const data = r?.kind === 'AnarchySubject' ? r.spec?.vars?.provision_data : r?.data;
      return data?.labUserInterfaceUrl || data?.lab_ui_url || data?.bookbag_url;
    }).find(u => u != null)
  );

  // Multiple lab user interface urls for multiuser environments.
  const labUserInterfaceUrls = JSON.parse(resourceClaim?.metadata?.annotations?.['babylon.gpte.redhat.com/labUserInterfaceUrls'] || '{}')

  function startFetchResourceClaim(): void {
    reduceFetchState({type: 'start'});
  }

  const users = {};
  for (const status_resource of (resourceClaim?.status?.resources || [])) {
    const resource_users = status_resource.state?.spec?.vars?.provision_data?.users;
    if (resource_users) {
      Object.assign(users, resource_users);
    }
  }

  async function fetchResourceClaim(): Promise<void> {
    const gotResourceClaim = await getResourceClaim(serviceNamespaceName, resourceClaimName)
    if (fetchState.canceled) {
      return;
    }
    setFetchedResourceClaim(gotResourceClaim);
    fetchState.refreshTimeout = setTimeout(startFetchResourceClaim, 1000);
  }

  async function initServiceNamespaces(fetchState:FetchState): Promise<void> {
    const userNamespaceList:NamespaceList = await listNamespaces({
      labelSelector: 'usernamespace.gpte.redhat.com/user-uid'
    })
    if (fetchState.canceled) {
     return;
    }
    setServiceNamespaces(
      (userNamespaceList.items || []).map((ns:Namespace): ServiceNamespace => {
        return {
          name: ns.metadata.name,
          displayName: ns.metadata.annotations['openshift.io/display-name'] || ns.metadata.name,
        }
      })
    );
  }

  async function onModalAction(): Promise<void> {
    if (modalState.action === 'delete') {
      deleteResourceClaim(resourceClaim);
      history.push(`/services/${serviceNamespaceName}`);
    } else {
      const resourceClaimUpdate:ResourceClaim = modalState.action === 'start' ?
        await startAllResourcesInResourceClaim(resourceClaim) :
        await stopAllResourcesInResourceClaim(resourceClaim);
      if (fetchEnabled) {
        setFetchedResourceClaim(resourceClaimUpdate);
      }
    }
    setModalState({});
  }

  async function onModalScheduleAction(date:Date): Promise<void> {
    const resourceClaimUpdate:ResourceClaim = modalState.action === "retirement" ?
      await setLifespanEndForResourceClaim(resourceClaim, date) :
      await scheduleStopForAllResourcesInResourceClaim(resourceClaim, date);
    if (fetchEnabled) {
      setFetchedResourceClaim(resourceClaimUpdate);
    }
    setModalState({});
  }

  useEffect(() => {
    if (userIsAdmin) {
      const fetchState:FetchState = {};
      initServiceNamespaces(fetchState);
      return () => cancelFetchState(fetchState);
    } else if (userIsAdmin === false) {
      setServiceNamespaces(sessionServiceNamespaces);
    }
    return null;
  }, [userIsAdmin]);

  useEffect(() => {
    if (fetchEnabled) {
      startFetchResourceClaim();
    }
  }, [fetchEnabled, resourceClaimName, serviceNamespaceName])

  useEffect(() => {
    if (fetchState) {
      fetchResourceClaim();
      return () => cancelFetchState(fetchState);
    } else {
      return null;
    }
  }, [fetchState])

  if (!serviceNamespaces) {
    return (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={LoadingIcon} />
        </EmptyState>
      </PageSection>
    );
  }

  return (<>
    { modalState.modal === 'action' ? (
      <ServicesActionModal key="actionModal"
        action={modalState.action}
        isOpen={true}
        onClose={() => setModalState({})}
        onConfirm={onModalAction}
        resourceClaim={resourceClaim}
      />
    ) : modalState.modal === 'scheduleAction' ? (
      <ServicesScheduleActionModal key="scheduleActionModal"
        action={modalState.action}
        isOpen={true}
        onClose={() => setModalState({})}
        onConfirm={(date) => onModalScheduleAction(date)}
        resourceClaim={resourceClaim}
      />
    ) : null }
    { serviceNamespaces.length > 1 ? (
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
      { serviceNamespaces.length > 1 ? (
        <Breadcrumb>
          <BreadcrumbItem render={({ className }) => <Link to="/services" className={className}>Services</Link>}/>
          <BreadcrumbItem render={({ className }) => <Link to={`/services/${serviceNamespaceName}`} className={className}>{displayName(serviceNamespace)}</Link>}/>
          <BreadcrumbItem>{resourceClaim.metadata.name}</BreadcrumbItem>
        </Breadcrumb>
      ) : (
        <Breadcrumb>
          <BreadcrumbItem render={({ className }) => <Link to={`/services/${serviceNamespaceName}`} className={className}>Services</Link>}/>
          <BreadcrumbItem>{resourceClaim.metadata.name}</BreadcrumbItem>
        </Breadcrumb>
      )}
          <Title headingLevel="h4" size="xl">{displayName(resourceClaim)}</Title>
        </SplitItem>
        <SplitItem>
          <Bullseye>
            { externalPlatformUrl ? (
              <Button component="a" href={externalPlatformUrl} target="_blank" variant="tertiary">
                { externalPlatformUrl }
              </Button>
            ) : (
              <ServiceActions
                position="right"
                resourceClaim={resourceClaim}
                actionHandlers={actionHandlers}
              />
            ) }
          </Bullseye>
        </SplitItem>
      </Split>
    </PageSection>
    { resourceClaim.spec.resources[0].provider.name === 'babylon-service-request-configmap' && !userIsAdmin ? (
      <PageSection key="body" variant={PageSectionVariants.light} className="services-item-body" style={{"paddingTop": "1em"}}>
        <p>Thank you for your interest in {catalogItemDisplayName || "this service"}.</p>
      </PageSection>
    ) : (
      <PageSection key="body" variant={PageSectionVariants.light} className="services-item-body">
        <Tabs activeKey={activeTab || "details"} onSelect={(e, tabIndex) => history.push(`/services/${serviceNamespaceName}/${resourceClaimName}/${tabIndex}`)}>
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
            <DescriptionList isHorizontal>
              <DescriptionListGroup>
                <DescriptionListTerm>Name</DescriptionListTerm>
                <DescriptionListDescription>
                  {resourceClaim.metadata.name}
                  { userIsAdmin ? (
                    <OpenshiftConsoleLink resource={resourceClaim}/>
                  ) : null }
                </DescriptionListDescription>
              </DescriptionListGroup>
              { labUserInterfaceUrl ? (
                <DescriptionListGroup>
                  <DescriptionListTerm>Lab Instructions</DescriptionListTerm>
                  <DescriptionListDescription>
                    <LabInterfaceLink url={labUserInterfaceUrl} data={labUserInterfaceData} method={labUserInterfaceMethod}/>
                  </DescriptionListDescription>
                </DescriptionListGroup>
              ) : null }
              <DescriptionListGroup>
                <DescriptionListTerm>Requested On</DescriptionListTerm>
                <DescriptionListDescription>
                  <LocalTimestamp timestamp={resourceClaim.metadata.creationTimestamp}/>
                </DescriptionListDescription>
              </DescriptionListGroup>
              { (!externalPlatformUrl && resourceClaim?.status?.lifespan?.end) ? (
                <DescriptionListGroup>
                  <DescriptionListTerm>Retirement</DescriptionListTerm>
                  { resourceClaim.status?.lifespan?.end ? (
                    <DescriptionListDescription>
                      <Button variant="plain"
                        onClick={() => {setModalState({action: 'retirement', modal: 'scheduleAction'})}}
                      >
                        <LocalTimestamp timestamp={resourceClaim.status.lifespan.end}/> (
                        <TimeInterval toTimestamp={resourceClaim.status.lifespan.end}/>)
                        { resourceClaim.spec?.lifespan?.end && resourceClaim.spec.lifespan.end != resourceClaim.status.lifespan.end ? <> <Spinner size="md"/></> : null } <PencilAltIcon className="edit"/>
                      </Button>
                    </DescriptionListDescription>
                  ) : "..." }
                </DescriptionListGroup>
              ) : null }
              <DescriptionListGroup>
                <DescriptionListTerm>GUID</DescriptionListTerm>
                <DescriptionListDescription>
                  { userIsAdmin && resourceClaim?.status?.resourceHandle ? (
                    <>
                      <Link key="admin" to={`/admin/resourcehandles/${resourceClaim.status.resourceHandle.name}`}>
                        <code>{resourceClaim.status.resourceHandle.name.substring(5)}</code>
                      </Link>
                      <OpenshiftConsoleLink key="console" reference={resourceClaim.status.resourceHandle}/>
                    </>
                  ) : (
                    <code>{resourceClaim?.status?.resourceHandle?.name.substring(5) || '...'}</code>
                  ) }
                </DescriptionListDescription>
              </DescriptionListGroup>
            </DescriptionList>
            { resourceClaim.spec.resources.map((resourceSpec, idx) => {
              const resourceStatus = resourceClaim.status?.resources[idx];
              const resourceState = resourceStatus?.state;
              const componentDisplayName = resourceClaim.metadata.annotations?.[`babylon.gpte.redhat.com/displayNameComponent${idx}`] || resourceSpec.name || resourceSpec.provider?.name;
              const currentState = resourceState?.kind === 'AnarchySubject' ? resourceState.spec.vars?.current_state : 'available';
              const desiredState = resourceState?.kind === 'AnarchySubject' ? resourceState.spec.vars?.desired_state : null;
              const provisionData = resourceState?.kind === 'AnarchySubject' ? resourceState.spec.vars?.provision_data : JSON.parse(resourceState?.data?.userData || '{}');
              const provisionMessages = resourceState?.kind === 'AnarchySubject' ? resourceState?.spec?.vars?.provision_messages : provisionData?.msg;
              const provisionDataEntries = provisionData ? Object.entries(provisionData).filter(([key, value]) => {
                if (key === 'bookbag_url' || key === 'lab_ui_url' || key === 'labUserInterfaceUrl' || key === 'msg' || key === 'users') {
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
              }) : null;
              const stopTimestamp = resourceState?.kind === 'AnarchySubject' ? resourceSpec.template?.spec.vars?.action_schedule?.stop || resourceState?.spec.vars.action_schedule?.stop : null;
              const stopTime = stopTimestamp ? Date.parse(stopTimestamp) : null;
              const stopDate = stopTime ? new Date(stopTime) : null;
              const startTimestamp = resourceState?.kind == 'AnarchySubject' ? resourceSpec.template?.spec.vars?.action_schedule?.start || resourceState?.spec.vars.action_schedule?.start: null;
              const startTime = startTimestamp ? Date.parse(startTimestamp) : null;
              const startDate = startTime ? new Date(startTime) : null;
              return (
                <div key={idx} className="rhpds-services-item-body-resource">
                  {resourceClaim.spec.resources.length > 1 ? (
                    <h2 className="rhpds-component-display-name">{componentDisplayName}</h2>
                  ) : null }
                  <DescriptionList isHorizontal>
                    { resourceState?.kind == 'AnarchySubject' ? (
                      <>
                        <DescriptionListGroup>
                          <DescriptionListTerm>UUID</DescriptionListTerm>
                          <DescriptionListDescription>{resourceState?.spec?.vars?.job_vars?.uuid || '...'}</DescriptionListDescription>
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
                        { externalPlatformUrl ? null :
                          (startDate && Number(startDate) > Date.now()) ? (
                          <DescriptionListGroup>
                            <DescriptionListTerm>Scheduled Start</DescriptionListTerm>
                            <DescriptionListDescription>
                              <LocalTimestamp timestamp={startTimestamp}/> (
                              <TimeInterval toTimestamp={startTimestamp}/>)
                            </DescriptionListDescription>
                          </DescriptionListGroup>
                        ) : (stopDate && Number(stopDate) > Date.now()) ? (
                          <DescriptionListGroup>
                            <DescriptionListTerm>Scheduled Stop</DescriptionListTerm>
                            <DescriptionListDescription>
                              <Button variant="plain"
                                onClick={() => {setModalState({action: 'stop', modal: 'action'})}}
                              >
                                <LocalTimestamp timestamp={stopTimestamp}/> (<TimeInterval toTimestamp={stopTimestamp}/>) <PencilAltIcon className="edit"/>
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
                        { userIsAdmin && resourceState ? (<>
                          <DescriptionListGroup key="anarchy-namespace">
                            <DescriptionListTerm>Anarchy Namespace</DescriptionListTerm>
                            <DescriptionListDescription>
                              <Link to={`/admin/anarchysubjects/${resourceState.metadata.namespace}`}>
                                {resourceState.metadata.namespace}
                              </Link>
                              <OpenshiftConsoleLink resource={resourceState} linkToNamespace/>
                            </DescriptionListDescription>
                          </DescriptionListGroup>
                          <DescriptionListGroup key="anarchy-governor">
                            <DescriptionListTerm>AnarchyGovernor</DescriptionListTerm>
                            <DescriptionListDescription>
                              <Link to={`/admin/anarchygovernors/${resourceState.metadata.namespace}/${resourceState.spec.governor}`}>
                                {resourceState.spec.governor}
                              </Link>
                              <OpenshiftConsoleLink reference={{
                                apiVersion: 'anarchy.gpte.redhat.com/v1',
                                kind: 'AnarchyGovernor',
                                name: resourceState.spec.governor,
                                namespace: resourceState.metadata.namespace,
                              }}/>
                            </DescriptionListDescription>
                          </DescriptionListGroup>
                          <DescriptionListGroup key="anarchy-subject">
                            <DescriptionListTerm>AnarchySubject</DescriptionListTerm>
                            <DescriptionListDescription>
                              <Link to={`/admin/anarchysubjects/${resourceState.metadata.namespace}/${resourceState.metadata.name}`}>
                                {resourceState.metadata.name}
                              </Link>
                              <OpenshiftConsoleLink resource={resourceState}/>
                            </DescriptionListDescription>
                          </DescriptionListGroup>
                        </>) : null }
                      </>
                    ) : null }
                    { provisionMessages ? (
                      <DescriptionListGroup>
                        <DescriptionListTerm>Provision Messages</DescriptionListTerm>
                        <DescriptionListDescription>
                          <div
                            dangerouslySetInnerHTML={{ __html: renderContent(
                              (typeof provisionMessages === 'string' ? provisionMessages : provisionMessages.join("\n")).replace(/^\s+|\s+$/g, '').replace(/([^\n])\n(?!\n)/g, "$1 +\n")
                            ) }}
                          />
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    ) : null }
                    { (provisionDataEntries && provisionDataEntries.length > 0) ? (
                      <DescriptionListGroup>
                        <DescriptionListTerm>Provision Data</DescriptionListTerm>
                        <DescriptionListDescription>
                          <DescriptionList isHorizontal className="rhpds-user-data">
                            {provisionDataEntries.sort((a, b) => a[0].localeCompare(b[0])).map(([key, value]) => (
                              <DescriptionListGroup key={key}>
                                <DescriptionListTerm>{key}</DescriptionListTerm>
                                <DescriptionListDescription>
                                  { typeof value === 'string' ? (value.startsWith('https://') ? <a href={value}><code>{value}</code></a> : <code>{value}</code>) : <code>{JSON.stringify(value)}</code> }
                                </DescriptionListDescription>
                              </DescriptionListGroup>
                            ))}
                          </DescriptionList>
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    ) : null }
                  </DescriptionList>
                </div>
              );
            })}
          </Tab>
          { (resourceClaim.status?.resources || []).find(r => {
            const provision_data = r.state?.spec?.vars?.provision_data;
            if (provision_data?.osp_cluster_api || provision_data?.openstack_auth_url) {
              return true;
            } else {
              return false;
            }
          }) ? (
            <Tab eventKey="console" title={<TabTitleText>Console</TabTitleText>}>
              { activeTab == 'console' ? <ServiceOpenStackConsole resourceClaim={resourceClaim}/> : null }
            </Tab>
          ) : null }
          { Object.keys(users).length > 0 ? (
            <Tab eventKey="users" title={<TabTitleText>Users</TabTitleText>}>
              { Object.entries(users).map(([userName, userData]: any) => {
                const userLabUrl = labUserInterfaceUrls[userName] || userData.labUserInterfaceUrl || userData.lab_ui_url || userData.bookbag_url;
                const userDataEntries = Object.entries(userData).filter(([key, value]) => key !== 'bookbag_url' && key !== 'lab_ui_url' && key !== 'labUserInterfaceUrl' && key !== 'msg');
                const userMessages = userData.msg;
                return (
                  <React.Fragment key={userName}>
                    <h2 className="rhpds-user-name-heading">{userName}</h2>
                    <DescriptionList isHorizontal>
                    { userLabUrl ? (
                      <DescriptionListGroup>
                        <DescriptionListTerm>Lab URL</DescriptionListTerm>
                        <DescriptionListDescription>
                          <a href={userLabUrl}>{userLabUrl}</a>
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    ) : null }
                    { userMessages ? (
                      <DescriptionListGroup>
                        <DescriptionListTerm>User Messages</DescriptionListTerm>
                        <DescriptionListDescription>
                          <div dangerouslySetInnerHTML={{ __html: renderContent(userMessages.replace(/^\s+|\s+$/g, '').replace(/([^\n])\n(?!\n)/g, "$1 +\n")) }}/>
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    ) : null }
                    { userDataEntries ? (
                      <DescriptionListGroup>
                        <DescriptionListTerm>User Data</DescriptionListTerm>
                        <DescriptionListDescription>
                          <DescriptionList isHorizontal className="rhpds-user-data">
                            {userDataEntries.map(([key, value]) => (
                              <DescriptionListGroup key={key}>
                                <DescriptionListTerm>{key}</DescriptionListTerm>
                                <DescriptionListDescription>
                                  { typeof value === 'string' ? (value.startsWith('https://') ? <a href={value}><code>{value}</code></a> : <code>{value}</code>) : <code>{JSON.stringify(value)}</code> }
                                </DescriptionListDescription>
                              </DescriptionListGroup>
                            ))}
                          </DescriptionList>
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    ) : null }
                    </DescriptionList>
                  </React.Fragment>
                )
              }) }
            </Tab>
          ) : null }
          <Tab eventKey="yaml" title={<TabTitleText>YAML</TabTitleText>}>
            <Editor
              height="500px"
              language="yaml"
              options={{readOnly: true}}
              theme="vs-dark"
              value={yaml.dump(resourceClaim)}
            />
          </Tab>
        </Tabs>
      </PageSection>
    )}
  </>);
}

export default ServicesItem;
