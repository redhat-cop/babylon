import React, { Suspense, useEffect } from 'react';
import '@patternfly/react-core/dist/styles/base.css';

import { SWRConfig } from 'swr';
import { BrowserRouter, Route, Switch } from 'react-router-dom';
import AppLayout from '@app/AppLayout/AppLayout';
import { AppRoutes } from '@app/routes';
import useImpersonateUser from '@app/utils/useImpersonateUser';
import useScript from '@app/utils/useScript';
import { ErrorBoundary } from 'react-error-boundary';
import { EmptyState, EmptyStateIcon, PageSection } from '@patternfly/react-core';
import NotFound from './NotFound/NotFound';
import LoadingIcon from './components/LoadingIcon';

const Workshop = React.lazy(() => import('@app/Workshop/Workshop'));

import '@app/app.css';

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
          <Route path="/workshop/:workshopId">
            <Suspense
              fallback={
                <PageSection>
                  <EmptyState variant="full">
                    <EmptyStateIcon icon={LoadingIcon} />
                  </EmptyState>
                </PageSection>
              }
            >
              <ErrorBoundary fallbackRender={() => <NotFound />}>
                <Workshop />
              </ErrorBoundary>
            </Suspense>
          </Route>
          <Route path="/">
            <AppLayout>
              <ErrorBoundary fallbackRender={() => <NotFound />}>
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
