import * as React from 'react';

import {
  useSelector,
} from 'react-redux';

import {
  selectResourceClaims,
  selectServiceNamespaces,
  selectUserNamespace,
} from '@app/store';

import './services.css';
const parseDuration = require('parse-duration');

import { useHistory, useLocation, useRouteMatch, Link } from 'react-router-dom';
import {
  Bullseye,
  Button,
  Card,
  CardBody,
  CardTitle,
  DataList,
  DataListAction,
  DataListCell,
  DataListContent,
  DataListItem,
  DataListItemCells,
  DataListItemRow,
  DescriptionList,
  DescriptionListTerm,
  DescriptionListGroup,
  DescriptionListDescription,
  Dropdown,
  DropdownItem,
  DropdownToggle,
  Grid,
  GridItem,
  PageSection,
  PageSectionVariants,
  Title
} from '@patternfly/react-core';

import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  OutlinedClockIcon,
  PauseCircleIcon,
  PlayIcon,
  PowerOffIcon,
  QuestionCircleIcon,
  TrashIcon,
} from '@patternfly/react-icons';

import {
  getApiSession,
  deleteResourceClaim,
  listNamespacedCustomObject,
  patchNamespacedCustomObject,
} from '@app/api';

import TimesIcon from '@patternfly/react-icons/dist/js/icons/times-icon';

import { DatetimeSelect } from '../DatetimeSelect';
import { LocalTimestamp } from '../LocalTimestamp';
import { TimeInterval } from '../TimeInterval';

import { DeleteButton } from './DeleteButton';
import { ServiceStatus } from './ServiceStatus';

export interface ServicesProps {
  location?: any;
}

