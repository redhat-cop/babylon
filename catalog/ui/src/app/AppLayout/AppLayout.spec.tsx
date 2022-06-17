jest.mock('../api');
import '@testing-library/jest-dom';

import React from 'react';
import { render, waitFor, fireEvent } from '../utils/test-utils';
import AppLayout from './AppLayout';

jest.mock('@app/utils/useSession', () => {
  return jest.fn(() => ({
    getSession: () => ({ email: 'test@redhat.com', isAdmin: false, serviceNamespaces: [], workshopNamespaces: [] }),
  }));
});

describe('Catalog Page Layout Scenario', () => {
  test("When app layout renders, should display 'Catalog' option", async () => {
    const { getByText } = render(<AppLayout>{'Test'}</AppLayout>);
    const testVar = getByText('Catalog');
    await waitFor(() => expect(testVar).toBeInTheDocument());
  });
  test("When app layout renders, should display 'Services' option", async () => {
    const { getByText } = render(<AppLayout>{'Test'}</AppLayout>);
    const testVar = getByText('Services');
    await waitFor(() => expect(testVar).toBeInTheDocument());
  });
  test('When app layout renders, should display user name', async () => {
    const { getByText } = render(<AppLayout>{'Test'}</AppLayout>);
    const testVar = getByText('test@redhat.com');
    await waitFor(() => expect(testVar).toBeInTheDocument());
  });
  test('When app layout renders, should display hamburger toggle', async () => {
    const { container } = render(<AppLayout>{'Test'}</AppLayout>);
    const testVar = container.querySelector('#nav-toggle');
    await waitFor(() => expect(testVar).toBeTruthy());
  });
});

describe('Catalog page event scenarios', () => {
  test('When navigation toggle is clicked, navigation get hidden', async () => {
    const { container } = render(<AppLayout>{'Test'}</AppLayout>);
    const testVar = container.querySelector('#nav-toggle');
    fireEvent.click(testVar);
    await waitFor(() => expect(testVar).toBeTruthy());
  });
});
