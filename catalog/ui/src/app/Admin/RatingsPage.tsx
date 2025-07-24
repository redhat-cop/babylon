import React, { Suspense } from 'react';
import { PageSection, Split, SplitItem, Title } from '@patternfly/react-core';
import RatingsList from './RatingsList';
import LoadingSection from '@app/components/LoadingSection';

import './admin.css';

const RatingsPage: React.FC = () => {
  return (
    <>
      <PageSection hasBodyWrapper={false} key="header" className="admin-header" >
        <Split hasGutter>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">
              Ratings
            </Title>
          </SplitItem>
        </Split>
      </PageSection>
      <PageSection hasBodyWrapper={false} key="body" >
        <Suspense fallback={<LoadingSection />}>
          <RatingsList />
        </Suspense>
      </PageSection>
    </>
  );
};

export default RatingsPage;