const Services: React.FunctionComponent<ServicesProps> = ({
  location,
}) => {
  const history = useHistory();

  // Route match when viewing services within a namespace with a specific service selected.
  const serviceNamespaceItemRouteMatch = useRouteMatch<IHostsMatchParams>('/services/ns/:namespace/item/:name');
  // Route match when viewing services within a namespace.
  const serviceNamespaceRouteMatch = useRouteMatch<IHostsMatchParams>('/services/ns/:namespace');
  // Route match when viewing all services with specific service selected.
  const serviceItemRouteMatch = useRouteMatch<IHostsMatchParams>('/services/item/:namespace/:name');

  const resourceClaimNamespace = serviceNamespaceItemRouteMatch?.params.namespace || serviceItemRouteMatch?.params.namespace;
  const resourceClaimName = serviceNamespaceItemRouteMatch?.params.name || serviceItemRouteMatch?.params.name;
  const serviceNamespaceName = serviceNamespaceItemRouteMatch?.params.namespace || serviceNamespaceRouteMatch?.params.namespace;
  const servicesPath = serviceNamespaceName ? `/services/ns/${serviceNamespaceName}` : '/services';

  const [serviceNamespaceSelectIsOpen, setServiceNamespaceSelectIsOpen] = React.useState(false);
  const [userNamespace, setUserNamespace] = React.useState(null);

  const resourceClaims = useSelector(selectResourceClaims);
  const serviceNamespaces = useSelector(selectServiceNamespaces);
  const serviceNamespace = serviceNamespaceName ? (serviceNamespaces.find(ns => ns.name == serviceNamespaceName) || {name: serviceNamespaceName, displayName: serviceNamespaceName, description: ""}) : null;

  async function handleDeleteResourceClaim(resourceClaim): void {
    await deleteResourceClaim(
      resourceClaim.metadata.namespace,
      resourceClaim.metadata.name,
    );
    if (resourceClaimName) {
      history.push(servicesPath);
    }
  }

  function catalogItemDisplayName(item): string {
    if (item.metadata.annotations && item.metadata.annotations['babylon.gpte.redhat.com/catalogItemDisplayName']) {
      return item.metadata.annotations['babylon.gpte.redhat.com/catalogItemDisplayName'];
    } else {
      return 'Catalog Item';
    }
  }

  function unselectResourceClaim(): void {
    if (location.state) {
      history.goBack();
    } else {
      history.push(servicesPath);
    }
  }

  const availableResourceClaims = (
    serviceNamespaceName ? [...(resourceClaims[serviceNamespaceName] || [])]  : Object.values(resourceClaims).flat()
  )
  .sort((a, b) => {
    const av = catalogItemDisplayName(a) + a.metadata.namespace + '/' + a.metadata.name;
    const bv = catalogItemDisplayName(b) + b.metadata.namespace + '/' + b.metadata.name;
    return av < bv ? -1 : av > bv ? 1 : 0;
  });

  function checkCanStart(resourceClaim): boolean {
    if (!resourceClaim.status || !resourceClaim.status.resources) { return false; }
    for (let i=0; i < resourceClaim.status.resources.length; ++i) {
      const anarchySubject = resourceClaim.status.resources[i].state;
      if (!anarchySubject || anarchySubject.spec.vars.current_state != 'stopped' || anarchySubject.spec.vars.desired_state != 'stopped') {
        return false;
      }
    }
     
    return true;
  }

  function checkCanStop(resourceClaim): boolean {
    if (!resourceClaim.status || !resourceClaim.status.resources) { return false; }
    for (let i=0; i < resourceClaim.status.resources.length; ++i) {
      const anarchySubject = resourceClaim.status.resources[i].state;
      if (!anarchySubject) { return false; }
      if (anarchySubject.spec.vars.current_state != 'started' || anarchySubject.spec.vars.desired_state != 'started') {
        return false;
      }
    }
     
    return true;
  }

  function anarchySubjectListItem(resourceClaim, idx, showDetails) {
    const resourceSpec = resourceClaim.spec.resources[idx];
    const resourceStatus = (resourceClaim.status && resourceClaim.status.resources) ? resourceClaim.status.resources[idx] : null;
    const resourceState = (resourceStatus && resourceStatus.state) ? resourceStatus.state : null;
    const currentState = resourceState ? resourceState.spec.vars.current_state : null;
    const desiredState = resourceSpec.template ? resourceSpec.template.spec.vars.desired_state : null;

    const details = [];
    if (showDetails) {
      if (resourceState && resourceState.spec.vars.provision_messages) {
        details.push(
          <DescriptionListGroup key="user-info">
            <DescriptionListTerm>User Info</DescriptionListTerm>
            <DescriptionListDescription>
              <pre>{ resourceState.spec.vars.provision_messages.join("\n") }</pre>
            </DescriptionListDescription>
          </DescriptionListGroup>
        );
      }

      if (resourceState && resourceState.spec.vars.provision_data) {
        const provision_data_keys = Object.keys(resourceState.spec.vars.provision_data);
        provision_data_keys.sort();
        details.push(
          <DescriptionListGroup key="user-data">
            <DescriptionListTerm>User Data</DescriptionListTerm>
            <DescriptionListDescription>
              <DescriptionList isHorizontal className="rhpds-user-data">
                {provision_data_keys.map(key => (
                  <DescriptionListGroup key={key}>
                    <DescriptionListTerm>{key}</DescriptionListTerm>
                    <DescriptionListDescription>
                      <pre>{resourceState.spec.vars.provision_data[key]}</pre>
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                ))}
              </DescriptionList>
            </DescriptionListDescription>
          </DescriptionListGroup>
        );
      }
    }

    return (
      <div className="rhpds-anarchy-subject-list__item" key={idx}>
        <DescriptionList isHorizontal>
          <DescriptionListGroup key="status">
            <DescriptionListTerm>Status</DescriptionListTerm>
            <DescriptionListDescription>
              <ServiceStatus currentState={currentState} desiredState={desiredState}/>
            </DescriptionListDescription>
          </DescriptionListGroup>
          { details }
        </DescriptionList>
      </div>
    );
  }

  function anarchySubjectList(resourceClaim, showDetails) {
    return (
      <div className="rhpds-anarchy-subject-list">
        { resourceClaim.spec.resources.map((resourceSpec, idx) => anarchySubjectListItem(resourceClaim, idx, showDetails)) }
      </div>
    );
  }

  async function setLifespanEnd(resourceClaim, endTime) {
    const endDate = new Date(endTime);
    const data = {
      spec: JSON.parse(JSON.stringify(resourceClaim.spec)),
    }
    if (!data.spec.lifespan) {
      data.spec.lifespan = {};
    }
    data.spec.lifespan.end = endDate.toISOString().split('.')[0] + "Z";

    await patchNamespacedCustomObject(
      'poolboy.gpte.redhat.com', 'v1',
      resourceClaim.metadata.namespace,
      'resourceclaims',
      resourceClaim.metadata.name,
      data,
    );
    //await refreshResourceClaimsFromNamespace(resourceClaim.metadata.namespace);
  }

  async function setRuntimeStop(resourceClaim, idx, stopTime) {
    const stopDate = new Date(stopTime);
    const data = {
      spec: JSON.parse(JSON.stringify(resourceClaim.spec)),
    }
    data.spec.resources[idx].template.spec.vars.action_schedule.stop = stopDate.toISOString().split('.')[0] + "Z";
    await patchNamespacedCustomObject(
      'poolboy.gpte.redhat.com', 'v1',
      resourceClaim.metadata.namespace,
      'resourceclaims',
      resourceClaim.metadata.name,
      data,
    );
    //await refreshResourceClaimsFromNamespace(resourceClaim.metadata.namespace);
  }

  async function requestStart(resourceClaim, idx, resourceState) {
    const defaultRuntime = parseDuration(resourceState.spec.vars.action_schedule.default_runtime)
    const startDate = new Date();
    const stopDate = new Date(Date.now() + defaultRuntime);
    const data = {
      spec: JSON.parse(JSON.stringify(resourceClaim.spec)),
    }
    data.spec.resources[idx].template.spec.vars.action_schedule.start = startDate.toISOString().split('.')[0] + "Z";
    data.spec.resources[idx].template.spec.vars.action_schedule.stop = stopDate.toISOString().split('.')[0] + "Z";

    await patchNamespacedCustomObject(
      'poolboy.gpte.redhat.com', 'v1',
      resourceClaim.metadata.namespace,
      'resourceclaims',
      resourceClaim.metadata.name,
      data,
    );
    //await refreshResourceClaimsFromNamespace(resourceClaim.metadata.namespace);
  }

  async function requestStop(resourceClaim, idx) {
    const stopDate = new Date();
    const data = {
      spec: JSON.parse(JSON.stringify(resourceClaim.spec)),
    }
    data.spec.resources[idx].template.spec.vars.action_schedule.stop = stopDate.toISOString().split('.')[0] + "Z";

    await patchNamespacedCustomObject(
      'poolboy.gpte.redhat.com', 'v1',
      resourceClaim.metadata.namespace,
      'resourceclaims',
      resourceClaim.metadata.name,
      data,
    );
    //await refreshResourceClaimsFromNamespace(resourceClaim.metadata.namespace);
  }

  function resourceClaimListItem(resourceClaim) {
    const nsName = resourceClaim.metadata.namespace + '/' + resourceClaim.metadata.name;
    const isSelected = resourceClaim.metadata.namespace == resourceClaimNamespace && resourceClaim.metadata.name == resourceClaimName;
    const endOfLifespanMaximum = resourceClaim?.status?.lifespan?.maximum ?
      (Date.parse(resourceClaim.metadata.creationTimestamp) + parseDuration(resourceClaim.status.lifespan.maximum)) : null;
    const endOfLifespanRelativeMaximum = resourceClaim?.status?.lifespan?.relativeMaximum ?
      (Date.now() + parseDuration(resourceClaim.status.lifespan.relativeMaximum)) : null;
    const endOfLifespanEffectiveMaximum = (endOfLifespanMaximum && endOfLifespanRelativeMaximum) ?
      Math.min(endOfLifespanMaximum, endOfLifespanRelativeMaximum) :
      endOfLifespanMaximum ? endOfLifespanMaximum : endOfLifespanRelativeMaximum;
    const resourceClaimLinkTo = {
      pathname: serviceNamespace ? `${servicesPath}/item/${resourceClaim.metadata.name}` : `${servicesPath}/item/${resourceClaim.metadata.namespace}/${resourceClaim.metadata.name}`,
      state: { fromServices: true },
    };

    return (
      <DataListItem aria-labelledby={nsName} key={nsName}
        className={isSelected ? 'rhpds-selected-service' : null }
        isExpanded={isSelected}
      >
        <DataListItemRow>
          <DataListItemCells
            dataListCells={[(
              <DataListCell key="claim">
                <Grid>
                  <GridItem span={5}>
                    <Link to={resourceClaimLinkTo}>{catalogItemDisplayName(resourceClaim)}</Link>
                  </GridItem>
                  <GridItem span={5}>
                    <Link to={resourceClaimLinkTo}>{resourceClaim.metadata.name}</Link>
                  </GridItem>
                  <GridItem span={2} rowSpan={2}>
                   <DeleteButton onClick={() => {if (confirm('Delete service request ' + resourceClaim.metadata.name + '?')) { handleDeleteResourceClaim(resourceClaim)}}} />
                  </GridItem>
                  <GridItem span={5}>
                    <DescriptionList isHorizontal>
                      <DescriptionListGroup>
                        <DescriptionListTerm>Requested On</DescriptionListTerm>
                        <DescriptionListDescription>
                          <LocalTimestamp timestamp={resourceClaim.metadata.creationTimestamp}/>
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                      <DescriptionListGroup>
                        <DescriptionListTerm>GUID</DescriptionListTerm>
                        <DescriptionListDescription>
                          {(resourceClaim.status && resourceClaim.status.resourceHandle) ? resourceClaim.status.resourceHandle.name.substring(5) : '...'}
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    </DescriptionList>
                  </GridItem>
                  <GridItem span={5}>
                    { resourceClaim?.status?.lifespan?.end ? (
                      <DatetimeSelect
                        idPrefix={`${resourceClaim.metadata.namespace}:${resourceClaim.metadata.name}:lifespan:`}
                        onSelect={time => setLifespanEnd(resourceClaim, time)}
                        toggleContent={<span>Retirement in <TimeInterval to={resourceClaim.status.lifespan.end} /></span>}
                        current={Date.parse(resourceClaim.status.lifespan.end)}
                        interval={3600000}
                        minimum={Date.now()}
                        maximum={endOfLifespanEffectiveMaximum}
                      />
                    ): null }
                  </GridItem>
                </Grid>
                { resourceClaim.spec.resources.map((resourceSpec, idx) => {
                  const resourceSpec = resourceClaim.spec.resources[idx];
                  const resourceStatus = resourceClaim?.status?.resources[idx];
                  const resourceState = resourceStatus?.state;
                  const currentState = resourceState?.spec?.vars?.current_state;
                  const desiredState = resourceState?.spec?.vars?.desired_state;
                  const startTimestamp = resourceState?.spec?.vars?.action_schedule?.start;
                  const startTime = startTimestamp ? Date.parse(startTimestamp) : null;
                  const stopTimestamp = resourceState?.spec?.vars?.action_schedule?.stop;
                  const stopTime = stopTimestamp ? Date.parse(stopTimestamp) : null;
                  const maximumRuntime = resourceState?.spec?.vars?.action_schedule?.maximum_runtime || 8 * 60 * 60 * 1000;

                  return (
                    <Grid key={idx}>
                      <GridItem span={5}>
                        <DescriptionList isHorizontal>
                          <DescriptionListGroup>
                            <DescriptionListTerm>Status</DescriptionListTerm>
                            <DescriptionListDescription>
                              <ServiceStatus currentState={currentState} desiredState={desiredState} stopTime={stopTime} startTime={startTime}/>
                            </DescriptionListDescription>
                          </DescriptionListGroup>
                        </DescriptionList>
                      </GridItem>
                      <GridItem span={5}>
                        { (startTime && startTime > Date.now()) ? (
                          <DatetimeSelect
                            idPrefix={`${resourceClaim.metadata.namespace}:${resourceClaim.metadata.name}:lifespan:`}
                            onSelect={time => setRuntimeStart(resourceClaim, idx, time)}
                            toggleContent={<span>Start in <TimeInterval to={startTimestamp} /></span>}
                            current={startTime}
                            interval={60 * 60 * 1000}
                            minimum={Date.now()}
                            maximum={Date.now() + 7 * 24 * 60 * 60 * 1000}
                          />
                        ) : (stopTime && stopTime > Date.now()) ? (
                          <DatetimeSelect
                            idPrefix={`${resourceClaim.metadata.namespace}:${resourceClaim.metadata.name}:lifespan:`}
                            onSelect={time => setRuntimeStop(resourceClaim, idx, time)}
                            toggleContent={<span>Stop in <TimeInterval to={stopTimestamp} /></span>}
                            current={stopTime}
                            interval={15 * 60 * 1000}
                            minimum={Date.now()}
                            maximum={Date.now() + parseDuration(maximumRuntime)}
                          />
                        ) : null }
                      </GridItem>
                      <GridItem span={2} rowSpan={2}>
                        { (startTime && stopTime && startTime < Date.now() && stopTime > Date.now()) ? (
                            <Button
                              variant="primary"
                              onClick={() => requestStop(resourceClaim, idx)}
                            >Stop <PowerOffIcon/></Button>
                          ) : (
                            <Button
                              variant="primary"
                              isDisabled={!startTime || !stopTime || (startTime < Date.now() && stopTime > Date.now())}
                              onClick={() => requestStart(resourceClaim, idx, resourceState)}
                            >Start <PlayIcon/></Button>
                          )
                        }
                      </GridItem>
                      { isSelected ? (
                        <GridItem span={11}>
                          <DescriptionList isHorizontal>
                            { resourceState?.spec?.vars?.provision_messages ? (
                              <DescriptionListGroup key="user-info">
                                <DescriptionListTerm>User Info</DescriptionListTerm>
                                <DescriptionListDescription>
                                  <pre>{ resourceState.spec.vars.provision_messages.join("\n") }</pre>
                                </DescriptionListDescription>
                              </DescriptionListGroup>
                            ) : null }
                            { resourceState?.spec?.vars?.provision_data ? (
                              <DescriptionListGroup key="user-data">
                                <DescriptionListTerm>User Data</DescriptionListTerm>
                                <DescriptionListDescription>
                                  <DescriptionList isHorizontal className="rhpds-user-data">
                                    {Object.keys(resourceState.spec.vars.provision_data).sort().map(key => (
                                      <DescriptionListGroup key={key}>
                                        <DescriptionListTerm>{key}</DescriptionListTerm>
                                        <DescriptionListDescription>
                                          <pre>{resourceState.spec.vars.provision_data[key]}</pre>
                                        </DescriptionListDescription>
                                      </DescriptionListGroup>
                                    ))}
                                  </DescriptionList>
                                </DescriptionListDescription>
                              </DescriptionListGroup>
                            ) : null }
                          </DescriptionList>
                        </GridItem>
                      ) : null }
                    </Grid>
                  )
                })}
                { isSelected ? null : (
                  <Link className="rhpds-expand-details" to={resourceClaimLinkTo}>...</Link>
                )}
              </DataListCell>
            )]}
          />
        </DataListItemRow>
      </DataListItem>
    );
  }

  const resourceClaimList = (
    <DataList aria-label="Services list">
      { availableResourceClaims.map(resourceClaim => resourceClaimListItem(resourceClaim)) }
    </DataList>
  );

  const noServicesContent = (
    <Bullseye className="rhpds-no-services-message">
      <Card>
        <CardTitle>
          { serviceNamespace ? `No services in ${serviceNamespace.displayName}.` : "No services." }
        </CardTitle>
        <CardBody>
          <p>Request services using the <Link to="/catalog">catalog</Link>.</p>
        </CardBody>
      </Card>
    </Bullseye>
  )

  return (<>
    { (serviceNamespace || serviceNamespaces.length > 1) ? (
      <PageSection variant={PageSectionVariants.light} className="rhpds-project-select">
        <Dropdown isPlain
          isOpen={serviceNamespaceSelectIsOpen}
          toggle={
            <DropdownToggle onToggle={() => setServiceNamespaceSelectIsOpen(v => !v)}>
              Project: {serviceNamespace ? serviceNamespace.displayName : "all projects"}
            </DropdownToggle>
          }
          dropdownItems={[
              <DropdownItem key="*"
                onClick={() => { setServiceNamespaceSelectIsOpen(false); history.push("/services"); }}
              >- all projects -</DropdownItem>
            ].concat(serviceNamespaces.map(namespace =>
              <DropdownItem key={namespace.name}
                onClick={() => { setServiceNamespaceSelectIsOpen(false); history.push(`/services/ns/${namespace.name}`) }}
              >{namespace.displayName}</DropdownItem>
            ))
          }
        />
      </PageSection>
    ) : null }
    <PageSection variant={availableResourceClaims.length > 0 ? PageSectionVariants.light : null} className="rhpds-services">
      <Title headingLevel="h1" size="xl">Services</Title>
      {availableResourceClaims.length > 0 ? resourceClaimList : noServicesContent}
    </PageSection>
  </>);
}

export { Services };
