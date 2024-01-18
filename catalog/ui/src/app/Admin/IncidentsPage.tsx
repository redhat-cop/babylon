import React, { Suspense } from 'react';
import { PageSection, PageSectionVariants, Split, SplitItem, Title } from '@patternfly/react-core';
import IncidentsAlertList from './IncidentsAlertList';
import LoadingSection from '@app/components/LoadingSection';

import './admin.css';

const IncidentsPage: React.FC = () => {
  return (
    <>
      <PageSection key="header" className="admin-header" variant={PageSectionVariants.light}>
        <Split hasGutter>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">
              Incidents
            </Title>
          </SplitItem>
        </Split>
      </PageSection>
      <PageSection key="body" variant={PageSectionVariants.light}>
        <Suspense fallback={<LoadingSection />}>
          <IncidentsAlertList />
        </Suspense>
      </PageSection>
    </>
  );
};

export default IncidentsPage;
