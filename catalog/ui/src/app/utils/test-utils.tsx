import React, { ReactElement } from 'react';
import { render, RenderOptions, queries, RenderResult } from '@testing-library/react';
import { Router } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from '@app/store';
import { createMemoryHistory, MemoryHistory } from 'history';

const AllTheProviders = ({ children, history }) => {
  return (
    <Provider store={store}>
      <Router history={history}>{children}</Router>
      <div id="modal-root"></div>
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
