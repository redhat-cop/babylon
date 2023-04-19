import React from 'react';
import { PageSection, PageSectionVariants } from '@patternfly/react-core';
import IncidentsAlertList from './IncidentsAlertList';

import './admin.css';

const IncidentsPage: React.FC = () => {
  return (
    <>
      <PageSection key="body" variant={PageSectionVariants.light}>
        <IncidentsAlertList />
      </PageSection>
      <PageSection key="body" variant={PageSectionVariants.light}>
        <IncidentsAlertList />
      </PageSection>
    </>
  );
};

export default IncidentsPage;
