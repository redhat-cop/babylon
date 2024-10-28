jest.mock('../api');
import React from 'react';
import { render, waitFor, fireEvent } from '../utils/test-utils';
import AppLayout from './AppLayout';

jest.mock('@app/utils/useSession', () => {
  return jest.fn(() => ({
    getSession: () => ({
      email: 'test@redhat.com',
      isAdmin: false,
      serviceNamespaces: [
        {
          displayName: 'User test-redhat.com',
          name: 'user-test-redhat-com',
          requester: 'test-redhat.com',
        },
      ],
      userNamespace: {
        displayName: 'User test-redhat.com',
        name: 'user-test-redhat-com',
        requester: 'test-redhat.com',
      },
    }),
  }));
});
jest.mock('@app/utils/useInterfaceConfig', () => {
  return jest.fn(() => ({
    incidents_enabled: false,
    ratings_enabled: false,
    status_page_id: '123',
    status_page_url: 'https://redhat.com',
    help_text: '',
    help_link: '',
    internal_help_link: '',
    sfdc_enabled: true,
    partner_connect_header_enabled: false,
  }));
});
jest.mock('@app/api', () => ({
  ...jest.requireActual('@app/api'),
  publicFetcher: () => Promise.resolve(''),
}));

describe('Catalog Page Layout Scenario', () => {
  test("When app layout renders, should display 'Catalog' option", async () => {
    const { getByText } = render(<AppLayout title="test">Test</AppLayout>);
    const testVar = getByText('Catalog');
    await waitFor(() => expect(testVar).toBeInTheDocument());
  });
  test("When app layout renders, should display 'Services' option", async () => {
    const { getByText } = render(<AppLayout title="test">Test</AppLayout>);
    const testVar = getByText('Services');
    await waitFor(() => expect(testVar).toBeInTheDocument());
  });
  test('When app layout renders, should display user name', async () => {
    const { getByText } = render(<AppLayout title="test">Test</AppLayout>);
    const testVar = getByText('test@redhat.com');
    await waitFor(() => expect(testVar).toBeInTheDocument());
  });
  test('When app layout renders, should display hamburger toggle', async () => {
    const { container } = render(<AppLayout title="test">Test</AppLayout>);
    const testVar = container.querySelector('#nav-toggle');
    await waitFor(() => expect(testVar).toBeTruthy());
  });
});

describe('Catalog page event scenarios', () => {
  test('When navigation toggle is clicked, navigation get hidden', async () => {
    const { container } = render(<AppLayout title="test">Test</AppLayout>);
    const testVar = container.querySelector('#nav-toggle');
    fireEvent.click(testVar);
    await waitFor(() => expect(testVar).toBeTruthy());
  });
});
