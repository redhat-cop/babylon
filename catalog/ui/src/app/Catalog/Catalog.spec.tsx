import React from 'react';
import { render, waitFor, fireEvent, within, generateSession } from '../utils/test-utils';
import Catalog from './Catalog';
import catalogItemsObj from '../__mocks__/catalogItems.json';
import { CatalogItem } from '@app/types';
import { createMemoryHistory } from 'history';

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

describe('Catalog Component', () => {
  afterEach(() => {
    window.sessionStorage.clear();
  });
  test('When renders should display the total count of catalog items', async () => {
    const { getByText } = render(<Catalog userHasRequiredPropertiesToAccess={true} />);
    await waitFor(() => expect(getByText('12 items')).toBeInTheDocument());
  });
  test('When filtering should save the selection in sessionStorage', async () => {
    const setItemSpy = jest.spyOn(Object.getPrototypeOf(window.sessionStorage), 'setItem');
    const history = createMemoryHistory();
    const { container } = render(<Catalog userHasRequiredPropertiesToAccess={true} />, { history: history });
    const withinCategorySelector = within(container.querySelector('.catalog-category-selector'));
    await waitFor(() => expect(withinCategorySelector.getByText('Other')).toBeInTheDocument());
    fireEvent.click(withinCategorySelector.getByText('Other').closest('button'));
    expect(setItemSpy).toBeCalledWith('lastCatalogFilter', 'category=Other&catalog=babylon-catalog-test');
    await waitFor(() =>
      expect(withinCategorySelector.getByText('Other').closest('button').getAttribute('aria-selected')).toBe('true'),
    );
    expect(history.location.search).toBe('?category=Other');
  });
  it('should export the CSV', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const link: any = {
      click: jest.fn(),
      setAttribute: jest.fn(),
      style: {},
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blob: any = new Blob(['hello world'], { type: 'text/plain' });

    const { getByLabelText, getByText } = render(<Catalog userHasRequiredPropertiesToAccess={true} />);
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
