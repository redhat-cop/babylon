import React from 'react';
import { DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from '@patternfly/react-core';
import type { ResourceClaim } from '@app/types';

const ServiceClusterDetails: React.FC<{
  isAdmin: boolean;
  resourceClaims?: ResourceClaim[];
}> = ({ isAdmin, resourceClaims = [] }) => {
  if (!isAdmin) return null;

  const clusters = [
    ...new Set(
      resourceClaims
        .flatMap((claim) => claim.status?.resources || [])
        .map(({ state }) =>
          state?.kind === 'AnarchySubject' ? state.spec?.vars?.job_vars?.sandbox_openshift_cluster : undefined,
        )
        .filter((cluster): cluster is string => Boolean(cluster)),
    ),
  ].sort();

  if (clusters.length === 0) return null;

  return (
    <DescriptionListGroup>
      <DescriptionListTerm>Cluster</DescriptionListTerm>
      <DescriptionListDescription>{clusters.join(', ')}</DescriptionListDescription>
    </DescriptionListGroup>
  );
};

export default ServiceClusterDetails;
