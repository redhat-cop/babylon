import React from 'react';
import { EmptyState, EmptyStateBody,  } from '@patternfly/react-core';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';

const NotFoundComponent: React.FC<{
  name: string;
  namespace?: string;
  type: string;
}> = ({ name, namespace, type }) => (
  <EmptyState  headingLevel="h1" icon={ExclamationTriangleIcon}  titleText={<>{type} not found</>} variant="full">
    <EmptyStateBody>
      {type} {name} was not found{namespace ? ` in project ${namespace}` : ''}.
    </EmptyStateBody>
  </EmptyState>
);

export default NotFoundComponent;
