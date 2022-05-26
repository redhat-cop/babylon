import React from 'react';
import { useEffect, useReducer, useRef, useState } from 'react';
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

import { ExclamationTriangleIcon } from '@patternfly/react-icons';

import { listResourceClaims } from '@app/api';

import { selectResourceClaimsInNamespace, selectServiceNamespace, selectUserIsAdmin } from '@app/store';
import { K8sObjectReference, ResourceClaim, ResourceClaimList, ServiceNamespace, Workshop } from '@app/types';
import { displayName, BABYLON_DOMAIN } from '@app/util';
import { K8sFetchState, cancelFetchActivity, k8sFetchStateReducer } from '@app/K8sFetchState';

import LoadingIcon from '@app/components/LoadingIcon';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';

import ServiceActions from '@app/Services/ServiceActions';
import ServiceStatus from '@app/Services/ServiceStatus';

import { ModalState } from './WorkshopsItem';

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

interface WorkshopsItemServicesProps {
  modalState: ModalState;
  resourceClaimsFetchState: any;
  reduceResourceClaimsFetchState: any;
  setModalState: (modalState: ModalState) => void;
  setSelectedResourceClaims: (resourceClaims: ResourceClaim[]) => void;
  workshop: Workshop;
}

const WorkshopsItemServices: React.FunctionComponent<WorkshopsItemServicesProps> = ({
  modalState,
  setModalState,
  resourceClaimsFetchState,
  reduceResourceClaimsFetchState,
  setSelectedResourceClaims,
  workshop,
}) => {
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
            delete: () => setModalState({ action: 'deleteService', modal: 'action', resourceClaim: resourceClaim }),
            start: () => setModalState({ action: 'startService', modal: 'action', resourceClaim: resourceClaim }),
            stop: () => setModalState({ action: 'stopService', modal: 'action', resourceClaim: resourceClaim }),
          };
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
              {guid
                ? userIsAdmin
                  ? [
                      <Link key="admin" to={`/admin/resourcehandles/${resourceHandle.name}`}>
                        {guid}
                      </Link>,
                      <OpenshiftConsoleLink key="console" reference={resourceHandle} />,
                    ]
                  : guid
                : '-'}
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
            ) : specResources.length == 1 ? (
              <div>
                <ServiceStatus
                  creationTime={Date.parse(resourceClaim.metadata.creationTimestamp)}
                  resource={resources?.[0]}
                  resourceTemplate={specResources[0].template}
                />
              </div>
            ) : (
              '...'
            ),
            // Created
            <>
              <LocalTimestamp key="timestamp" timestamp={resourceClaim.metadata.creationTimestamp} />
              <br key="break" />
              (<TimeInterval key="interval" toTimestamp={resourceClaim.metadata.creationTimestamp} />)
            </>,
            // Actions
            <>
              <ServiceActions position="right" resourceClaim={resourceClaim} actionHandlers={actionHandlers} />
            </>,
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
