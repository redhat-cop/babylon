import React, { ReactElement, Suspense } from 'react';
import { render, RenderOptions, queries, RenderResult } from '@testing-library/react';
import { Router } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from '@app/store';
import { createMemoryHistory, MemoryHistory } from 'history';
import { SWRConfig } from 'swr';
import { CatalogNamespace } from '@app/types';
import LoadingSection from '@app/components/LoadingSection';

const AllTheProviders = ({ children, history }) => {
  return (
    <Provider store={store}>
      <SWRConfig value={{ suspense: true }}>
        <Router history={history}>
          <Suspense fallback={<LoadingSection />}>{children}</Suspense>
        </Router>
        <div id="modal-root"></div>
      </SWRConfig>
    </Provider>
  );
};

const customRender = (
  ui: ReactElement,
  options?: { history: MemoryHistory<unknown> } & Omit<RenderOptions, 'queries'>
): RenderResult<typeof queries> => {
  function getOptions({ history = createMemoryHistory(), ...rest }) {
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

const defaultWorkshopNamespaces = [
  {
    displayName: 'User test-redhat.com',
    name: 'user-test-redhat-com',
  },
];
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const generateSession = ({
  email = 'test@redhat.com',
  isAdmin = false,
  workshopNamespaces = defaultWorkshopNamespaces,
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
  serviceNamespaces: [
    {
      displayName: 'User test-redhat.com',
      name: 'user-test-redhat-com',
    },
  ],
  userNamespace: {
    displayName: 'User test-redhat.com',
    name: 'user-test-redhat-com',
    requester: 'test-redhat.com',
  },
  workshopNamespaces,
  groups: [],
  roles: [],
});
