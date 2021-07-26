import * as React from 'react';

import {
  useSelector,
} from 'react-redux';

import {
  selectResourceClaims,
  selectServiceNamespaces,
  selectUserNamespace,
} from '@app/store';

import {
  checkResourceClaimCanStart,
  checkResourceClaimCanStop,
  displayName,
} from '@app/util';

import './services.css';
const parseDuration = require('parse-duration');

import { useHistory, useLocation, useRouteMatch, Link } from 'react-router-dom';
import {
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
  EmptyState,
  EmptyStateIcon,
  Grid,
  GridItem,
  List,
  ListItem,
  PageSection,
  PageSectionVariants,
  Title,
} from '@patternfly/react-core';

import {
  AsleepIcon,
  ExternalLinkAltIcon,
  OutlinedClockIcon,
  PencilAltIcon,
  PlayIcon,
  PowerOffIcon,
} from '@patternfly/react-icons';

import {
  deleteResourceClaim,
  scheduleStopForAllResourcesInResourceClaim,
  setLifespanEndForResourceClaim,
  startAllResourcesInResourceClaim,
  stopAllResourcesInResourceClaim,
} from '@app/api';

import TimesIcon from '@patternfly/react-icons/dist/js/icons/times-icon';

import {
  ServicesNamespaceSelector,
} from '@app/Services/NamespaceSelector/ServicesNamespaceSelector';

import { DatetimeSelect } from '@app/components/DatetimeSelect';
import { LoadingIcon } from '@app/components/LoadingIcon';
import { LocalTimestamp } from '@app/components/LocalTimestamp';
import { TimeInterval } from '@app/components/TimeInterval';

