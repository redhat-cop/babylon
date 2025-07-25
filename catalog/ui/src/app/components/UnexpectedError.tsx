import React from 'react';
import { EmptyState, EmptyStateBody,  } from '@patternfly/react-core';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import useHelpLink from '@app/utils/useHelpLink';

const UnexpectedError: React.FC = () => {
  const helpLink = useHelpLink();
  return (
    <EmptyState  headingLevel="h1" icon={ExclamationTriangleIcon}  titleText="Looks like something went wrong!" variant="full">
      <EmptyStateBody>
        We track these errors automatically, but if the problem persists feel free to{' '}
        <a href={helpLink} target="_blank" rel="noopener noreferrer">
          contact us
        </a>
        .
      </EmptyStateBody>
    </EmptyState>
  );
};
export default UnexpectedError;
