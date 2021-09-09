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
  const location = useLocation();
  const nsLocationMatch = location.pathname.match(/^\/services\/ns\/([^\/]+)\/item\/([^\/]+)(?:\/([^\/]+))?/);
  const itemLocationMatch = location.pathname.match(/^\/services\/item\/([^\/]+)\/([^\/]+)(?:\/([^\/]+))?/);

  const resourceClaimNamespace = nsLocationMatch?.[1] || itemLocationMatch?.[1];
  const resourceClaimName = nsLocationMatch?.[2] || itemLocationMatch?.[2];
  const serviceNamespaceName = nsLocationMatch?.[1];
  const servicesPath = serviceNamespaceName ? `/services/ns/${serviceNamespaceName}` : '/services';
  const activeTabKey = nsLocationMatch?.[3] || itemLocationMatch?.[3] || 'details';
  const serviceBasePath = serviceNamespaceName ? `/services/ns/${serviceNamespaceName}/item/${resourceClaimName}` : `/services/item/${resourceClaimNamespace}/${resourceClaimName}`;

  const serviceNamespaces = useSelector(selectServiceNamespaces);
  const resourceClaims = useSelector(selectResourceClaims);
  const resourceClaim = resourceClaims?.[resourceClaimNamespace] ? resourceClaims[resourceClaimNamespace].find(rc => rc.metadata.name == resourceClaimName) : null;

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

  const [openModal, setOpenModal] = React.useState(null);
  const [scheduleActionKind, setScheduleActionKind] = React.useState(null);

  const catalogItemDisplayName = (
    resourceClaim?.metadata?.annotations?.["babylon.gpte.redhat.com/catalogItemDisplayName"] ||
    resourceClaim?.metadata?.labels?.["babylon.gpte.redhat.com/catalogItemName"] ||
    "Service"
  );

  const hasMultipleResources = (resourceClaim?.spec?.resources || []).length > 1;

  const externalPlatformUrl = resourceClaim?.metadata?.annotations?.['babylon.gpte.redhat.com/externalPlatformUrl'];
  const canStart = checkResourceClaimCanStart(resourceClaim);
  const canStop = checkResourceClaimCanStop(resourceClaim);
  const labUserInterfaceDataJSON = (
    resourceClaim?.metadata?.annotations?.['babylon.gpte.redhat.com/labUserInterfaceData'] ||
    (resourceClaim?.status?.resources || []).map(
      r => r.state?.kind === 'AnarchySubject' ? r.state.spec?.vars?.provision_data?.lab_ui_data : r.state?.data?.labUserInterfaceData
    ).find(u => u != null)
  );
  const labUserInterfaceData = labUserInterfaceDataJSON ? typeof(labUserInterfaceDataJSON) === 'string' ? JSON.parse(labUserInterfaceDataJSON) : labUserInterfaceDataJSON : null;
  const labUserInterfaceMethod = (
    resourceClaim?.metadata?.annotations?.['babylon.gpte.redhat.com/labUserInterfaceMethod'] ||
    (resourceClaim?.status?.resources || []).map(
      r => r.state?.kind === 'AnarchySubject' ? r.state.spec?.vars?.provision_data?.lab_ui_method : r.state?.data?.labUserInterfaceMethod
    ).find(u => u != null)
  );
  const labUserInterfaceUrl = (
    resourceClaim?.metadata?.annotations?.['babylon.gpte.redhat.com/labUserInterfaceUrl'] ||
    (resourceClaim?.status?.resources || []).map(
      r => r.state?.kind === 'AnarchySubject' ? r.state.spec?.vars?.provision_data?.bookbag_url || r.state.spec?.vars?.provision_data?.lab_ui_url : r.state?.data?.labUserInterfaceUrl
    ).find(u => u != null)
  );
  const labUserInterfaceUrls = JSON.parse(resourceClaim?.metadata?.annotations?.['babylon.gpte.redhat.com/labUserInterfaceUrls'] || '{}')

  const users = {};
  for (const status_resource of (resourceClaim?.status?.resources || [])) {
    const resource_users = status_resource.state?.spec?.vars?.provision_data?.users;
    if (resource_users) {
      Object.assign(users, resource_users);
    }
  }

  function closeModal(): void {
    setOpenModal(null);
  }

  async function handleDelete(): void {
    await deleteResourceClaim(resourceClaim);
    history.push(servicesPath);
  }

  async function handleScheduleAction(time): void {
    if (scheduleActionKind === "retirement") {
      await setLifespanEndForResourceClaim(resourceClaim, time);
    } else if (scheduleActionKind === "stop") {
      await scheduleStopForAllResourcesInResourceClaim(resourceClaim, time);
    }
    closeModal();
  }

  async function handleStartAll(): void {
    await startAllResourcesInResourceClaim(resourceClaim);
    closeModal();
  }

  async function handleStopAll(): void {
    await stopAllResourcesInResourceClaim(resourceClaim);
    closeModal();
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
                actionHandlers={{
                  delete: () => {
                    setOpenModal("delete");
                  },
                  lifespan: () => {
                    setScheduleActionKind("retirement");
                    setOpenModal("scheduleAction");
                  },
                  runtime: () => {
                    setScheduleActionKind("stop");
                    setOpenModal("scheduleAction");
                  },
                  start: () => {
                    setOpenModal("start");
                  },
                  stop: () => {
                    setOpenModal("stop");
                  },
                }}
              />
            ) }
          </SplitItem>
        </Split>
      </PageSection>
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
              const provisionDataEntries = provisionData ? Object.entries(provisionData).filter(([key, value]) => !['bookbag_url', 'msg', 'users'].includes(key)) : null;
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
                          (startDate && startDate > Date.now()) ? (
                          <DescriptionListGroup>
                            <DescriptionListTerm>Scheduled Start</DescriptionListTerm>
                            <DescriptionListDescription>
                              <LocalTimestamp timestamp={startTimestamp}/> (
                              <TimeInterval to={startTimestamp}/>)
                            </DescriptionListDescription>
                          </DescriptionListGroup>
                        ) : (stopDate && stopDate > Date.now()) ? (
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
                              (typeof provisionMessages === 'string' ? provisionMessages : provisionMessages.join("\n")).replaceAll(/^\s+|\s+$/g, '').replaceAll(/([^\n])\n(?!\n)/g, "$1 +\n")
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
              { Object.entries(users).map(([userName, userData]) => {
                const userLabUrl = labUserInterfaceUrls[userName] || userData.bookbag_url;
                const userDataEntries = Object.entries(userData).filter(([key, value]) => !['bookbag_url', 'msg'].includes(key));
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
                          <div dangerouslySetInnerHTML={{ __html: renderContent(userMessages.replaceAll(/^\s+|\s+$/g, '').replaceAll(/([^\n])\n(?!\n)/g, "$1 +\n")) }}/>
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

export { ServicesItem };
