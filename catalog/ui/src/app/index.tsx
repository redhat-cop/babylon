import React, { useEffect } from 'react';
import '@patternfly/react-core/dist/styles/base.css';

import { SWRConfig } from 'swr';
import { BrowserRouter, Route, Switch } from 'react-router-dom';
import AppLayout from '@app/AppLayout/AppLayout';
import Workshop from '@app/Workshop/Workshop';
import { AppRoutes } from '@app/routes';
import useImpersonateUser from '@app/utils/useImpersonateUser';
import useScript from '@app/utils/useScript';

import '@app/app.css';
import { ErrorBoundary } from 'react-error-boundary';
import { Button, EmptyState, EmptyStateBody, EmptyStateIcon, PageSection, Title } from '@patternfly/react-core';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';

const isMonitorEnabled = process.env.MONITOR_ENABLED === 'true';

const App: React.FC = () => {
  const { setImpersonation } = useImpersonateUser();
  useScript(isMonitorEnabled ? '/monitor.js' : '');

  useEffect(() => {
    const impersonateUserName = sessionStorage.getItem('impersonateUser');
    if (impersonateUserName) {
      setImpersonation(impersonateUserName);
    }
  }, [setImpersonation]);
  return (
    <SWRConfig
      value={{
        suspense: true,
      }}
    >
      <BrowserRouter>
        <Switch>
          <Route path="/workshop">
            <Workshop />
          </Route>
          <Route path="/">
            <AppLayout>
              <ErrorBoundary
                fallbackRender={() => (
                  <PageSection>
                    <EmptyState variant="full">
                      <EmptyStateIcon icon={ExclamationTriangleIcon} />
                      <Title headingLevel="h1" size="lg">
                        Sorry, there is a problem
                      </Title>
                      <EmptyStateBody>
                        <p>
                          The page you are trying to access doesn’t seem to exist or you don’t have permission to view
                          it.
                        </p>
                        <Button
                          onClick={() => (window.location.href = '/')}
                          style={{ marginTop: 'var(--pf-global--spacer--lg)' }}
                        >
                          Back to start page
                        </Button>
                      </EmptyStateBody>
                    </EmptyState>
                  </PageSection>
                )}
              >
                <AppRoutes />
              </ErrorBoundary>
            </AppLayout>
          </Route>
        </Switch>
      </BrowserRouter>
    </SWRConfig>
  );
};

export default App;
