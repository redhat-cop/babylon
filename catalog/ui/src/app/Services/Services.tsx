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
  SearchInput,
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
  ResourceClaim,
} from '@app/api';

import TimesIcon from '@patternfly/react-icons/dist/js/icons/times-icon';

import {
  ServicesNamespaceSelector,
} from '@app/Services/NamespaceSelector/ServicesNamespaceSelector';

import { DatetimeSelect } from '@app/components/DatetimeSelect';
import { LabInterfaceLink } from '@app/components/LabInterfaceLink';
import { LoadingIcon } from '@app/components/LoadingIcon';
import { LocalTimestamp } from '@app/components/LocalTimestamp';
import { SelectableTable } from '@app/components/SelectableTable';
import { TimeInterval } from '@app/components/TimeInterval';

import { DeleteButton } from '@app/Services/DeleteButton';
import { ServiceActions } from '@app/Services/ServiceActions';
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
  const serviceNamespaceItemRouteMatch = useRouteMatch<any>('/services/ns/:namespace/item/:name');
  // Route match when viewing services within a namespace.
  const serviceNamespaceRouteMatch = useRouteMatch<any>('/services/ns/:namespace');
  // Route match when viewing all services with specific service selected.
  const serviceItemRouteMatch = useRouteMatch<any>('/services/item/:namespace/:name');

  const resourceClaimName = serviceNamespaceItemRouteMatch?.params.name || serviceItemRouteMatch?.params.name;
  const serviceNamespaceName = serviceNamespaceItemRouteMatch?.params.namespace || serviceNamespaceRouteMatch?.params.namespace;
  const servicesPath = serviceNamespaceName ? `/services/ns/${serviceNamespaceName}` : '/services';

  const [serviceNamespaceSelectIsOpen, setServiceNamespaceSelectIsOpen] = React.useState(false);
  const [userNamespace, setUserNamespace] = React.useState(null);
  const [hoverResourceClaimUid, setHoverResourceClaimUid] = React.useState(null);
  const [openModal, setOpenModal] = React.useState<any>();
  const [selectedResourceClaimUids, setSelectedResourceClaimUids] = React.useState([] as any);
  const [servicesFilter, setServicesFilter] = React.useState('');

  const resourceClaims = useSelector<ResourceClaim[]>(selectResourceClaims);
  const serviceNamespaces = useSelector(selectServiceNamespaces);
  const serviceNamespace = serviceNamespaceName ? (serviceNamespaces.find(ns => ns.name == serviceNamespaceName) || {name: serviceNamespaceName, displayName: serviceNamespaceName, description: ""}) : null;

  const availableResourceClaims = (resourceClaims ? (
    serviceNamespaceName ? [...(resourceClaims[serviceNamespaceName] || [])]  : Object.values(resourceClaims).flat()
  )
  .filter((resourceClaim:ResourceClaim) => {
    const resourceHandleRef = resourceClaim.status?.resourceHandle;
    const externalPlatformUrl = resourceClaim?.metadata?.annotations?.['babylon.gpte.redhat.com/externalPlatformUrl'];
    const guid = resourceHandleRef ? resourceHandleRef.name.startsWith('guid-') ? resourceHandleRef.name.substring(5) : resourceHandleRef.name : null;

    // Hide anything with an external platform url
    if (externalPlatformUrl) { return false; }

    // Hide service request configmaps
    if (resourceClaim.spec.resources[0]?.provider?.name === 'babylon-service-request-configmap') { return false; }

    // Apply services filter
    if (servicesFilter) {
      for (const word of servicesFilter.split(/\s+/).map(w => w.toLowerCase())) {
        if (resourceClaim.metadata.name.includes(word)
          || displayName(resourceClaim).toLowerCase().includes(word)
          || (!serviceNamespace && resourceClaim.metadata.namespace.includes(word))
          || (guid && guid.includes(word))
        ) {
          // pass
        } else {
          return false;
        }
      }
    }

    return true;
  })
  .sort((a, b) => {
    const av = catalogItemDisplayName(a) + a.metadata.namespace + '/' + a.metadata.name;
    const bv = catalogItemDisplayName(b) + b.metadata.namespace + '/' + b.metadata.name;
    return av < bv ? -1 : av > bv ? 1 : 0;
  }) : []);

  const servicesColumns = [
    "Name",
    "GUID",
    "Status",
    "Lab Interface",
    "Actions",
  ];
  if (!serviceNamespace) {
    servicesColumns.splice(1, 0, "Project");
  }

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

  function openStartModal(resourceClaim, modal): void {
    setOpenModal({
      modal: 'start',
      resourceClaim: resourceClaim,
    });
  }

  function openStopModal(resourceClaim, modal): void {
    setOpenModal({
      modal: 'stop',
      resourceClaim: resourceClaim,
    });
  }

  function closeModal(): void {
    setOpenModal(null);
  }

  async function handleDelete(): Promise<any> {
    if (openModal.resourceClaim === 'selected') {
      for (const resourceClaim of availableResourceClaims) {
        if (selectedResourceClaimUids.includes(resourceClaim.metadata.uid)) {
          await deleteResourceClaim(resourceClaim);
        }
      }
    } else {
      await deleteResourceClaim(openModal.resourceClaim);
    }
    closeModal();
  }

  async function handleScheduleAction(time): Promise<any> {
    if (openModal.action === "retirement") {
      await setLifespanEndForResourceClaim(openModal.resourceClaim, time);
    } else if (openModal.action === "stop") {
      await scheduleStopForAllResourcesInResourceClaim(openModal.resourceClaim, time);
    }
    closeModal();
  }

  async function handleStart(): Promise<any> {
    if (openModal.resourceClaim === 'selected') {
      for (const resourceClaim of availableResourceClaims) {
        if (selectedResourceClaimUids.includes(resourceClaim.metadata.uid)) {
          await startAllResourcesInResourceClaim(resourceClaim);
        }
      }
    } else {
      await startAllResourcesInResourceClaim(openModal.resourceClaim);
    }
    closeModal();
  }

  async function handleStop(): Promise<any> {
    if (openModal.resourceClaim === 'selected') {
      for (const resourceClaim of availableResourceClaims) {
        if (selectedResourceClaimUids.includes(resourceClaim.metadata.uid)) {
          await stopAllResourcesInResourceClaim(resourceClaim);
        }
      }
    } else {
      await stopAllResourcesInResourceClaim(openModal.resourceClaim);
    }
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
        onConfirm={handleStart}
        resourceClaim={openModal.resourceClaim}
      />
    ) :
    openModal.modal === 'stop' ? (
      <ServicesItemStopModal key="stop"
        isOpen={true}
        onClose={closeModal}
        onConfirm={handleStop}
        resourceClaim={openModal.resourceClaim}
      />
    ) : null
  ) : null;

  const noServicesContent = resourceClaims ? (
    <EmptyState>
      <Card>
        <CardTitle>
          { servicesFilter ? "No matching services" :
            serviceNamespace ? `No services in ${serviceNamespace.displayName}.` :
            "No services."
          }
        </CardTitle>
        { servicesFilter ? null : (
          <CardBody>
            <p>Request services using the <Link to="/catalog">catalog</Link>.</p>
          </CardBody>
        )}
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
    <PageSection
      variant={availableResourceClaims.length > 0 ? PageSectionVariants.light : undefined}
      className="rhpds-services"
    >
      <ServiceActions
        className="rhpds-all-selected-services-actions"
        isDisabled={selectedResourceClaimUids.length === 0}
        position="right"
        serviceName="Selected"
        actionHandlers={{
          delete: () => openDeleteModal('selected'),
          start: () => openStartModal('selected', 'start'),
          stop: () => openStopModal('selected', 'stop'),
        }}
      />
      <SearchInput
        className="rhpds-services-filter"
        value={servicesFilter}
        aria-label="Filter"
        placeholder="Filter..."
        onChange={(value) => setServicesFilter(value.trim())}
      />
      <Title headingLevel="h1" size="xl">Services</Title>
      {modal}
      {availableResourceClaims.length > 0 ? (
        <SelectableTable
          columns={servicesColumns}
          onSelectAll={(isSelected) => {
            if (isSelected) {
              setSelectedResourceClaimUids(availableResourceClaims.map(resourceClaim => resourceClaim.metadata.uid));
            } else {
              setSelectedResourceClaimUids([]);
            }
          }}
          rows={availableResourceClaims.map((resourceClaim:ResourceClaim) => {
            const resourceHandleRef = resourceClaim.status?.resourceHandle;
            const uid = resourceClaim.metadata.uid;
            const guid = resourceHandleRef ? resourceHandleRef.name.startsWith('guid-') ? resourceHandleRef.name.substring(5) : resourceHandleRef.name : null;
            const resourceClaimPath = serviceNamespace ?
              `${servicesPath}/item/${resourceClaim.metadata.name}` :
              `${servicesPath}/item/${resourceClaim.metadata.namespace}/${resourceClaim.metadata.name}`;
            const specResources = resourceClaim.spec.resources || [];
            const resources = (resourceClaim.status?.resources || []).map(r => r.state);

            // Available actions depends on kind of service
            const actionHandlers = {
              delete: () => openDeleteModal(resourceClaim),
              lifespan: () => openScheduleActionModal(resourceClaim, 'retirement'),
            };
            if (resources.find(r => r?.kind === 'AnarchySubject')) {
              actionHandlers['runtime'] = () => openScheduleActionModal(resourceClaim, 'stop');
              actionHandlers['start'] = () => openStartModal(resourceClaim, 'start');
              actionHandlers['stop'] = () => openStopModal(resourceClaim, 'stop');
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

            const resourceClaimNamespace = serviceNamespaces.find(ns => ns.name === resourceClaim.metadata.namespace);

            const cells = [
              // Name
              <><Link to={{pathname: resourceClaimPath, state: {fromServices: true}}}>{displayName(resourceClaim)}</Link></>,
              // GUID
              guid || '...',
              // Status
              specResources.length > 1 ? (
                <div>
                  <DescriptionList isHorizontal>
                  {specResources.map((specResource, i) => {
                    const componentDisplayName = resourceClaim.metadata.annotations?.[`babylon.gpte.redhat.com/displayNameComponent${i}`] || specResource.name || specResource.provider?.name;
                    return (
                      <DescriptionListGroup key={i}>
                        <DescriptionListTerm key="term">{ componentDisplayName  }</DescriptionListTerm>

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
              ) : '...',
              // Lab Interface
              labUserInterfaceUrl ? (
                <div>
                  <LabInterfaceLink url={labUserInterfaceUrl} data={labUserInterfaceData} method={labUserInterfaceMethod} variant="secondary"/>
                </div>
              ) : '-',
              // Actions
              (<div>
                <ServiceActions
                  position="right"
                  resourceClaim={resourceClaim}
                  actionHandlers={actionHandlers}
                />
              </div>),
            ];
            if (!serviceNamespace) {
              cells.splice(1, 0, resourceClaimNamespace ? displayName(resourceClaimNamespace) : resourceClaim.metadata.namespace);
            }

            return {
              cells: cells,
              selected: selectedResourceClaimUids.includes(uid),
              onSelect: (isSelected) => {
                setSelectedResourceClaimUids(uids => {
                  if (isSelected) {
                    if (selectedResourceClaimUids.includes(uid)) {
                      return selectedResourceClaimUids;
                    } else {
                      return [...selectedResourceClaimUids, uid];
                    }
                  } else {
                    return uids.filter(fuid => fuid !== uid);
                  }
                });
              }
            }
          })}
        />
      ) : noServicesContent}
    </PageSection>
  </>);
}

export default Services;
