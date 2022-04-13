import * as React from 'react';
import { hot } from 'react-hot-loader/root';
import { CubesIcon } from '@patternfly/react-icons';
import { PageSection, Title } from '@patternfly/react-core';

export interface ISupportProps {
  sampleProp?: string;
}

let Support: React.FunctionComponent<ISupportProps> = () => (
  <PageSection>
    <Title headingLevel="h1" size="lg">
      Support
    </Title>
    <p>... work in progress ...</p>
  </PageSection>
);

Support = hot(Support); // enable HMR for this async module
export { Support };
