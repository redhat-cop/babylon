import * as React from 'react';
import { CubesIcon } from '@patternfly/react-icons';
import { PageSection, Title } from '@patternfly/react-core';

export interface ISupportProps {
  sampleProp?: string;
}

const Support: React.FunctionComponent<ISupportProps> = () => (
  <PageSection>
    <Title headingLevel="h1" size="lg">
      Support
    </Title>
    <p>... work in progress ...</p>
  </PageSection>
);

export { Support };
