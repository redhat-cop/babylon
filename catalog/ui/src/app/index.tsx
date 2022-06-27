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
              <AppRoutes />
            </AppLayout>
          </Route>
        </Switch>
      </BrowserRouter>
    </SWRConfig>
  );
};

export default App;
