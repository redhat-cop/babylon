import React from 'react';
import { useEffect, useReducer, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import { EmptyState, EmptyStateBody, EmptyStateIcon, Title } from '@patternfly/react-core';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';

import { listWorkshopProvisions } from '@app/api';
import { selectUserIsAdmin } from '@app/store';
import { Workshop, WorkshopProvision, WorkshopProvisionList } from '@app/types';
import { displayName, renderContent, BABYLON_DOMAIN } from '@app/util';
import { cancelFetchActivity, k8sFetchStateReducer } from '@app/K8sFetchState';

import LoadingIcon from '@app/components/LoadingIcon';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';

import WorkshopsItemProvisioningItem from './WorkshopsItemProvisioningItem';

const FETCH_BATCH_LIMIT = 30;

interface WorkshopsItemProvisioningProps {
  workshop: Workshop;
}

const WorkshopsItemProvisioning: React.FunctionComponent<WorkshopsItemProvisioningProps> = ({ workshop }) => {
  const componentWillUnmount = useRef(false);
  const userIsAdmin: boolean = useSelector(selectUserIsAdmin);
  const [catalogItemFetchState, reduceCatalogItemFetchState] = useReducer(k8sFetchStateReducer, null);
  const [workshopProvisionsFetchState, reduceWorkshopProvisionsFetchState] = useReducer(k8sFetchStateReducer, null);
  const workshopProvisions: WorkshopProvision[] = (workshopProvisionsFetchState?.items as WorkshopProvision[]) || [];

  async function fetchWorkshopProvisions(): Promise<void> {
    const workshopProvisionList: WorkshopProvisionList = await listWorkshopProvisions({
      continue: workshopProvisionsFetchState.continue,
      labelSelector: `${BABYLON_DOMAIN}/workshop=${workshop.metadata.name}`,
      limit: FETCH_BATCH_LIMIT,
      namespace: workshopProvisionsFetchState.namespace,
    });
    if (!workshopProvisionsFetchState.activity.canceled) {
      reduceWorkshopProvisionsFetchState({
        type: 'post',
        k8sObjectList: workshopProvisionList,
        refreshInterval: 5000,
        refresh: (): void => {
          reduceWorkshopProvisionsFetchState({ type: 'startRefresh' });
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

  // Start fetching WorkshopProvisions
  useEffect(() => {
    reduceWorkshopProvisionsFetchState({
      type: 'startFetch',
      limit: FETCH_BATCH_LIMIT,
      namespaces: [workshop.metadata.namespace],
    });
  }, [workshop.metadata.namespace, workshop.metadata.name]);

  // Fetch or continue fetching WorkshopProvisions
  useEffect(() => {
    if (
      workshopProvisionsFetchState?.canContinue &&
      (workshopProvisionsFetchState.refreshing ||
        workshopProvisionsFetchState.filteredItems.length < workshopProvisionsFetchState.limit)
    ) {
      fetchWorkshopProvisions();
    }
    return () => {
      if (componentWillUnmount.current) {
        cancelFetchActivity(workshopProvisionsFetchState);
      }
    };
  }, [workshopProvisionsFetchState]);

  if (workshopProvisions.length === 0) {
    if (workshopProvisionsFetchState?.finished) {
      return (
        <EmptyState variant="full">
          <EmptyStateIcon icon={ExclamationTriangleIcon} />
          <Title headingLevel="h1" size="lg">
            No WorkshopProvisions found!
          </Title>
          <EmptyStateBody>
            This indicates an error has occurred. A WorkshopProvision should have been created when this Workshop was
            created.
          </EmptyStateBody>
        </EmptyState>
      );
    } else {
      return (
        <EmptyState variant="full">
          <EmptyStateIcon icon={LoadingIcon} />
        </EmptyState>
      );
    }
  }

  return (
    <>
      {workshopProvisions.map((workshopProvision) => (
        <WorkshopsItemProvisioningItem
          key={workshopProvision.metadata.uid}
          onWorkshopProvisionUpdate={(workshopProvision: WorkshopProvision) =>
            reduceWorkshopProvisionsFetchState({ type: 'updateItems', items: [workshopProvision] })
          }
          workshop={workshop}
          workshopProvision={workshopProvision}
        />
      ))}
    </>
  );
};

export default WorkshopsItemProvisioning;
