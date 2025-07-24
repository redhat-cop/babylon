import React from 'react';
import { EmptyState, PageSection,  } from '@patternfly/react-core';
import LoadingIcon from './LoadingIcon';

const LoadingSection: React.FC = () => (
  <PageSection hasBodyWrapper={false}>
    <EmptyState   icon={LoadingIcon}   variant="full">
      </EmptyState>
  </PageSection>
);

export default LoadingSection;
