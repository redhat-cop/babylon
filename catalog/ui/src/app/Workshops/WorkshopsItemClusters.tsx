import React from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, EmptyStateBody } from '@patternfly/react-core';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import { Table, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';
import { K8sObjectReference, ResourceClaim } from '@app/types';
import { displayName } from '@app/util';
import LocalTimestamp from '@app/components/LocalTimestamp';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
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
    <Table aria-label="Clusters" variant="compact">
      <Thead>
        <Tr>
          <Th>Name</Th>
          <Th>GUID</Th>
          <Th>Status</Th>
          <Th>Created</Th>
        </Tr>
      </Thead>
      <Tbody>
        {activeClaims.map((resourceClaim: ResourceClaim) => {
          const resourceHandle: K8sObjectReference = resourceClaim.status?.resourceHandle;
          const guid = resourceHandle?.name ? resourceHandle.name.replace(/^guid-/, '') : null;

          return (
            <Tr key={resourceClaim.metadata.uid}>
              <Td>
                <Link to={`/services/${resourceClaim.metadata.namespace}/${resourceClaim.metadata.name}`}>
                  {displayName(resourceClaim)}
                </Link>
                {isAdmin ? <OpenshiftConsoleLink resource={resourceClaim} /> : null}
              </Td>
              <Td>
                {guid ? (
                  isAdmin && resourceHandle ? (
                    <>
                      <Link to={`/admin/resourcehandles/${resourceHandle.name}`}>{guid}</Link>
                      <OpenshiftConsoleLink reference={resourceHandle} />
                    </>
                  ) : (
                    guid
                  )
                ) : (
                  '-'
                )}
              </Td>
              <Td>
                <ServiceStatus resourceClaim={resourceClaim} />
              </Td>
              <Td>
                <LocalTimestamp timestamp={resourceClaim.metadata.creationTimestamp} />
                <br />
                (<TimeInterval toTimestamp={resourceClaim.metadata.creationTimestamp} />)
              </Td>
            </Tr>
          );
        })}
      </Tbody>
    </Table>
  );
};

export default WorkshopsItemClusters;
