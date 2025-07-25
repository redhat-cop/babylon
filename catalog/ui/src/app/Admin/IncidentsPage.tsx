import React, { Suspense } from 'react';
import { PageSection, Split, SplitItem, Title } from '@patternfly/react-core';
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
      <PageSection hasBodyWrapper={false} key="header" className="admin-header" >
        <Split hasGutter>
          <SplitItem isFilled>
            <Title headingLevel="h4" size="xl">
              Incidents
            </Title>
          </SplitItem>
        </Split>
      </PageSection>
      <PageSection hasBodyWrapper={false} key="body" >
        <Suspense fallback={<LoadingSection />}>
          <IncidentsAlertList />
        </Suspense>
      </PageSection>
      <PageSection hasBodyWrapper={false} key="body-2" >
        <Suspense fallback={<LoadingSection />}>
          <CatalogIncidentsAlertList />
        </Suspense>
      </PageSection>
    </>
  );
};

export default IncidentsPage;
