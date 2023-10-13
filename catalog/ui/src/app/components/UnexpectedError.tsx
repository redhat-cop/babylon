import React from 'react';
import { EmptyState, EmptyStateBody, EmptyStateIcon, Title } from '@patternfly/react-core';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import { getHelpUrl } from '@app/util';
import useSession from '@app/utils/useSession';

const UnexpectedError: React.FC = () => {
  const { email } = useSession().getSession();
  return (
    <EmptyState variant="full">
      <EmptyStateIcon icon={ExclamationTriangleIcon} />
      <Title headingLevel="h1" size="lg">
        Looks like something went wrong!
      </Title>
      <EmptyStateBody>
        We track these errors automatically, but if the problem persists feel free to{' '}
        <a href={getHelpUrl(email)} target="_blank" rel="noopener noreferrer">
          contact us
        </a>
        .
      </EmptyStateBody>
    </EmptyState>
  );
};
export default UnexpectedError;
