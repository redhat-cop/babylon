import React from 'react';
import { EmptyState, EmptyStateBody, EmptyStateIcon, EmptyStateHeader,  } from '@patternfly/react-core';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';

const NotFoundComponent: React.FC<{
  name: string;
  namespace?: string;
  type: string;
}> = ({ name, namespace, type }) => (
  <EmptyState variant="full">
    <EmptyStateHeader titleText={<>{type} not found</>} icon={<EmptyStateIcon icon={ExclamationTriangleIcon} />} headingLevel="h1" />
    <EmptyStateBody>
      {type} {name} was not found{namespace ? ` in project ${namespace}` : ''}.
    </EmptyStateBody>
  </EmptyState>
);

export default NotFoundComponent;
