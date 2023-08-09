import React from 'react';
import App from '@app/index';
import { render } from '@testing-library/react';
import { fireEvent, generateSession } from './utils/test-utils';
import { Provider } from 'react-redux';
import { store } from './store';

jest.mock('@app/utils/useSession', () =>
  jest.fn(() => ({
    getSession: () => generateSession({}),
  })),
);

const wrapper = (children: React.ReactNode) => (
  <Provider store={store}>
    {children}
    <div id="modal-root"></div>
  </Provider>
);

describe('App tests', () => {
  it.only('should render a nav-toggle button', () => {
    const { container } = render(wrapper(<App />));
    const button = container.querySelector('#nav-toggle');
    expect(button).toBeInTheDocument();
  });

  it('should hide the sidebar on smaller viewports', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 600 });
    const { container } = render(wrapper(<App />));
    fireEvent(window, new Event('resize'));
    expect(container.querySelector('#page-sidebar').classList.contains('pf-m-collapsed')).toBeTruthy();
  });

  it('should expand the sidebar on larger viewports', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1200 });
    const { container } = render(wrapper(<App />));
    fireEvent.resize(window);
    expect(container.querySelector('#page-sidebar').classList.contains('pf-m-expanded')).toBeTruthy();
  });

  it('should hide the sidebar when clicking the nav-toggle button', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1200 });
    const { container } = render(wrapper(<App />));
    fireEvent(window, new Event('resize'));
    const button = container.querySelector('#nav-toggle');
    expect(container.querySelector('#page-sidebar').classList.contains('pf-m-expanded')).toBeTruthy();
    fireEvent.click(button);
    expect(container.querySelector('#page-sidebar').classList.contains('pf-m-collapsed')).toBeTruthy();
    expect(container.querySelector('#page-sidebar').classList.contains('pf-m-expanded')).toBeFalsy();
  });
});
