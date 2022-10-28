import React from 'react';
import { PageSection, Title, Button, EmptyState, EmptyStateIcon, EmptyStateBody } from '@patternfly/react-core';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import useDocumentTitle from '@app/utils/useDocumentTitle';

const NotFound: React.FC<{ title?: string }> = ({ title }) => {
  useDocumentTitle(title);
  return (
    <PageSection>
      <EmptyState variant="full">
        <EmptyStateIcon icon={ExclamationTriangleIcon} />
        <Title headingLevel="h1" size="lg">
          Sorry, there is a problem
        </Title>
        <EmptyStateBody>
          <p>The page you are trying to access doesn’t seem to exist or you don’t have permission to view it.</p>
          <Button onClick={() => (window.location.href = '/')} style={{ marginTop: 'var(--pf-global--spacer--lg)' }}>
            Back to start page
          </Button>
        </EmptyStateBody>
      </EmptyState>
    </PageSection>
  );
};

export default NotFound;
