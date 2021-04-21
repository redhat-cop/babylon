import * as React from 'react';
import {
  PageSection,
  Title
} from '@patternfly/react-core';

import {
  Link
} from 'react-router-dom';

const Dashboard: React.FunctionComponent = () => (
  <PageSection>
    <Title headingLevel="h1" size="lg">Dashboard</Title>
    <div><Link to="/catalog">Catalog</Link></div>
    <div><Link to="/services">Services</Link></div>
  </PageSection>
)

export { Dashboard };
