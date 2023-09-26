import React, { Suspense } from 'react';
import { PageSection, PageSectionVariants, Split, SplitItem, Title } from '@patternfly/react-core';
import RatingsList from './RatingsList';
import LoadingSection from '@app/components/LoadingSection';

import './admin.css';

const RatingsPage: React.FC = () => {
  return (
    <>
      <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
        <Split hasGutter>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">
              Ratings
            </Title>
          </SplitItem>
        </Split>
      </PageSection>
      <PageSection key="body" variant={PageSectionVariants.light}>
        <Suspense fallback={<LoadingSection />}>
          <RatingsList />
        </Suspense>
      </PageSection>
    </>
  );
};

export default RatingsPage;
