import React from 'react';
import '@patternfly/react-core/dist/styles/base.css';
import { BrowserRouter, Route, Switch } from 'react-router-dom';
import AppLayout from '@app/AppLayout/AppLayout';
import Workshop from '@app/Workshop/Workshop';
import { AppRoutes } from '@app/routes';

import '@app/app.css';

const App: React.FC = () => (
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
);

export default App;
