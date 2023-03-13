import React from 'react';
import { EmptyState, EmptyStateBody, EmptyStateIcon, Title } from '@patternfly/react-core';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';

const UnexpectedError: React.FC = () => (
  <EmptyState variant="full">
    <EmptyStateIcon icon={ExclamationTriangleIcon} />
    <Title headingLevel="h1" size="lg">
      Looks like something went wrong!
    </Title>
    <EmptyStateBody>
      We track these errors automatically, but if the problem persists feel free to{' '}
      <a href="https://red.ht/open-support" target="_blank" rel="noopener noreferrer">
        contact us
      </a>
      .
    </EmptyStateBody>
  </EmptyState>
);

export default UnexpectedError;
