import * as React from 'react';
import './services.css';

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

  async function requestStart(resourceClaim) {
    await patchNamespacedCustomObject(
      'poolboy.gpte.redhat.com', 'v1',
      resourceClaim.metadata.namespace,
      'resourceclaims',
      resourceClaim.metadata.name,
      {
        spec: {
          resources: resourceClaim.spec.resources.map(resourceSpec => {
            return {
              template: {
                spec: {
                  vars: {
                    desired_state: "started"
                  }
                }
              }
            };
          })
        }
      }
    );
    await refreshResourceClaimsFromNamespace(resourceClaim.metadata.namespace);
  }

  async function requestStop(resourceClaim) {
    await patchNamespacedCustomObject(
      'poolboy.gpte.redhat.com', 'v1',
      resourceClaim.metadata.namespace,
      'resourceclaims',
      resourceClaim.metadata.name,
      {
        spec: {
          resources: resourceClaim.spec.resources.map(resourceSpec => {
            return {
              template: {
                spec: {
                  vars: {
                    desired_state: "stopped"
                  }
                }
              }
            };
          })
        }
      }
    );
    await refreshResourceClaimsFromNamespace(resourceClaim.metadata.namespace);
  }

  function startStopButton(resourceClaim) {
    if (!resourceClaim.spec || !resourceClaim.spec.resources[0].template || resourceClaim.spec.resources[0].template.spec.vars.desired_state == 'started') {
      return (
        <Button
          variant="primary"
          isDisabled={!checkCanStop(resourceClaim)}
          onClick={() => requestStop(resourceClaim)}
        >Stop <PowerOffIcon/></Button>
      );
    } else {
      return (
        <Button
          variant="primary"
          isDisabled={!checkCanStart(resourceClaim)}
          onClick={() => requestStart(resourceClaim)}
        >Start <PlayIcon/></Button>
      );
    }
  }

  function resourceClaimListItem(resourceClaim) {
    const nsName = resourceClaim.metadata.namespace + '/' + resourceClaim.metadata.name;
    const isSelected = resourceClaim.metadata.namespace == resourceClaimNamespace && resourceClaim.metadata.name == resourceClaimName;
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
              <DataListCell key="title">
                <Link to={resourceClaimLinkTo}>{catalogItemDisplayName(resourceClaim)}</Link>
                <DescriptionList isHorizontal>
                  <DescriptionListGroup>
                    <DescriptionListTerm>Request</DescriptionListTerm>
                    <DescriptionListDescription>
                      {resourceClaim.metadata.name}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
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
                {anarchySubjectList(resourceClaim, isSelected)}
                {isSelected ? null : <Link className="rhpds-expand-details" to={resourceClaimLinkTo}>...</Link>}
              </DataListCell>
            ),(
              <DataListCell key="schedule" className="rhpds-service-schedule">
                { checkCanStop(resourceClaim) ? (
                  <p><OutlinedClockIcon/> Shutdown in <TimeInterval interval={10 * 60} /></p>
                ): null }
                <p><OutlinedClockIcon/> Retirement in <TimeInterval interval={3 * 24 * 60 * 60} /></p>
              </DataListCell>
            )]}
          />
          <DataListAction
            aria-labelledby="check-action-item2 check-action-action2"
            id="check-action-action2"
            aria-label="Actions"
          >
            { startStopButton(resourceClaim) }
            <DeleteButton onClick={() => {if (confirm('Delete service request ' + resourceClaim.metadata.name + '?')) { deleteResourceClaim(resourceClaim)}}} />
          </DataListAction>
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
