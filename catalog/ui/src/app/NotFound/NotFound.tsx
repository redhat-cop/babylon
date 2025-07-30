import React from 'react';
import {
  PageSection,
  Button,
  EmptyState,
  EmptyStateBody,
  } from '@patternfly/react-core';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import useDocumentTitle from '@app/utils/useDocumentTitle';

const NotFound: React.FC = () => {
  useDocumentTitle('404 Page Not Found');
  return (
    <PageSection hasBodyWrapper={false}>
      <EmptyState  headingLevel="h1" icon={ExclamationTriangleIcon}  titleText="Sorry, there is a problem" variant="full">
        <EmptyStateBody>
          <p>The page you are trying to access doesn’t seem to exist or you don’t have permission to view it.</p>
          <Button onClick={() => (window.location.href = '/')} style={{ marginTop: "var(--pf-t--global--spacer--lg)" }}>
            Back to start page
          </Button>
        </EmptyStateBody>
      </EmptyState>
    </PageSection>
  );
};

export default NotFound;
