import React, { ReactElement, Suspense } from 'react';
import { render, RenderOptions, queries, RenderResult } from '@testing-library/react';
import { Router } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from '@app/store';
import { createMemoryHistory, MemoryHistory } from 'history';
import { EmptyState, EmptyStateIcon, PageSection } from '@patternfly/react-core';
import LoadingIcon from '@app/components/LoadingIcon';
import { SWRConfig } from 'swr';

const AllTheProviders = ({ children, history }) => {
  return (
    <Provider store={store}>
      <SWRConfig value={{ suspense: true }}>
        <Router history={history}>
          <Suspense
            fallback={
              <PageSection>
                <EmptyState variant="full">
                  <EmptyStateIcon icon={LoadingIcon} />
                </EmptyState>
              </PageSection>
            }
          >
            {children}
          </Suspense>
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
