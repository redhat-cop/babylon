import React, { Suspense } from 'react';
import { ResourceClaim } from '@app/types';
import { EmptyState, EmptyStateIcon } from '@patternfly/react-core';
import ErrorCircleOIcon from '@patternfly/react-icons/dist/js/icons/error-circle-o-icon';
import { getCostTracker } from '@app/util';
import useSWR from 'swr';
import { apiPaths, fetchWithUpdatedCostTracker } from '@app/api';
import LoadingIcon from '@app/components/LoadingIcon';
import CurrencyAmount from './CurrencyAmount';

const CostTrackerDialogData: React.FC<{
  resourceClaim: ResourceClaim;
}> = ({ resourceClaim: initialResourceClaim }) => {
  const initialCostTracker = getCostTracker(initialResourceClaim);
  const path = initialCostTracker
    ? apiPaths.RESOURCE_CLAIM({
        namespace: initialResourceClaim.metadata.namespace,
        resourceClaimName: initialResourceClaim.metadata.name,
      })
    : null;

  const { data: resourceClaim } = useSWR<ResourceClaim>(path, (path) =>
    fetchWithUpdatedCostTracker({ path, initialResourceClaim })
  );
  const costTracker = getCostTracker(resourceClaim);

  return costTracker?.estimatedCost ? (
    <div>
      <p>
        <CurrencyAmount amount={costTracker.estimatedCost} />
      </p>
      <p
        style={{
          fontSize: 'var(--pf-global--FontSize--sm)',
          marginTop: 'var(--pf-global--spacer--xs)',
          color: 'var(--pf-global--palette--black-800)',
          fontStyle: 'italic',
        }}
      >
        Estimated by the cloud provider
      </p>
    </div>
  ) : (
    <div>No data available.</div>
  );
};
const CostTrackerDialog: React.FC<{
  resourceClaim: ResourceClaim;
}> = ({ resourceClaim }) =>
  resourceClaim ? (
    <Suspense
      fallback={
        <EmptyState variant="full">
          <EmptyStateIcon icon={LoadingIcon} />
        </EmptyState>
      }
    >
      <CostTrackerDialogData resourceClaim={resourceClaim} />
    </Suspense>
  ) : (
    <ErrorCircleOIcon />
  );

export default CostTrackerDialog;
