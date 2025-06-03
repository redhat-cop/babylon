import React, { Suspense } from 'react';
import { RequestUsageCost, ResourceClaim } from '@app/types';
import { EmptyState, EmptyStateIcon, EmptyStateHeader } from '@patternfly/react-core';
import ErrorCircleOIcon from '@patternfly/react-icons/dist/js/icons/error-circle-o-icon';
import useSWR from 'swr';
import LoadingIcon from '@app/components/LoadingIcon';
import CurrencyAmount from './CurrencyAmount';
import { apiPaths, fetcher } from '@app/api';
import TimeInterval from './TimeInterval';

const CostTrackerDialogData: React.FC<{
  resourceClaim: ResourceClaim;
}> = ({ resourceClaim }) => {
  const { data } = useSWR<RequestUsageCost>(
    apiPaths.USAGE_COST_REQUEST({ requestId: resourceClaim.metadata.uid }),
    fetcher,
  );

  return data?.total_cost ? (
    <div>
      <p>
        <CurrencyAmount amount={data.total_cost} />
      </p>
      <p
        style={{
          fontSize: 'var(--pf-v5-global--FontSize--sm)',
          marginTop: 'var(--pf-v5-global--spacer--xs)',
          color: 'var(--pf-v5-global--palette--black-800)',
          fontStyle: 'italic',
        }}
      >
        Last update <TimeInterval toTimestamp={data.last_update} />
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
          <EmptyStateHeader icon={<EmptyStateIcon icon={LoadingIcon} />} />
        </EmptyState>
      }
    >
      <CostTrackerDialogData resourceClaim={resourceClaim} />
    </Suspense>
  ) : (
    <ErrorCircleOIcon />
  );

export default CostTrackerDialog;
