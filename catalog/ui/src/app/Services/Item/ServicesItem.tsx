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
  renderAsciiDoc,
} from '@app/util';

import {
  useHistory,
  useRouteMatch,
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
  PencilAltIcon,
} from '@patternfly/react-icons';

import {
  QuestionCircleIcon,
} from '@patternfly/react-icons';

import Editor, { DiffEditor, useMonaco, loader } from "@monaco-editor/react";
const yaml = require('js-yaml');

import {
  ActionDropdown,
  ActionDropdownItem,
} from '@app/components/ActionDropdown';

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
  ServiceStatus
} from '@app/Services/ServiceStatus';

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

  const serviceNamespaceItemRouteMatch = useRouteMatch<IHostsMatchParams>('/services/ns/:namespace/item/:name');
  const serviceItemRouteMatch = useRouteMatch<IHostsMatchParams>('/services/item/:namespace/:name');

  const resourceClaimNamespace = serviceNamespaceItemRouteMatch?.params.namespace || serviceItemRouteMatch?.params.namespace;
  const resourceClaimName = serviceNamespaceItemRouteMatch?.params.name || serviceItemRouteMatch?.params.name;
  const serviceNamespaceName = serviceNamespaceItemRouteMatch?.params.namespace;
  const servicesPath = serviceNamespaceName ? `/services/ns/${serviceNamespaceName}` : '/services';

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

  const [activeTab, setActiveTab] = React.useState('details');
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

  const labUrl = (resourceClaim?.status?.resources || []).map(r => r.state?.spec?.vars?.provision_data?.bookbag_url).find(u => u != null);

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
              <ActionDropdown
                position="right"
                actionDropdownItems={[
                  <ActionDropdownItem
                    key="lifetime"
                    label="Adjust Lifetime"
                    onSelect={() => {setScheduleActionKind("retirement"); setOpenModal("scheduleAction")}}
                    isDisabled={!resourceClaim.status?.lifespan}
                  />,
                  <ActionDropdownItem
                    key="runtime"
                    label="Adjust Runtime"
                    onSelect={() => {setScheduleActionKind("stop"); setOpenModal("scheduleAction")}}
                    isDisabled={!canStop || !resourceClaim.status?.resources?.[0]?.state?.spec?.vars?.action_schedule}
                  />,
                  <ActionDropdownItem
                    key="delete"
                    label="Delete"
                    onSelect={() => setOpenModal("delete")}
                  />,
                  <ActionDropdownItem
                    key="start"
                    label={hasMultipleResources ? "Start all" : "Start"}
                    onSelect={() => setOpenModal("start")}
                    isDisabled={!canStart}
                  />,
                  <ActionDropdownItem
                    key="stop"
                    label={hasMultipleResources ? "Stop all" : "Stop"}
                    onSelect={() => setOpenModal("stop")}
                    isDisabled={!canStop}
                  />,
                ]}
              />
            ) }
          </SplitItem>
        </Split>
      </PageSection>
      <PageSection key="body" variant={PageSectionVariants.light} className="rhpds-services-item-body">
        <Tabs activeKey={activeTab} onSelect={(e, tabIndex) => setActiveTab(tabIndex)}>
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>}>
            <DescriptionList isHorizontal>
              <DescriptionListGroup>
                <DescriptionListTerm>Name</DescriptionListTerm>
                <DescriptionListDescription>{resourceClaim.metadata.name}</DescriptionListDescription>
              </DescriptionListGroup>
              { labUrl ? (
                <DescriptionListGroup>
                  <DescriptionListTerm>Lab Instructions</DescriptionListTerm>
                  <DescriptionListDescription><a href={labUrl} target="_blank">{labUrl}</a></DescriptionListDescription>
                </DescriptionListGroup>
              ) : null }
              <DescriptionListGroup>
                <DescriptionListTerm>Requested On</DescriptionListTerm>
                <DescriptionListDescription>
                  <LocalTimestamp timestamp={resourceClaim.metadata.creationTimestamp}/>
                </DescriptionListDescription>
              </DescriptionListGroup>
              { !externalPlatformUrl ? (
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
              const resourceStatus = resourceClaim?.status?.resources[idx];
              const resourceState = resourceStatus?.state;
              const currentState = resourceState?.spec.vars.current_state;
              const desiredState = resourceState?.spec.vars.desired_state;
              const provisionMessages = resourceState?.spec.vars.provision_messages;
              const provisionData = resourceState?.spec.vars.provision_data;
              const provisionDataEntries = provisionData ? Object.entries(provisionData).filter(([key, value]) => key != 'bookbag_url') : null;
              const stopTimestamp = resourceSpec.template?.spec.vars?.action_schedule?.stop || resourceState?.spec.vars.action_schedule?.stop;
              const stopTime = stopTimestamp ? Date.parse(stopTimestamp) : null;
              const stopDate = stopTime ? new Date(stopTime) : null;
              const startTimestamp = resourceSpec.template?.spec.vars?.action_schedule?.start || resourceState?.spec.vars.action_schedule?.start;
              const startTime = startTimestamp ? Date.parse(startTimestamp) : null;
              const startDate = startTime ? new Date(startTime) : null;
              return (
                <div key={idx} className="rhpds-services-item-body-resource">
                  <DescriptionList isHorizontal>
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
                          currentState={currentState}
                          desiredState={desiredState}
                          creationTime={Date.parse(resourceClaim.metadata.creationTimestamp)}
                          stopTime={stopTime}
                          startTime={startTime}
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
                    { provisionMessages ? (
                      <DescriptionListGroup>
                        <DescriptionListTerm>User Info</DescriptionListTerm>
                        <DescriptionListDescription>
                          <div
                            dangerouslySetInnerHTML={{ __html: renderAsciiDoc(provisionMessages.join(" +\n")) }}
                          />
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    ) : null }
                    { provisionDataEntries ? (
                      <DescriptionListGroup>
                        <DescriptionListTerm>User Data</DescriptionListTerm>
                        <DescriptionListDescription>
                          <DescriptionList isHorizontal className="rhpds-user-data">
                            {provisionDataEntries.map(([key, value]) => (
                              <DescriptionListGroup key={key}>
                                <DescriptionListTerm>{key}</DescriptionListTerm>
                                <DescriptionListDescription>
                                  { value.startsWith('https://') ? <a href={value}><code>{value}</code></a> : <code>{value}</code> }
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
