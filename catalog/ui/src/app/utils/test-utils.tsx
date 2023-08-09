import React, { ReactElement, Suspense, useLayoutEffect, useState } from 'react';
import { render, RenderOptions, queries, RenderResult } from '@testing-library/react';
import { Router } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from '@app/store';
import { createMemoryHistory, MemoryHistory } from 'history';
import { SWRConfig } from 'swr';
import { CatalogNamespace, ServiceNamespace, UserNamespace } from '@app/types';
import LoadingSection from '@app/components/LoadingSection';

const AllTheProviders = ({ children, history }) => {
  const [state, setState] = useState({
    action: history.action,
    location: history.location,
  });

  useLayoutEffect(() => history.listen(setState), [history]);

  return (
    <Provider store={store}>
      <SWRConfig value={{ suspense: true }}>
        <Router location={state.location} navigationType={state.action} navigator={history}>
          <Suspense fallback={<LoadingSection />}>{children}</Suspense>
        </Router>
        <div id="modal-root"></div>
      </SWRConfig>
    </Provider>
  );
};

const customRender = (
  ui: ReactElement,
  options?: { history: MemoryHistory } & Omit<RenderOptions, 'queries'>,
): RenderResult<typeof queries> => {
  function getOptions({ history = createMemoryHistory({ initialEntries: ['/'] }), ...rest }) {
    return { rest, history };
  }
  const { history, ...rest } = getOptions(options || {});
  return render(ui, {
    wrapper: ({ children }) => <AllTheProviders history={history}>{children}</AllTheProviders>,
    ...rest,
  });
};

// re-export everything
export * from '@testing-library/react';

// override render method
export { customRender as render };

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const generateSession = ({
  email = 'test@redhat.com',
  isAdmin = false,
  serviceNamespaces = [
    {
      displayName: 'User test-redhat.com',
      name: 'user-test-redhat-com',
      requester: 'test-redhat.com',
    } as ServiceNamespace,
  ],
  userNamespace = {
    displayName: 'User test-redhat.com',
    name: 'user-test-redhat-com',
    requester: 'test-redhat.com',
  } as UserNamespace,
}) => ({
  email,
  isAdmin,
  catalogNamespaces: [
    {
      name: 'fake.catalog',
      description: 'Fake Catalog description',
      displayName: 'Fake Catalog',
    } as CatalogNamespace,
  ],
  serviceNamespaces,
  userNamespace,
  groups: [],
  roles: [],
});
