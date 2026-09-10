import React from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, EmptyStateBody } from '@patternfly/react-core';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import { K8sObjectReference, ResourceClaim } from '@app/types';
import { displayName } from '@app/util';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import SelectableTable from '@app/components/SelectableTable';
import TimeInterval from '@app/components/TimeInterval';
import ServiceStatus from '@app/Services/ServiceStatus';
import useSession from '@app/utils/useSession';

const WorkshopsItemClusters: React.FC<{
  resourceClaims: ResourceClaim[];
}> = ({ resourceClaims }) => {
  const { isAdmin } = useSession().getSession();

  const activeClaims = resourceClaims.filter((r) => !r.metadata.deletionTimestamp);

  if (activeClaims.length === 0) {
    return (
      <EmptyState headingLevel="h1" icon={ExclamationTriangleIcon} titleText="No Clusters Found" variant="full">
        <EmptyStateBody>No clusters have been provisioned for this workshop.</EmptyStateBody>
      </EmptyState>
    );
  }

  return (
    <SelectableTable
      columns={['Name', 'GUID', 'Status', 'Created']}
      onSelectAll={() => undefined}
      rows={activeClaims.map((resourceClaim: ResourceClaim) => {
        const resourceHandle: K8sObjectReference = resourceClaim.status?.resourceHandle;
        const guid = resourceHandle?.name ? resourceHandle.name.replace(/^guid-/, '') : null;

        return {
          cells: [
            <>
              <Link
                key="services"
                to={`/services/${resourceClaim.metadata.namespace}/${resourceClaim.metadata.name}`}
              >
                {displayName(resourceClaim)}
              </Link>
              {isAdmin ? <OpenshiftConsoleLink key="console" resource={resourceClaim} /> : null}
            </>,
            <>
              {guid ? (
                isAdmin && resourceHandle ? (
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
            <ServiceStatus key="status" resourceClaim={resourceClaim} />,
            <>
              <LocalTimestamp key="timestamp" timestamp={resourceClaim.metadata.creationTimestamp} />
              <br key="break" />
              (<TimeInterval key="interval" toTimestamp={resourceClaim.metadata.creationTimestamp} />)
            </>,
          ],
        };
      })}
    />
  );
};

export default WorkshopsItemClusters;
