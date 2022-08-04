import React from 'react';
import { EmptyState, EmptyStateIcon, PageSection } from '@patternfly/react-core';
import LoadingIcon from './LoadingIcon';

const LoadingSection: React.FC = () => (
  <PageSection>
    <EmptyState variant="full">
      <EmptyStateIcon icon={LoadingIcon} />
    </EmptyState>
  </PageSection>
);

export default LoadingSection;
