import React, { Suspense } from 'react';
import { Spinner } from '@patternfly/react-core';
import { apiPaths, fetcherItemsInAllPages } from '@app/api';
import { ResourceHandle } from '@app/types';
import useSWR from 'swr';
import { FETCH_BATCH_LIMIT } from '@app/util';
import usePoolStatus from './usePoolStatus';

function fetchResourceHandlesFromResourcePool(resourcePoolName: string) {
  return fetcherItemsInAllPages((continueId) =>
    apiPaths.RESOURCE_HANDLES({
      labelSelector: `poolboy.gpte.redhat.com/resource-pool-name=${resourcePoolName}`,
      limit: FETCH_BATCH_LIMIT,
      continueId,
    })
  );
}

const ResourcePoolStats: React.FC<{ resourcePoolName: string; minAvailable: number }> = ({
  resourcePoolName,
  minAvailable,
}) => {
  const { data: resourceHandles } = useSWR<ResourceHandle[]>(
    apiPaths.RESOURCE_HANDLES({
      labelSelector: `poolboy.gpte.redhat.com/resource-pool-name=${resourcePoolName}`,
      limit: 'ALL',
    }),
    () => fetchResourceHandlesFromResourcePool(resourcePoolName)
  );
  const { total, taken, available } = usePoolStatus(resourceHandles);

  return (
    <ul style={{ display: 'flex', flexDirection: 'row', gap: 'var(--pf-v5-global--spacer--xs)' }}>
      <li>
        <b>Total:</b> {String(total)} /
      </li>
      <li>
        <b>Min available:</b> {String(minAvailable)} /
      </li>
      <li>
        <b>Available:</b> {available === -1 ? <Spinner key="spinner" size="md" /> : String(available)} /
      </li>
      <li>
        <b>Taken:</b> {String(taken)}
      </li>
    </ul>
  );
};

const ResourcePoolStatsWithSuspense: React.FC<{ resourcePoolName: string; minAvailable: number }> = ({
  resourcePoolName,
  minAvailable,
}) => {
  return (
    <Suspense fallback={<Spinner key="spinner" size="md" />}>
      <ResourcePoolStats resourcePoolName={resourcePoolName} minAvailable={minAvailable} />
    </Suspense>
  );
};

export default ResourcePoolStatsWithSuspense;
