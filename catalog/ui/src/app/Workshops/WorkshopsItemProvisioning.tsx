import React from 'react';
import { EmptyState, EmptyStateBody, EmptyStateIcon, EmptyStateHeader } from '@patternfly/react-core';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import { Workshop, WorkshopProvision } from '@app/types';
import WorkshopsItemProvisioningItem from './WorkshopsItemProvisioningItem';

const WorkshopsItemProvisioning: React.FC<{
  workshop?: Workshop;
  workshopProvisions?: WorkshopProvision[];
}> = ({ workshop, workshopProvisions }) => {
  if (!workshopProvisions || workshopProvisions.length === 0) {
    return (
      <EmptyState variant="full">
        <EmptyStateHeader
          titleText="No WorkshopProvisions found!"
          icon={<EmptyStateIcon icon={ExclamationTriangleIcon} />}
          headingLevel="h1"
        />
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
        />
      ))}
    </>
  );
};

export default WorkshopsItemProvisioning;
