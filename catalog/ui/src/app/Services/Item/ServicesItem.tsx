import * as React from 'react';

import {
  useSelector,
} from 'react-redux';

import {
  deleteResourceClaim,
  scheduleStopForAllResourcesInResourceClaim,
  setLifespanEndForResourceClaim,
  startAllResourcesInResourceClaim,
  stopAllResourcesInResourceClaim,
} from '@app/api';

import {
  selectResourceClaims,
  selectServiceNamespaces,
} from '@app/store';

import {
  checkResourceClaimCanStart,
  checkResourceClaimCanStop,
  renderContent,
} from '@app/util';

import {
  useHistory,
  useLocation,
  Link
} from 'react-router-dom';

import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  DescriptionList,
  DescriptionListTerm,
  DescriptionListGroup,
  DescriptionListDescription,
  EmptyState,
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
  ExternalLinkAltIcon,
  PencilAltIcon,
  QuestionCircleIcon,
} from '@patternfly/react-icons';

import Editor, { DiffEditor, useMonaco, loader } from "@monaco-editor/react";
const yaml = require('js-yaml');

import {
  LabInterfaceLink
} from '@app/components/LabInterfaceLink';

import {
  LoadingIcon,
} from '@app/components/LoadingIcon';

import {
  LocalTimestamp,
} from '@app/components/LocalTimestamp';

import {
  TimeInterval,
} from '@app/components/TimeInterval';

import {
  OpenStackConsole
} from '@app/Services/Item/OpenStackConsole';

import { ServiceActions } from '@app/Services/ServiceActions';
import { ServiceStatus } from '@app/Services/ServiceStatus';

import {
  ServicesNamespaceSelector,
} from '@app/Services/NamespaceSelector/ServicesNamespaceSelector';

import {
  ServicesItemDeleteModal,
} from '@app/Services/Item/DeleteModal/ServicesItemDeleteModal';

import {
  ServicesItemScheduleActionModal,
} from '@app/Services/Item/ScheduleActionModal/ServicesItemScheduleActionModal';

import {
  ServicesItemStartModal,
} from '@app/Services/Item/StartModal/ServicesItemStartModal';

import {
  ServicesItemStopModal,
} from '@app/Services/Item/StopModal/ServicesItemStopModal';

import './services-item.css';

export interface ServicesItemProps {
  location?: any;
}

