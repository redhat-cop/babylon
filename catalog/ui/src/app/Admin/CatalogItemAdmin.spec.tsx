jest.mock('../api');
import React from 'react';
import { generateSession, render, waitFor } from '../utils/test-utils';
import CatalogItemAdmin from './CatalogItemAdmin';
import catalogItemObj from '../__mocks__/catalogItem.json';
import catalogItemIncident from '../__mocks__/catalogItemIncident.json';
import { CatalogItem, CatalogItemIncident } from '@app/types';
import userEvent from '@testing-library/user-event';
import { apiPaths, fetcher } from '@app/api';

const namespaceName = 'fakeNamespace';
const ciName = 'ci-name';
const asset_uuid = 'c8a5d5ab-1b17-4c6a-866a-fe60de5482b4';

jest.mock('@app/api', () => ({
  ...jest.requireActual('@app/api'),
  fetcher: jest.fn((...args) => {
    if (args[0] === apiPaths.CATALOG_ITEM_LAST_INCIDENT({ stage: 'prod', asset_uuid })) {
      return Promise.resolve(catalogItemIncident as CatalogItemIncident);
    }
    return Promise.resolve(catalogItemObj as CatalogItem);
  }),
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ namespace: namespaceName, name: ciName }),
  useRouteMatch: () => ({
    url: `/admin/catalogitems/${namespaceName}/${ciName}`,
    params: { namespace: namespaceName, name: ciName },
  }),
}));
jest.mock('@app/utils/useSession', () =>
  jest.fn(() => ({
    getSession: () => generateSession({ isAdmin: true }),
  }))
);

describe('CatalogItemAdmin Component', () => {
  test('When renders should show the current values', async () => {
    const { getByLabelText, getByText, getByDisplayValue } = render(<CatalogItemAdmin />);
    await waitFor(() => {
      expect(getByLabelText('Disabled').closest('input')).toBeChecked();
      expect(getByText('Under maintenance')).toBeInTheDocument();
      expect(getByDisplayValue('GPTEINFRA-123')).toBeInTheDocument();
    });
  });
  test('When save form API function is called', async () => {
    const { getByLabelText, getByText } = render(<CatalogItemAdmin />);

    await waitFor(() => {
      expect(getByLabelText('Disabled').closest('input')).toBeChecked();
    });
    await userEvent.click(getByLabelText('Disabled'));
    await userEvent.click(getByText('Under maintenance').closest('button'));
    await userEvent.click(getByText('Operational'));
    const path = apiPaths.CATALOG_ITEM_INCIDENTS({
      stage: 'prod',
      asset_uuid,
    });
    const patch = {
      created_by: 'test@redhat.com',
      disabled: false,
      status: 'Operational',
      incident_url: '',
      jira_url: '',
      comments: JSON.stringify([]),
    };
    await userEvent.click(getByText('Save'));
    expect(fetcher).toHaveBeenCalledWith(path, {
      method: 'POST',
      body: JSON.stringify(patch),
      headers: { 'Content-Type': 'application/json' },
    });
  });
});
