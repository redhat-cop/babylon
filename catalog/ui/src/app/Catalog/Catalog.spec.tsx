import React from 'react';
import { render, waitFor, fireEvent, generateSession } from '../utils/test-utils';
import Catalog, { filterCatalogItemByLabels } from './Catalog';
import { BABYLON_DOMAIN } from '@app/util';
import catalogItemsObj from '../__mocks__/catalogItems.json';
import type { CatalogItem } from '@app/types';

jest.mock('@app/api', () => ({
  ...jest.requireActual('@app/api'),
  fetcherItemsInAllPages: jest.fn(() => Promise.resolve(catalogItemsObj.items as CatalogItem[])),
}));
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ namespace: 'babylon-catalog-test' }),
}));
jest.mock('@app/utils/useSession', () =>
  jest.fn(() => ({
    getSession: () => generateSession({ isAdmin: true }),
  })),
);
jest.mock('@app/utils/useServiceQuota', () => {
  return jest.fn(() => ({
    standaloneServicesCount: 0,
    workshopsCount: 0,
    currentServicesCount: 0,
    isQuotaExceeded: false,
    quotaLimit: 5,
    isLoading: false,
  }));
});

describe('Catalog Component', () => {
  afterEach(() => {
    window.sessionStorage.clear();
  });
  test.skip('When renders should display the total count of catalog items', async () => {
    const { getByText } = await render(<Catalog userHasRequiredPropertiesToAccess={true} />);
    await waitFor(() => expect(getByText('12 items')).toBeInTheDocument());
  });
  it.skip('should export the CSV', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const link: any = {
      click: jest.fn(),
      setAttribute: jest.fn(),
      style: {},
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blob: any = new Blob(['hello world'], { type: 'text/plain' });

    const { getByLabelText, getByText } = await render(<Catalog userHasRequiredPropertiesToAccess={true} />);
    await waitFor(() => expect(getByText('12 items')).toBeInTheDocument());

    global.URL.createObjectURL = jest.fn(() => blob);
    jest.spyOn(document, 'createElement').mockReturnValueOnce(link);
    jest.spyOn(document.body, 'appendChild').mockReturnValueOnce(null);

    fireEvent.click(getByLabelText('Export to CSV', { selector: 'button' }));
    await new Promise((r) => setTimeout(r, 1000)); // wait for async function

    expect(link.setAttribute).toHaveBeenNthCalledWith(1, 'href', blob);
    expect(link.setAttribute).toHaveBeenNthCalledWith(2, 'download', 'demo-redhat-catalog.csv');
    expect(link.click).toHaveBeenCalledTimes(1);
  });
});

describe('Technical Decision Point filtering', () => {
  const item = (labels: Record<string, string>) => ({
    ...catalogItemsObj.items[0],
    metadata: { ...catalogItemsObj.items[0].metadata, labels },
  }) as CatalogItem;

  test.each(['TDP1', 'TDP2', 'tdp1'])('matches a value in %s case-insensitively', (label) => {
    expect(filterCatalogItemByLabels(item({ [`${BABYLON_DOMAIN}/${label}`]: 'Edge_computing' }), {
      technical_decision_point: ['edge_computing'],
    })).toBe(true);
  });

  test('matches any selected value in either label while requiring other filters', () => {
    const catalogItem = item({
      [`${BABYLON_DOMAIN}/TDP1`]: 'Automation',
      [`${BABYLON_DOMAIN}/TDP2`]: 'AI_Platform',
      [`${BABYLON_DOMAIN}/Product`]: 'RHEL',
    });
    expect(filterCatalogItemByLabels(catalogItem, {
      technical_decision_point: ['virtualization', 'ai_platform'], product: ['rhel'],
    })).toBe(true);
    expect(filterCatalogItemByLabels(catalogItem, {
      technical_decision_point: ['automation'], product: ['other'],
    })).toBe(false);
    expect(filterCatalogItemByLabels(catalogItem, { technical_decision_point: ['other'] })).toBe(false);
    expect(filterCatalogItemByLabels(item({}), { technical_decision_point: ['automation'] })).toBe(false);
    expect(filterCatalogItemByLabels(item({}), {})).toBe(true);
  });
});
