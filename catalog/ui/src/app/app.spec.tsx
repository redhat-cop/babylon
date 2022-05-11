import * as React from 'react';
import App from '@app/index';
import { render, fireEvent, act } from './utils/test-utils';

describe('App tests', () => {
  it('should render a nav-toggle button', () => {
    const { container } = render(<App />);
    const button = container.querySelector('#nav-toggle');
    expect(button).toBeInTheDocument();
  });

  /*it('should hide the sidebar on smaller viewports', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 600 });
    const { container } = render(<App />);
    fireEvent(window, new Event('resize'));
    await waitFor(() =>
      expect(container.querySelector('#page-sidebar').classList.contains('pf-m-collapsed')).toBeTruthy()
    );
  });*/

  it('should expand the sidebar on larger viewports', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1200 });
    const { container } = render(<App />);
    console.log(window.innerWidth);
    fireEvent.resize(window);
    expect(container.querySelector('#page-sidebar').classList.contains('pf-m-expanded')).toBeTruthy();
  });

  /*it('should hide the sidebar when clicking the nav-toggle button', async () => {
    act(async () => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1200 });
      const { container } = render(<App />);
      fireEvent(window, new Event('resize'));
      const button = container.querySelector('#nav-toggle');
      await waitFor(() =>
        expect(container.querySelector('#page-sidebar').classList.contains('pf-m-expanded')).toBeTruthy()
      );
      fireEvent.click(button);
      await waitFor(() =>
        expect(container.querySelector('#page-sidebar').classList.contains('pf-m-collapsed')).toBeTruthy()
      );
      expect(container.querySelector('#page-sidebar').classList.contains('pf-m-expanded')).toBeFalsy();
    });
  });*/
});
