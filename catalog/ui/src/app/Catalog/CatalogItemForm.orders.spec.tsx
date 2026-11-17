import React from 'react';
import userEvent from '@testing-library/user-event';
import { SWRConfig } from 'swr';
import { fetcher } from '@app/api';
import { render, fireEvent, waitFor, generateSession } from '../utils/test-utils';
import CatalogItemForm from './CatalogItemForm';
import catalogItemObj from '../__mocks__/catalogItem.json';
import type { CatalogItem, ServiceNamespace, UserNamespace } from '@app/types';
import { OrderApiError, submitCatalogItemOrder } from '@app/CatalogItemOrders/catalog-item-order-api';

// Catalog item orders (GPTEINFRA-18190): the form submits a CatalogItemOrder and never
// calls the direct resource creation helpers, except for external URL and white glove orders.

jest.mock('@app/api', () => ({
  ...jest.requireActual('@app/api'),
  silentFetcher: () => Promise.resolve(null),
  fetcher: jest.fn(() => Promise.resolve(catalogItemObj as CatalogItem)),
  createServiceRequest: jest.fn(),
  createWorkshop: jest.fn(),
  createWorkshopProvision: jest.fn(),
  createSelfPacedLab: jest.fn(),
  createSelfPacedLabProvisionItem: jest.fn(),
  patchWhiteGloveRequest: jest.fn(),
  addJiraComment: jest.fn(),
  updateJiraLabels: jest.fn(),
  saveExternalItemRequest: jest.fn(() => Promise.resolve(null)),
}));

jest.mock('@app/CatalogItemOrders/catalog-item-order-api', () => ({
  ...jest.requireActual('@app/CatalogItemOrders/catalog-item-order-api'),
  submitCatalogItemOrder: jest.fn(),
}));

jest.mock('@app/components/ResourcePoolSelector', () => () => <div data-testid="resource-pool-selector" />);

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ namespace: 'babylon-catalog-test', name: 'tests.test-empty-config.prod' }),
  useNavigate: () => mockNavigate,
}));

const namespace = { displayName: 'User test-redhat.com', name: 'user-test-redhat-com', requester: 'test-redhat.com' };
let mockIsImpersonating = false;
jest.mock('@app/utils/useSession', () =>
  jest.fn(() => ({
    getSession: () =>
      generateSession({
        serviceNamespaces: [namespace as ServiceNamespace],
        userNamespace: namespace as UserNamespace,
        groups: ['rhpds-devs'],
        isAdmin: false,
        isImpersonating: mockIsImpersonating,
      }),
  })),
);
jest.mock('@app/utils/useInterfaceConfig', () => jest.fn(() => ({ sfdc_enabled: true })));
jest.mock('@app/utils/useHelpLink', () => jest.fn(() => 'https://red.ht/open-support'));
jest.mock('@app/utils/useServiceQuota', () => () => ({
  standaloneServicesCount: 0,
  workshopsCount: 0,
  currentServicesCount: 0,
  isQuotaExceeded: false,
  quotaLimit: 5,
  isLoading: false,
}));

const api = jest.requireMock('@app/api');

// A fresh SWR cache per render, so a catalog item cached by one test does not leak into the next.
const Form = () => (
  <SWRConfig value={{ provider: () => new Map() }}>
    <CatalogItemForm />
  </SWRConfig>
);
const submit = jest.mocked(submitCatalogItemOrder);

