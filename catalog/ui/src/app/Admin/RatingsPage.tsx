import React, { Suspense } from 'react';
import { PageSection } from '@patternfly/react-core';
import RatingsList from './RatingsList';
import LoadingSection from '@app/components/LoadingSection';

import './admin.css';

const RatingsPage: React.FC = () => {
  return (
    <PageSection hasBodyWrapper={false} key="body">
      <Suspense fallback={<LoadingSection />}>
        <RatingsList />
      </Suspense>
    </PageSection>
  );
};

export default RatingsPage;
