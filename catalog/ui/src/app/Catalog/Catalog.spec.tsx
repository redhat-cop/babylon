import '@testing-library/jest-dom';
import * as React from 'react';
import { render, waitFor, fireEvent } from '../utils/test-utils';
import { within } from '@testing-library/dom';
import Catalog from './Catalog';
import catalogItemsObj from '../__mocks__/catalogItems.json';
import { CatalogItemList, CatalogNamespace } from '@app/types';
import { createMemoryHistory } from 'history';

jest.mock('@app/api', () => {
  return {
    listCatalogItems: jest.fn(() => Promise.resolve(catalogItemsObj as CatalogItemList)),
  };
});
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'), // use actual for all non-hook parts
  useParams: () => ({ namespace: 'fakeNamespace' }),
  useRouteMatch: () => ({ url: '/catalog/fakeNamespace', params: { namespace: 'fakeNamespace' } }),
}));
jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useSelector: jest.fn().mockReturnValue([
    {
      name: 'fakeNamespace',
      description: 'fakeNamespace description',
      displayName: 'fakeNamespace',
    } as CatalogNamespace,
  ]),
}));

describe('Catalog Component', () => {
  afterEach(() => {
    window.sessionStorage.clear();
  });
  test('When renders should display the total count of catalog items', async () => {
    const { getByText } = render(<Catalog />);
    await waitFor(() => expect(getByText('12 items')).toBeInTheDocument());
  });
  test('When filtering should save the selection in sessionStorage', async () => {
    const setItemSpy = jest.spyOn(Object.getPrototypeOf(window.sessionStorage), 'setItem');
    const history = createMemoryHistory();
    const { container } = render(<Catalog />, { history: history });
    const withinCategorySelector = within(container.querySelector('.catalog-category-selector'));
    await waitFor(() => expect(withinCategorySelector.getByText('Other')).toBeInTheDocument());
    fireEvent.click(withinCategorySelector.getByText('Other').closest('button'));
    expect(setItemSpy).toBeCalledWith('lastCatalogFilter', 'category=Other');
    await waitFor(() =>
      expect(withinCategorySelector.getByText('Other').closest('button').getAttribute('aria-selected')).toBe('true')
    );
    expect(history.location.search).toBe('?category=Other');
  });
  test('When rendering the /catalog with a saved filter should redirect', async () => {
    window.sessionStorage.setItem('lastCatalogFilter', 'category=Other');
    const history = createMemoryHistory();
    const { container } = render(<Catalog />, { history: history });
    const withinCategorySelector = within(container.querySelector('.catalog-category-selector'));
    await waitFor(() =>
      expect(withinCategorySelector.getByText('Other').closest('button').getAttribute('aria-selected')).toBe('true')
    );
    expect(history.location.search).toBe('?category=Other');
  });
});
