import React, { Suspense } from 'react';
import { PageSection, PageSectionVariants, Split, SplitItem, Title } from '@patternfly/react-core';
import IncidentsAlertList from './IncidentsAlertList';
import LoadingSection from '@app/components/LoadingSection';
import useInterfaceConfig from '@app/utils/useInterfaceConfig';
import UnexpectedError from '@app/components/UnexpectedError';
import CatalogIncidentsAlertList from './CatalogIncidentsAlertList';

import './admin.css';

const IncidentsPage: React.FC = () => {
  const { incidents_enabled } = useInterfaceConfig();
  if (!incidents_enabled) {
    return <UnexpectedError />;
  }
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
      <PageSection key="body-2" variant={PageSectionVariants.light}>
        <Suspense fallback={<LoadingSection />}>
          <CatalogIncidentsAlertList />
        </Suspense>
      </PageSection>
    </>
  );
};

export default IncidentsPage;
