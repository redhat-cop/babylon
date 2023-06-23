import React from 'react';
import { EmptyState, EmptyStateBody, EmptyStateIcon, Title } from '@patternfly/react-core';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import { Workshop, WorkshopProvision } from '@app/types';
import WorkshopsItemProvisioningItem from './WorkshopsItemProvisioningItem';

const WorkshopsItemProvisioning: React.FC<{
  workshop?: Workshop;
  workshopProvisions?: WorkshopProvision[];
  serviceNamespaceName: string;
}> = ({ workshop, workshopProvisions, serviceNamespaceName }) => {
  if (!workshopProvisions || workshopProvisions.length === 0) {
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
  }

  return (
    <>
      {workshopProvisions.map((workshopProvision) => (
        <WorkshopsItemProvisioningItem
          key={workshopProvision.metadata.uid}
          workshop={workshop}
          workshopProvision={workshopProvision}
          serviceNamespaceName={serviceNamespaceName}
        />
      ))}
    </>
  );
};

export default WorkshopsItemProvisioning;
