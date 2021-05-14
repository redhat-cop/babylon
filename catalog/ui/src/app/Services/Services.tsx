import * as React from 'react';
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
  deleteNamespacedCustomObject,
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

  const resourceClaimNamespaceRouteMatch = useRouteMatch<IHostsMatchParams>('/services/:namespace');
  const resourceClaimRouteMatch = useRouteMatch<IHostsMatchParams>('/services/:namespace/:name');

  const resourceClaimNamespace = (
    resourceClaimRouteMatch ? resourceClaimRouteMatch.params.namespace :
    resourceClaimNamespaceRouteMatch ? resourceClaimNamespaceRouteMatch.params.namespace : null
  );
  const resourceClaimName = (
    resourceClaimRouteMatch ? resourceClaimRouteMatch.params.name : null
  );

  const [resourceClaims, setResourceClaims] = React.useState({});

  async function deleteResourceClaim(resourceClaim): void {
    await deleteNamespacedCustomObject(
      'poolboy.gpte.redhat.com', 'v1',
      resourceClaim.metadata.namespace,
      'resourceclaims',
      resourceClaim.metadata.name
    );
    await refreshResourceClaimsFromNamespace(resourceClaim.metadata.namespace);
    history.push('/services');
  }

  async function refreshResourceClaimsFromNamespace(namespace): void {
    const resp = await listNamespacedCustomObject('poolboy.gpte.redhat.com', 'v1', namespace, 'resourceclaims');
    setResourceClaims((state) => {
      const copy = Object.assign({}, state);
      return Object.assign(copy, { [namespace]: resp.items })
    });
  }

  async function refreshResourceClaims(): void {
    const session = await getApiSession();
    refreshResourceClaimsFromNamespace(session.userNamespace.name);
  }

  React.useEffect(() => {
    refreshResourceClaims();

    const refreshInterval = setInterval(refreshResourceClaims, 5000);

    return function cleanup() {
      clearInterval(refreshInterval);
    };
  }, []);

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
      history.push('/services');
    }
  }

  const availableResourceClaims = (
    resourceClaimNamespace ? (resourceClaims[resourceClaimNamespace] || []) : Object.values(resourceClaims).flat()
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
    await refreshResourceClaimsFromNamespace(resourceClaim.metadata.namespace);
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
    await refreshResourceClaimsFromNamespace(resourceClaim.metadata.namespace);
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
    await refreshResourceClaimsFromNamespace(resourceClaim.metadata.namespace);
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
    await refreshResourceClaimsFromNamespace(resourceClaim.metadata.namespace);
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
      pathname: '/services/' + resourceClaim.metadata.namespace + '/' + resourceClaim.metadata.name,
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
                  <GridItem span={6}>
                    <Link to={resourceClaimLinkTo}>{catalogItemDisplayName(resourceClaim)}</Link>
                  </GridItem>
                  <GridItem span={5}>
                    <Link to={resourceClaimLinkTo}>{resourceClaim.metadata.name}</Link>
                  </GridItem>
                  <GridItem span={1} rowSpan={2}>
                   <DeleteButton onClick={() => {if (confirm('Delete service request ' + resourceClaim.metadata.name + '?')) { deleteResourceClaim(resourceClaim)}}} />
                  </GridItem>
                  <GridItem span={6}>
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
                      <GridItem span={6}>
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
                      <GridItem span={1} rowSpan={2}>
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
        <CardTitle>No services.</CardTitle>
        <CardBody>
          <p>Request services using the <Link to="/catalog">catalog</Link>.</p>
        </CardBody>
      </Card>
    </Bullseye>
  )

  return (
    <PageSection variant={availableResourceClaims.length > 0 ? PageSectionVariants.light : null} className="rhpds-services">
      <Title headingLevel="h1" size="xl">Services</Title>
      {availableResourceClaims.length > 0 ? resourceClaimList : noServicesContent}
    </PageSection>
  );
}

export { Services };