import { DeleteButton } from '@app/Services/DeleteButton';
import { ServiceStatus } from '@app/Services/ServiceStatus';

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
  const [hoverResourceClaimUid, setHoverResourceClaimUid] = React.useState(null);
  const [openModal, setOpenModal] = React.useState(null);

  const resourceClaims = useSelector(selectResourceClaims);
  const serviceNamespaces = useSelector(selectServiceNamespaces);
  const serviceNamespace = serviceNamespaceName ? (serviceNamespaces.find(ns => ns.name == serviceNamespaceName) || {name: serviceNamespaceName, displayName: serviceNamespaceName, description: ""}) : null;

  const availableResourceClaims = (resourceClaims ? (
    serviceNamespaceName ? [...(resourceClaims[serviceNamespaceName] || [])]  : Object.values(resourceClaims).flat()
  )
  .sort((a, b) => {
    const av = catalogItemDisplayName(a) + a.metadata.namespace + '/' + a.metadata.name;
    const bv = catalogItemDisplayName(b) + b.metadata.namespace + '/' + b.metadata.name;
    return av < bv ? -1 : av > bv ? 1 : 0;
  }) : []);

  function catalogItemDisplayName(item): string {
    if (item.metadata.annotations && item.metadata.annotations['babylon.gpte.redhat.com/catalogItemDisplayName']) {
      return item.metadata.annotations['babylon.gpte.redhat.com/catalogItemDisplayName'];
    } else {
      return 'Catalog Item';
    }
  }

  function openDeleteModal(resourceClaim): void {
    setOpenModal({
      modal: 'delete',
      resourceClaim: resourceClaim,
    });
  }

  function openScheduleActionModal(resourceClaim, action): void {
    setOpenModal({
      modal: 'scheduleAction',
      action: action,
      resourceClaim: resourceClaim,
    });
  }

  function openStartModal(resourceClaim): void {
    setOpenModal({
      modal: 'start',
      resourceClaim: resourceClaim,
    });
  }

  function openStopModal(resourceClaim): void {
    setOpenModal({
      modal: 'stop',
      resourceClaim: resourceClaim,
    });
  }

  function closeModal(): void {
    setOpenModal(null);
  }

  async function handleDelete(): void {
    await deleteResourceClaim(openModal.resourceClaim);
    closeModal();
  }

  async function handleScheduleAction(time): void {
    if (openModal.action === "retirement") {
      await setLifespanEndForResourceClaim(openModal.resourceClaim, time);
    } else if (openModal.action === "stop") {
      await scheduleStopForAllResourcesInResourceClaim(openModal.resourceClaim, time);
    }
    closeModal();
  }

  async function handleStartAll(): void {
    await startAllResourcesInResourceClaim(openModal.resourceClaim);
    closeModal();
  }

  async function handleStopAll(): void {
    await stopAllResourcesInResourceClaim(openModal.resourceClaim);
    closeModal();
  }

  const modal = openModal ? (
    openModal.modal === 'delete' ? (
      <ServicesItemDeleteModal key="delete"
        isOpen={true}
        onClose={closeModal}
        onConfirm={handleDelete}
        resourceClaim={openModal.resourceClaim}
      />
    ) :
    openModal.modal === 'scheduleAction' ? (
      <ServicesItemScheduleActionModal key="scheduleAction"
        action={openModal.action}
        isOpen={true}
        onClose={closeModal}
        onConfirm={handleScheduleAction}
        resourceClaim={openModal.resourceClaim}
      />
    ) :
    openModal.modal === 'start' ? (
      <ServicesItemStartModal key="start"
        isOpen={true}
        onClose={closeModal}
        onConfirm={handleStartAll}
        resourceClaim={openModal.resourceClaim}
      />
    ) :
    openModal.modal === 'stop' ? (
      <ServicesItemStopModal key="stop"
        isOpen={true}
        onClose={closeModal}
        onConfirm={handleStopAll}
        resourceClaim={openModal.resourceClaim}
      />
    ) : null
  ) : null;

  function resourceClaimListItem(resourceClaim) {
    const canStart = checkResourceClaimCanStart(resourceClaim);
    const canStop = checkResourceClaimCanStop(resourceClaim);
    const externalPlatformUrl = resourceClaim?.metadata?.annotations?.['babylon.gpte.redhat.com/externalPlatformUrl'];
    const labUrl = (resourceClaim?.status?.resources || []).map(r => r.state?.spec?.vars?.provision_data?.bookbag_url).find(u => u != null);
    const resourceClaimPath = {
      pathname: serviceNamespace ? `${servicesPath}/item/${resourceClaim.metadata.name}` : `${servicesPath}/item/${resourceClaim.metadata.namespace}/${resourceClaim.metadata.name}`,
      state: { fromServices: true },
    };
    const specResources = resourceClaim.spec.resources || [];

    const firstCellDescriptionListContent = [
      <DescriptionListGroup key="guid">
        <DescriptionListTerm>GUID</DescriptionListTerm>
        <DescriptionListDescription>
          {(resourceClaim.status && resourceClaim.status.resourceHandle) ? resourceClaim.status.resourceHandle.name.substring(5) : '...'}
        </DescriptionListDescription>
      </DescriptionListGroup>
    ];
    const secondCellListContent = []

    if (resourceClaim.status?.lifespan?.end) {
      secondCellListContent.push(
        <ListItem key="retirement">
          <Button variant="plain"
            onClick={(e) => {openScheduleActionModal(resourceClaim, "retirement"); e.preventDefault();}}
          >
            <OutlinedClockIcon/> Retire in <TimeInterval timeOnly={true} to={resourceClaim.status.lifespan.end}/> <PencilAltIcon className="edit"/>
          </Button>
        </ListItem>
      );
    }

    for (let i=0; i < specResources.length; ++i) {
      const resourceSpec = specResources[i];
      const resourceStatus = resourceClaim?.status?.resources[i];
      const resourceState = resourceStatus?.state;
      const currentState = resourceState?.spec?.vars?.current_state;
      const desiredState = resourceState?.spec?.vars?.desired_state;
      const startTimestamp = resourceSpec?.spec?.vars?.action_schedule?.start || resourceState?.spec?.vars?.action_schedule?.start;
      const startTime = startTimestamp ? Date.parse(startTimestamp) : null;
      const stopTimestamp = resourceSpec?.spec?.vars?.action_schedule?.stop || resourceState?.spec?.vars?.action_schedule?.stop;
      const stopTime = stopTimestamp ? Date.parse(stopTimestamp) : null;

      firstCellDescriptionListContent.push(
        <DescriptionListGroup key={`${i}-status`}>
          <DescriptionListTerm>Status</DescriptionListTerm>
          <DescriptionListDescription>
            <ServiceStatus currentState={currentState} desiredState={desiredState} stopTime={stopTime} startTime={startTime}/>
          </DescriptionListDescription>
        </DescriptionListGroup>
      );

      if (startTime && startTime > Date.now()) {
        secondCellListContent.push(
          <ListItem key={`${i}-start`}>
            <AsleepIcon/> Start in <TimeInterval timeOnly={true} to={startTimestamp} />
          </ListItem>
        );
      } else if (stopTime && stopTime > Date.now()) {
        secondCellListContent.push(
          <ListItem key={`${i}-start`}>
            <Button variant="plain"
              onClick={(e) => {openScheduleActionModal(resourceClaim, "stop"); e.preventDefault();}}
            >
              <AsleepIcon/> Stop in <TimeInterval timeOnly={true} to={stopTimestamp} /> <PencilAltIcon className="edit"/>
            </Button>
          </ListItem>
        );
      }
    }

    return (
      <DataListItem
        aria-labelledby={`${resourceClaim.metadata.namespace}/${resourceClaim.metadata.name}`}
        key={resourceClaim.metadata.uid}
        onMouseOver={() => setHoverResourceClaimUid(resourceClaim.metadata.uid)}
        onMouseOut={() => setHoverResourceClaimUid(null)}
      >
        <DataListItemRow>
          <DataListItemCells
            dataListCells={[
              <DataListCell key="cell">
                <Link to={resourceClaimPath}>
                  <h3 className={hoverResourceClaimUid == resourceClaim.metadata.uid ? "rhpds-services-item-title-hover rhpds-services-item-title" : "rhpds-services-item-title"}>{displayName(resourceClaim)}</h3>
                  <Grid>
                    <GridItem span="4">
                      <DescriptionList isHorizontal>{firstCellDescriptionListContent}</DescriptionList>
                    </GridItem>
                    <GridItem span="4">
                      <List>{secondCellListContent}</List>
                    </GridItem>
                    <GridItem span="4">
                      { labUrl ? (
                        <Button
                          component="a"
                          href={labUrl}
                          onClick={() => window.open(labUrl)}
                          target="_blank"
                          variant="secondary"
                          icon={<ExternalLinkAltIcon/>}
                          iconPosition="right"
                        >Lab</Button>
                      ) : null }
                    </GridItem>
                  </Grid>
                </Link>
              </DataListCell>,
            ]}
          />
          { externalPlatformUrl ? (
            <DataListAction aria-label="Actions">
              <Button component="a" href={externalPlatformUrl} target="_blank" variant="secondary">{ externalPlatformUrl }</Button>
            </DataListAction>
          ) : (
            <DataListAction aria-label="Actions">
              <DeleteButton onClick={() => openDeleteModal(resourceClaim)}/>
              { canStop ? (
                <Button
                  variant="primary"
                  onClick={(e) => openStopModal(resourceClaim)}
                >Stop <PowerOffIcon/></Button>
              ) : (
                <Button
                  variant="primary"
                  isDisabled={!canStart}
                  onClick={(e) => openStartModal(resourceClaim)}
                >Start <PlayIcon/></Button>
              )}
            </DataListAction>
          )}
        </DataListItemRow>
      </DataListItem>
    );
  }

  const resourceClaimList = (
    <DataList aria-label="Services list">
      { availableResourceClaims.map(resourceClaim => resourceClaimListItem(resourceClaim)) }
    </DataList>
  );

  const noServicesContent = resourceClaims ? (
    <EmptyState>
      <Card>
        <CardTitle>
          { serviceNamespace ? `No services in ${serviceNamespace.displayName}.` : "No services." }
        </CardTitle>
        <CardBody>
          <p>Request services using the <Link to="/catalog">catalog</Link>.</p>
        </CardBody>
      </Card>
    </EmptyState>
  ) : (
    <EmptyState>
      <EmptyStateIcon icon={LoadingIcon} />
    </EmptyState>
  )

  return (<>
    { serviceNamespaces.length > 1 ? (
      <ServicesNamespaceSelector
        current={serviceNamespaceName}
        namespaces={serviceNamespaces}
        onSelect={(ns?: string) => history.push(ns ? `/services/ns/${ns}` : "/services")}
      />
    ) : null }
    <PageSection variant={availableResourceClaims.length > 0 ? PageSectionVariants.light : null} className="rhpds-services">

      <Title headingLevel="h1" size="xl">Services</Title>
      {modal}
      {availableResourceClaims.length > 0 ? resourceClaimList : noServicesContent}
    </PageSection>
  </>);
}

export { Services };
