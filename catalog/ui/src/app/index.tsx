import React, { Suspense, useEffect } from 'react';
import '@patternfly/react-core/dist/styles/base.css';

import { SWRConfig } from 'swr';
import { BrowserRouter } from 'react-router-dom';
import Routes from '@app/routes';
import useImpersonateUser from '@app/utils/useImpersonateUser';
import useScript from '@app/utils/useScript';
import LoadingSection from './components/LoadingSection';

import '@app/app.css';

const isMonitorEnabled = process.env.MONITOR_ENABLED === 'true';

const App: React.FC = () => {
  const { setImpersonation } = useImpersonateUser();
  useScript(isMonitorEnabled ? '/public/monitor.js' : '');

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
        <Suspense fallback={<LoadingSection />}>
          <Routes />
        </Suspense>
      </BrowserRouter>
    </SWRConfig>
  );
};

export default App;
