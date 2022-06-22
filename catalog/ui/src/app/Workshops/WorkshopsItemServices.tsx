import React, { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';

import {
  DescriptionList,
  DescriptionListTerm,
  DescriptionListGroup,
  DescriptionListDescription,
  EmptyState,
  EmptyStateBody,
  EmptyStateIcon,
  Title,
} from '@patternfly/react-core';

import { DollarSignIcon, ExclamationTriangleIcon, PauseIcon, PlayIcon, TrashIcon } from '@patternfly/react-icons';

import { listResourceClaims } from '@app/api';

import { selectResourceClaimsInNamespace, selectServiceNamespace, selectUserIsAdmin } from '@app/store';
import { K8sObjectReference, ResourceClaim, ResourceClaimList, ServiceNamespace, Workshop } from '@app/types';
import { displayName, BABYLON_DOMAIN, checkResourceClaimCanStart, checkResourceClaimCanStop } from '@app/util';
import { cancelFetchActivity } from '@app/K8sFetchState';

import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';
import ServiceStatus from '@app/Services/ServiceStatus';

import { ModalState } from './WorkshopsItem';
import ButtonCircleIcon from '@app/components/ButtonCircleIcon';
import LabInterfaceLink from '@app/components/LabInterfaceLink';

const FETCH_BATCH_LIMIT = 30;

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

const WorkshopsItemServices: React.FC<{
  modalState: ModalState;
  resourceClaimsFetchState: any;
  reduceResourceClaimsFetchState: any;
  showModal: (modalState: ModalState) => void;
  setSelectedResourceClaims: (resourceClaims: ResourceClaim[]) => void;
  workshop: Workshop;
}> = ({ showModal, resourceClaimsFetchState, reduceResourceClaimsFetchState, setSelectedResourceClaims, workshop }) => {
  const componentWillUnmount = useRef(false);
  const sessionServiceNamespace: ServiceNamespace = useSelector((state) =>
    selectServiceNamespace(state, workshop.metadata.namespace)
  );
  const sessionResourceClaimsInNamespace = useSelector((state) =>
    selectResourceClaimsInNamespace(state, workshop.metadata.namespace)
  );
  const userIsAdmin = useSelector(selectUserIsAdmin);

  // Normally resource claims are automatically fetched as a background process
  // by the store, but if the user is an admin and the services list isn't
  // restricted to the admin's service namespaces then we need to use logic
  // in this component to fetch the ResourceClaims.
  const enableFetchResourceClaims: boolean = userIsAdmin && !sessionServiceNamespace;

  const [selectedUids, setSelectedUids] = React.useState<string[]>([]);

  const resourceClaims: ResourceClaim[] = enableFetchResourceClaims
    ? (resourceClaimsFetchState?.items as ResourceClaim[]) || []
    : sessionResourceClaimsInNamespace.filter(
        (resourceClaim) => resourceClaim.metadata.labels?.[`${BABYLON_DOMAIN}/workshop`] == workshop.metadata.name
      );
  const selectedResourceClaims: ResourceClaim[] = resourceClaims.filter((resourceClaim) =>
    selectedUids.includes(resourceClaim.metadata.uid)
  );

  async function fetchResourceClaims(): Promise<void> {
    const resourceClaimList: ResourceClaimList = await listResourceClaims({
      continue: resourceClaimsFetchState.continue,
      labelSelector: `${BABYLON_DOMAIN}/workshop=${workshop.metadata.name}`,
      limit: FETCH_BATCH_LIMIT,
      namespace: workshop.metadata.namespace,
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

  // Track unmount for other effect cleanups
  useEffect(() => {
    return () => {
      componentWillUnmount.current = true;
    };
  }, []);

  // Fetch or continue fetching resource claims
  useEffect(() => {
    if (resourceClaimsFetchState?.canContinue) {
      fetchResourceClaims();
    }
    return () => {
      if (componentWillUnmount.current) {
        cancelFetchActivity(resourceClaimsFetchState);
      }
    };
  }, [resourceClaimsFetchState]);

  // Reload on filter change
  useEffect(() => {
    if (enableFetchResourceClaims) {
      reduceResourceClaimsFetchState({
        type: 'startFetch',
        limit: FETCH_BATCH_LIMIT,
        namespaces: [workshop.metadata.namespace],
        prune: pruneResourceClaim,
      });
    } else if (resourceClaimsFetchState) {
      cancelFetchActivity(resourceClaimsFetchState);
    }
  }, [workshop.metadata.uid]);

  useEffect(() => {
    setSelectedResourceClaims(selectedResourceClaims);
  }, [selectedUids]);

  // Show loading until whether the user is admin is determined.
  if (userIsAdmin === null) {
    return (
      <EmptyState variant="full">
        <EmptyStateIcon icon={LoadingIcon} />
      </EmptyState>
    );
  }

  if (resourceClaims.length == 0) {
    if (enableFetchResourceClaims && !resourceClaimsFetchState?.finished) {
      return (
        <EmptyState variant="full">
          <EmptyStateIcon icon={LoadingIcon} />
        </EmptyState>
      );
    } else {
      return (
        <EmptyState variant="full">
          <EmptyStateIcon icon={ExclamationTriangleIcon} />
          <Title headingLevel="h1" size="lg">
            No Services Found
          </Title>
          <EmptyStateBody>No services have been provisioned for this workshop.</EmptyStateBody>
        </EmptyState>
      );
    }
  }

  return (
    <>
      <SelectableTable
        key="table"
        columns={['Name', 'GUID', 'Status', 'Created', 'Actions']}
        onSelectAll={(isSelected) => {
          if (isSelected) {
            setSelectedUids(resourceClaims.map((resourceClaim) => resourceClaim.metadata.uid));
          } else {
            setSelectedUids([]);
          }
        }}
        rows={resourceClaims.map((resourceClaim: ResourceClaim) => {
          const resourceHandle: K8sObjectReference = resourceClaim.status?.resourceHandle;
          const guid = resourceHandle?.name ? resourceHandle.name.replace(/^guid-/, '') : null;
          const specResources = resourceClaim.spec.resources || [];
          const resources = (resourceClaim.status?.resources || []).map((r) => r.state);
          const actionHandlers = {
            delete: () => showModal({ action: 'deleteService', resourceClaim: resourceClaim }),
            start: () => showModal({ action: 'startService', resourceClaim: resourceClaim }),
            stop: () => showModal({ action: 'stopService', resourceClaim: resourceClaim }),
          };
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
          const cells: any[] = [
            // Name
            <>
              <Link key="services" to={`/services/${resourceClaim.metadata.namespace}/${resourceClaim.metadata.name}`}>
                {displayName(resourceClaim)}
              </Link>
              {userIsAdmin ? <OpenshiftConsoleLink key="console" resource={resourceClaim} /> : null}
            </>,
            // GUID
            <>
              {guid ? (
                userIsAdmin ? (
                  [
                    <Link key="admin" to={`/admin/resourcehandles/${resourceHandle.name}`}>
                      {guid}
                    </Link>,
                    <OpenshiftConsoleLink key="console" reference={resourceHandle} />,
                  ]
                ) : (
                  guid
                )
              ) : (
                <p>-</p>
              )}
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
            ) : specResources.length === 1 ? (
              <div>
                <ServiceStatus
                  creationTime={Date.parse(resourceClaim.metadata.creationTimestamp)}
                  resource={resources?.[0]}
                  resourceTemplate={specResources[0].template}
                />
              </div>
            ) : (
              <p>...</p>
            ),
            // Created
            <>
              <LocalTimestamp key="timestamp" timestamp={resourceClaim.metadata.creationTimestamp} />
              <br key="break" />
              (<TimeInterval key="interval" toTimestamp={resourceClaim.metadata.creationTimestamp} />)
            </>,
            // Actions
            <React.Fragment key="actions">
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  gap: 'var(--pf-global--spacer--sm)',
                }}
                className="workshops-item-services__actions"
              >
                <ButtonCircleIcon
                  isDisabled={!checkResourceClaimCanStart(resourceClaim)}
                  onClick={actionHandlers.start}
                  description="Start"
                  icon={PlayIcon}
                  key="actions__start"
                />
                <ButtonCircleIcon
                  isDisabled={!checkResourceClaimCanStop(resourceClaim)}
                  onClick={actionHandlers.stop}
                  description="Stop"
                  icon={PauseIcon}
                  key="actions__stop"
                />
                <ButtonCircleIcon
                  key="actions__delete"
                  onClick={actionHandlers.delete}
                  description="Delete"
                  icon={TrashIcon}
                />
                {false ? (
                  <ButtonCircleIcon
                    key="actions__cost"
                    onClick={null}
                    description="Get current cost"
                    icon={DollarSignIcon}
                  />
                ) : null}
                {
                  // Lab Interface
                  labUserInterfaceUrl ? (
                    <LabInterfaceLink
                      key="actions__lab-interface"
                      url={labUserInterfaceUrl}
                      data={labUserInterfaceData}
                      method={labUserInterfaceMethod}
                      variant="circle"
                    />
                  ) : null
                }
              </div>
            </React.Fragment>,
          ];

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
    </>
  );
};

export default WorkshopsItemServices;