async function fillRequiredFields(utils: Awaited<ReturnType<typeof render>>) {
  const { getByText, getByLabelText, getByRole } = utils;
  const button = await waitFor(() => getByRole('button', { name: 'Order' }));
  fireEvent.click(
    getByText('I confirm that I understand the above warnings.').parentElement.querySelector('input[type="checkbox"]'),
  );
  await userEvent.click(getByLabelText('Asset Development'));
  await userEvent.click(getByText('- Select purpose -').closest('button'));
  await userEvent.click(getByText('Other'));
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

describe('CatalogItemForm with catalog item orders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsImpersonating = false;
    jest.mocked(fetcher).mockImplementation(async () => catalogItemObj);
  });

  test('submits one CatalogItemOrder and opens the order page without creating resources directly', async () => {
    submit.mockResolvedValue({ namespace: 'user-test-redhat-com', name: 'order-abc' } as never);
    const utils = await render(<Form />);
    const button = await fillRequiredFields(utils);

    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/orders/user-test-redhat-com/order-abc'));
    expect(submit).toHaveBeenCalledTimes(1);
    const body = submit.mock.calls[0][0];
    expect(body).toMatchObject({
      catalogItem: { namespace: 'babylon-catalog-test', name: 'tests.test-empty-config.prod' },
      namespace: 'user-test-redhat-com',
      orderType: 'service',
      activity: 'Asset Development',
    });
    expect(body.idempotencyKey).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
    for (const reserved of ['purpose', 'purpose_activity', 'purpose_explanation', 'salesforce_id']) {
      expect(body.parameters || {}).not.toHaveProperty(reserved);
    }
    // Defaults kept: the API applies runtime and lifespan when provisioning starts.
    expect(body.schedule).toBeUndefined();
    for (const helper of ['createServiceRequest', 'createWorkshop', 'createWorkshopProvision', 'createSelfPacedLab']) {
      expect(api[helper]).not.toHaveBeenCalled();
    }
    expect(api.addJiraComment).not.toHaveBeenCalled();
    expect(api.patchWhiteGloveRequest).not.toHaveBeenCalled();
  });

  test('after an ambiguous failure, ordering again reuses the same idempotency key', async () => {
    submit
      .mockRejectedValueOnce(new OrderApiError(0, 'network_error', 'The catalog could not be reached.'))
      .mockResolvedValueOnce({ namespace: 'user-test-redhat-com', name: 'order-abc' } as never);
    const utils = await render(<Form />);
    const button = await fillRequiredFields(utils);

    fireEvent.click(button);
    expect(await utils.findByText(/Ordering again is safe/)).toBeInTheDocument();
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/orders/user-test-redhat-com/order-abc'));
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1][0].idempotencyKey).toBe(submit.mock.calls[0][0].idempotencyKey);
  });

  test('shows the specific backend error instead of treating every 403 as a disabled account', async () => {
    submit.mockRejectedValue(
      new OrderApiError(403, 'namespace_forbidden', 'You cannot create selfpacedlabs in user-test-redhat-com'),
    );
    const utils = await render(<Form />);
    fireEvent.click(await fillRequiredFields(utils));

    expect(await utils.findByText('You cannot create selfpacedlabs in user-test-redhat-com')).toBeInTheDocument();
    expect(utils.getByText('Your order was not submitted')).toBeInTheDocument();
    expect(utils.queryByText('Account Access Restricted')).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('external URL items keep the direct flow: nothing is provisioned and no order is submitted', async () => {
    jest.mocked(fetcher).mockImplementation(async () => ({
      ...catalogItemObj,
      spec: { ...catalogItemObj.spec, externalUrl: 'https://example.com/lab' },
    }));
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    try {
      const utils = await render(<Form />);
      fireEvent.click(await fillRequiredFields(utils));
      await waitFor(() => expect(open).toHaveBeenCalledWith('https://example.com/lab', '_blank'));
      expect(api.saveExternalItemRequest).toHaveBeenCalledTimes(1);
      expect(submit).not.toHaveBeenCalled();
      expect(api.createServiceRequest).not.toHaveBeenCalled();
    } finally {
      open.mockRestore();
    }
  });

  test('orders cannot be placed while impersonating', async () => {
    mockIsImpersonating = true;
    const { findByText, getByRole } = await render(<Form />);
    expect(await findByText(/while impersonating another user/)).toBeInTheDocument();
    expect(getByRole('button', { name: 'Order' })).toBeDisabled();
  });
});
