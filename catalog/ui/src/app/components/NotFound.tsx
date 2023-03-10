import React from 'react';
import { EmptyState, EmptyStateBody, EmptyStateIcon, Title } from '@patternfly/react-core';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';

const NotFoundComponent: React.FC<{
  name: string;
  namespace?: string;
  type: string;
}> = ({ name, namespace, type }) => (
  <EmptyState variant="full">
    <EmptyStateIcon icon={ExclamationTriangleIcon} />
    <Title headingLevel="h1" size="lg">
      {type} not found
    </Title>
    <EmptyStateBody>
      {type} {name} was not found{namespace ? ` in namespace ${namespace}` : ''}.
    </EmptyStateBody>
  </EmptyState>
);

export default NotFoundComponent;
