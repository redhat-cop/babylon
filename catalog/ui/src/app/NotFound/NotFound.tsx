import * as React from 'react';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';
import {
  PageSection,
  Title,
  Button,
  EmptyState,
  EmptyStateIcon,
  EmptyStateBody,
} from '@patternfly/react-core';
import { useSelector } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { selectUser } from '@app/store';
import { LoadingIcon } from '@app/components/LoadingIcon';

const NotFound: React.FunctionComponent = () => {

  const user = useSelector(selectUser);

  function GoHomeBtn() {
    const history = useHistory();
    function handleClick() {
      history.push('/');
    }
    return (
      <Button onClick={handleClick}>Take me home</Button>
    );
  }

  if (user) {
    return (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={ExclamationTriangleIcon} />
          <Title headingLevel="h1" size="lg">
            404 Page not found
          </Title>
          <EmptyStateBody>
            We didn&apos;t find a page that matches the address you navigated to.
          </EmptyStateBody>
          <GoHomeBtn />
        </EmptyState>
      </PageSection>
    );
  } else {
    return (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={LoadingIcon} />
        </EmptyState>
      </PageSection>
    );
  }
};

export default NotFound;