const ServicesItem: React.FunctionComponent<ServicesItemProps> = ({
  location,
}) => {
  const history = useHistory();
  // const location = useLocation();
  const nsLocationMatch = location.pathname.match(/^\/services\/ns\/([^\/]+)\/item\/([^\/]+)(?:\/([^\/]+))?/);
  const itemLocationMatch = location.pathname.match(/^\/services\/item\/([^\/]+)\/([^\/]+)(?:\/([^\/]+))?/);

  const resourceClaimNamespace: any = nsLocationMatch?.[1] || itemLocationMatch?.[1];
  const resourceClaimName = nsLocationMatch?.[2] || itemLocationMatch?.[2];
  const serviceNamespaceName = nsLocationMatch?.[1];
  const servicesPath = serviceNamespaceName ? `/services/ns/${serviceNamespaceName}` : '/services';
  const activeTabKey = nsLocationMatch?.[3] || itemLocationMatch?.[3] || 'details';
  const serviceBasePath = serviceNamespaceName ? `/services/ns/${serviceNamespaceName}/item/${resourceClaimName}` : `/services/item/${resourceClaimNamespace}/${resourceClaimName}`;

  const serviceNamespaces = useSelector(selectServiceNamespaces);
  const resourceClaims = useSelector(selectResourceClaims);
  const resourceClaim = resourceClaims?.[resourceClaimNamespace] ? resourceClaims[resourceClaimNamespace].find(rc => rc.metadata.name == resourceClaimName) : null;
  const userData = JSON.parse(resourceClaim?.metadata?.annotations?.['babylon.gpte.redhat.com/userData'] || 'null');

  const prunedResourceClaim = resourceClaim ? JSON.parse(JSON.stringify(resourceClaim)) : null;
  if (prunedResourceClaim?.metadata.managedFields) {
    delete prunedResourceClaim.metadata.managedFields;
  }
  if (prunedResourceClaim?.metadata.generateName) {
    delete prunedResourceClaim.metadata.generateName;
  }
  if (prunedResourceClaim?.metadata.generation) {
    delete prunedResourceClaim.metadata.generation;
  }
  if (prunedResourceClaim?.metadata.resourceVersion) {
    delete prunedResourceClaim.metadata.resourceVersion;
  }
  if (prunedResourceClaim?.metadata.selfLink) {
    delete prunedResourceClaim.metadata.selfLink;
  }

  const [openModal, setOpenModal] = React.useState("");
  const [scheduleActionKind, setScheduleActionKind] = React.useState("");

  const catalogItemDisplayName = (
    resourceClaim?.metadata?.annotations?.["babylon.gpte.redhat.com/catalogItemDisplayName"] ||
    resourceClaim?.metadata?.labels?.["babylon.gpte.redhat.com/catalogItemName"] ||
    "Service"
  );

  const externalPlatformUrl = resourceClaim?.metadata?.annotations?.['babylon.gpte.redhat.com/externalPlatformUrl'];
  const canStart = checkResourceClaimCanStart(resourceClaim);
  const canStop = checkResourceClaimCanStop(resourceClaim);

  const resources = (resourceClaim?.status?.resources || []).map(r => r.state);

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

  const users = {};
  for (const status_resource of (resourceClaim?.status?.resources || [])) {
    const resource_users = status_resource.state?.spec?.vars?.provision_data?.users;
    if (resource_users) {
      Object.assign(users, resource_users);
    }
  }

  function closeModal(): void {
    setOpenModal("");
  }

  async function handleDelete(): Promise<void> {
    await deleteResourceClaim(resourceClaim);
    history.push(servicesPath);
  }

  async function handleScheduleAction(time): Promise<void> {
    if (scheduleActionKind === "retirement") {
      await setLifespanEndForResourceClaim(resourceClaim, time);
    } else if (scheduleActionKind === "stop") {
      await scheduleStopForAllResourcesInResourceClaim(resourceClaim, time);
    }
    closeModal();
  }

  async function handleStartAll(): Promise<void> {
    await startAllResourcesInResourceClaim(resourceClaim);
    closeModal();
  }

  async function handleStopAll(): Promise<void> {
    await stopAllResourcesInResourceClaim(resourceClaim);
    closeModal();
  }

  const actionHandlers = {
    delete: () => {
      setOpenModal("delete");
    },
    lifespan: () => {
      setScheduleActionKind("retirement");
      setOpenModal("scheduleAction");
    },
  }

  if (resources.find(r => r?.kind === 'AnarchySubject')) {
    actionHandlers['runtime'] = () => {
      setScheduleActionKind("stop");
      setOpenModal("scheduleAction");
    };
    actionHandlers['start'] = () => setOpenModal("start");
    actionHandlers['stop'] = () => setOpenModal("stop");
  }

  if (resourceClaim) {
    return (<>
      <ServicesItemDeleteModal key="delete"
        isOpen={openModal === "delete"}
        onClose={closeModal}
        onConfirm={handleDelete}
        resourceClaim={resourceClaim}
      />
      <ServicesItemScheduleActionModal key="scheduleAction"
        action={scheduleActionKind}
        isOpen={openModal === "scheduleAction"}
        onClose={closeModal}
        onConfirm={handleScheduleAction}
        resourceClaim={resourceClaim}
      />
      <ServicesItemStartModal key="start"
        isOpen={openModal === "start"}
        onClose={closeModal}
        onConfirm={handleStartAll}
        resourceClaim={resourceClaim}
      />
      <ServicesItemStopModal key="stop"
        isOpen={openModal === "stop"}
        onClose={closeModal}
        onConfirm={handleStopAll}
        resourceClaim={resourceClaim}
      />
      { serviceNamespaces.length > 1 ? (
        <ServicesNamespaceSelector
          current={serviceNamespaceName}
          namespaces={serviceNamespaces}
          onSelect={(ns?: string) => history.push(ns ? `/services/ns/${ns}` : "/services")}
        />
      ) : null }
      <PageSection key="header" variant={PageSectionVariants.light} className="rhpds-services-item-header">
        <Breadcrumb>
          <BreadcrumbItem
            render={({ className }) => <Link to={servicesPath} className={className}>Services</Link>}
          />
          <BreadcrumbItem>Service Details</BreadcrumbItem>
        </Breadcrumb>
        <Split>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">{catalogItemDisplayName}</Title>
            <Title headingLevel="h5" size="lg">{resourceClaim.metadata.name}</Title>
          </SplitItem>
          <SplitItem>
            { externalPlatformUrl ? (
              <Button component="a" href={externalPlatformUrl} target="_blank" variant="tertiary">{ externalPlatformUrl }</Button>
            ) : (
              <ServiceActions
                position="right"
                resourceClaim={resourceClaim}
                actionHandlers={actionHandlers}
              />
            ) }
          </SplitItem>
        </Split>
      </PageSection>
      { resourceClaim.spec.resources[0].provider.name === 'babylon-service-request-configmap' ? (
        <PageSection key="body" variant={PageSectionVariants.light} className="rhpds-services-item-body" style={{"paddingTop": "1em"}}>
          <p>Thank you for your interest in {catalogItemDisplayName}!</p>
          <p>Your request for information about this catalog item has been recorded.</p>
        </PageSection>
      ) : (
        <PageSection key="body" variant={PageSectionVariants.light} className="rhpds-services-item-body">
          <Tabs activeKey={activeTabKey} onSelect={(e, tabIndex) => history.push(`${serviceBasePath}/${tabIndex}`)}>
            <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
              <DescriptionList isHorizontal>
                <DescriptionListGroup>
                  <DescriptionListTerm>Name</DescriptionListTerm>
                  <DescriptionListDescription>{resourceClaim.metadata.name}</DescriptionListDescription>
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
                          onClick={() => {setScheduleActionKind("retirement"); setOpenModal("scheduleAction")}}
                        >
                          <LocalTimestamp timestamp={resourceClaim.status.lifespan.end}/> (
                          <TimeInterval to={resourceClaim.status.lifespan.end}/>)
                          { resourceClaim.spec?.lifespan?.end && resourceClaim.spec.lifespan.end != resourceClaim.status.lifespan.end ? <> <Spinner size="md"/></> : null } <PencilAltIcon className="edit"/>
                        </Button>
                      </DescriptionListDescription>
                    ) : "..." }
                  </DescriptionListGroup>
                ) : null }
                <DescriptionListGroup>
                  <DescriptionListTerm>GUID</DescriptionListTerm>
                  <DescriptionListDescription>
                    <code>{resourceClaim?.status?.resourceHandle?.name.substring(5) || '...'}</code>
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
                        <React.Fragment>
                          <DescriptionListGroup>
                            <DescriptionListTerm>UUID</DescriptionListTerm>
                            <DescriptionListDescription>{resourceState?.spec?.vars?.job_vars?.uuid || '...'}</DescriptionListDescription>
                          </DescriptionListGroup>
                          <DescriptionListGroup>
                            <DescriptionListTerm>Governor</DescriptionListTerm>
                            <DescriptionListDescription>{resourceState?.spec?.governor || '...'}</DescriptionListDescription>
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
                                <TimeInterval to={startTimestamp}/>)
                              </DescriptionListDescription>
                            </DescriptionListGroup>
                          ) : (stopDate && Number(stopDate) > Date.now()) ? (
                            <DescriptionListGroup>
                              <DescriptionListTerm>Scheduled Stop</DescriptionListTerm>
                              <DescriptionListDescription>
                                <Button variant="plain"
                                  onClick={() => {setScheduleActionKind("stop"); setOpenModal("scheduleAction")}}
                                >
                                  <LocalTimestamp timestamp={stopTimestamp}/> (<TimeInterval to={stopTimestamp}/>) <PencilAltIcon className="edit"/>
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
                        </React.Fragment>
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
                { activeTabKey == 'console' ? <OpenStackConsole resourceClaim={resourceClaim}/> : null }
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
                theme="vs-dark"
                value={yaml.dump(prunedResourceClaim)}
                height="500px"
                language="yaml"
              />
            </Tab>
          </Tabs>
        </PageSection>
      ) }
    </>);
  } else {
    return (<>
      <ServicesNamespaceSelector
        current={serviceNamespaceName}
        namespaces={serviceNamespaces}
        onSelect={(ns?: string) => history.push(ns ? `/services/ns/${ns}` : "/services")}
      />
      <PageSection variant={PageSectionVariants.default}>
        { resourceClaims ? (
          <EmptyState>
            <EmptyStateIcon icon={QuestionCircleIcon} />
            <Title headingLevel="h4" size="lg">Service Not Found</Title>
          </EmptyState>
        ) : (
          <EmptyState>
            <EmptyStateIcon icon={LoadingIcon} />
          </EmptyState>
        ) }
      </PageSection>
    </>);
  }
}

export default ServicesItem;
