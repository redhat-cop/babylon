import * as React from 'react';
import {
  PageSection,
  Title
} from '@patternfly/react-core';

import {
  Redirect
} from 'react-router-dom';

const Dashboard: React.FunctionComponent = () => (
  <Redirect to="/catalog"/>
)

export default Dashboard;
