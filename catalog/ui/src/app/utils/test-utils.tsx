import React, { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { BrowserRouter as Router } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from '@app/store';

const AllTheProviders = ({ children }) => {
<<<<<<< HEAD
  return (
    <Provider store={store}>
      <Router>
        {children}
      </Router>
    </Provider>
  );
=======
    return (
        <Provider store={store}>
            <Router>
                {children}
            </Router>
        </Provider>
    );
>>>>>>> upstream/main
};

const customRender = (ui: ReactElement, options?) => render(ui, { wrapper: AllTheProviders, ...options })

// re-export everything
export * from '@testing-library/react'

// override render method
<<<<<<< HEAD
export { customRender as render }
=======
export { customRender as render }
>>>>>>> upstream/main
