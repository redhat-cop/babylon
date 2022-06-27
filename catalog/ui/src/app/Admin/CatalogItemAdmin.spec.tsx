jest.mock('../api');
import '@testing-library/jest-dom';

import React from 'react';
import { render, waitFor } from '../utils/test-utils';
import CatalogItemAdmin from './CatalogItemAdmin';
import catalogItemObj from '../__mocks__/catalogItem--disabled.json';
import { CatalogItem } from '@app/types';
import userEvent from '@testing-library/user-event';
import { apiPaths, patchK8sObjectByPath } from '@app/api';
import { BABYLON_DOMAIN } from '@app/util';

const namespaceName = 'fakeNamespace';
const ciName = 'ci-name';

jest.mock('@app/api', () => ({
  ...jest.requireActual('@app/api'),
  fetcher: jest.fn(() => Promise.resolve(catalogItemObj as CatalogItem)),
  patchK8sObjectByPath: jest.fn(),
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ namespace: namespaceName, name: ciName }),
  useRouteMatch: () => ({
    url: `/admin/catalogitems/${namespaceName}/${ciName}`,
    params: { namespace: namespaceName, name: ciName },
  }),
}));
jest.mock('@app/utils/useSession', () => {
  return jest.fn(() => ({
    getSession: () => ({ email: 'test@redhat.com', isAdmin: false, serviceNamespaces: [], workshopNamespaces: [] }),
  }));
});

describe('CatalogItemAdmin Component', () => {
  test('When renders should show the current values', async () => {
    const { getByLabelText, getByText, getByDisplayValue } = render(<CatalogItemAdmin />);
    await waitFor(() => {
      expect(getByLabelText('Disabled').closest('input')).toBeChecked();
      expect(getByText('Under maintenance')).toBeInTheDocument();
      expect(getByDisplayValue('jdoe@redhat.com')).toBeInTheDocument();
    });
  });
  test('When save form API function is called', async () => {
    const mockDate = new Date();
    jest.spyOn(global, 'Date').mockImplementation(() => mockDate as unknown as string);
    const { getByLabelText, getByText } = render(<CatalogItemAdmin />);

    await waitFor(() => {
      expect(getByLabelText('Disabled').closest('input')).toBeChecked();
    });
    await userEvent.click(getByLabelText('Disabled'));
    await userEvent.click(getByText('Under maintenance').closest('button'));
    await userEvent.click(getByText('Operational'));
    const path = apiPaths.CATALOG_ITEM({
      namespace: namespaceName,
      name: ciName,
    });
    const patchObj = {
      status: 'operational',
      identifier: 'jdoe@redhat.com',
      incidentUrl: '',
      lastUpdated: mockDate.toISOString(),
      lastUpdatedBy: 'test@redhat.com',
      comments: [],
    };
    const patch = {
      metadata: {
        annotations: { [`${BABYLON_DOMAIN}/ops`]: JSON.stringify(patchObj) },
        labels: { [`${BABYLON_DOMAIN}/disabled`]: 'false' },
      },
    };
    await userEvent.click(getByText('Save'));
    expect(patchK8sObjectByPath).toHaveBeenCalledWith({ path, patch });
  });
});
