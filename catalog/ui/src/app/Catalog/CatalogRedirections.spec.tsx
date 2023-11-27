import React from 'react';
import { render, waitFor, within, generateSession, act } from '../utils/test-utils';
import CatalogRedirections from './CatalogRedirections';
import catalogItemsObj from '../__mocks__/catalogItems.json';
import { CatalogItem } from '@app/types';
import { createMemoryHistory } from 'history';

jest.mock('@app/api', () => ({
  ...jest.requireActual('@app/api'),
  fetcherItemsInAllPages: jest.fn(() => Promise.resolve(catalogItemsObj.items as CatalogItem[])),
}));
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
}));
jest.mock('@app/utils/useSession', () =>
  jest.fn(() => ({
    getSession: () => generateSession({ isAdmin: true }),
  }))
);

describe('Catalog Component', () => {
  afterEach(() => {
    window.sessionStorage.clear();
  });
  test.skip('When rendering the /catalog with a saved filter should redirect', async () => {
    window.sessionStorage.setItem('lastCatalogFilter', 'category=Other');
    const history = createMemoryHistory();
    render(<CatalogRedirections />, { history: history });
    expect(history.location.search).toBe('?category=Other');
  });
  test.skip('When rendering the /catalog with a saved catalogNamespace should redirect', async () => {
    window.sessionStorage.setItem('lastCatalogFilter', 'catalog=babylon-catalog-test');
    const history = createMemoryHistory();
    render(<CatalogRedirections />, { history: history });
    expect(history.location.pathname).toBe('/catalog/babylon-catalog-test');
  });
});
