import React from 'react';
import { EmptyState, EmptyStateIcon, PageSection, EmptyStateHeader } from '@patternfly/react-core';
import LoadingIcon from './LoadingIcon';

const LoadingSection: React.FC = () => (
  <PageSection>
    <EmptyState variant="full">
      <EmptyStateHeader icon={<EmptyStateIcon icon={LoadingIcon} />} /></EmptyState>
  </PageSection>
);

export default LoadingSection;
