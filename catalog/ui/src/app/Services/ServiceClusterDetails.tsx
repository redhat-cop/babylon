import React from 'react';
import { DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from '@patternfly/react-core';
import type { ResourceClaim } from '@app/types';
import { getResourceClaimClusters } from './service-utils';

const ServiceClusterDetails: React.FC<{
  isAdmin: boolean;
  resourceClaims?: ResourceClaim[];
}> = ({ isAdmin, resourceClaims = [] }) => {
  if (!isAdmin) return null;

  const clusters = getResourceClaimClusters(resourceClaims);

  if (clusters.length === 0) return null;

  return (
    <DescriptionListGroup>
      <DescriptionListTerm>Cluster</DescriptionListTerm>
      <DescriptionListDescription>{clusters.join(', ')}</DescriptionListDescription>
    </DescriptionListGroup>
  );
};

export default ServiceClusterDetails;
