import React from 'react';
import { render, generateSession } from '../utils/test-utils';
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
  })),
);

describe('Catalog Component', () => {
  afterEach(() => {
    window.sessionStorage.clear();
  });
});
