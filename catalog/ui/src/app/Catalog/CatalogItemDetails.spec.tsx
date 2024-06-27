import React from 'react';
import { render, fireEvent, waitFor, generateSession } from '../utils/test-utils';
import { Drawer, DrawerContent, DrawerContentBody } from '@patternfly/react-core';
import CatalogItemDetails from './CatalogItemDetails';
import catalogItemObj from '../__mocks__/catalogItem.json';
import { CatalogItem, ResourceClaim } from '@app/types';

jest.mock('@app/api', () => ({
  ...jest.requireActual('@app/api'),
  fetcherItemsInAllPages: jest.fn(() => Promise.resolve([] as ResourceClaim[])),
}));
jest.mock('@app/utils/useSession', () =>
  jest.fn(() => ({
    getSession: () => generateSession({}),
  })),
);

const catalogItem = catalogItemObj as CatalogItem;

describe('CatalogItemDetails Component', () => {
  test("When renders as a patternfly panelContent, should display 'CatalogItem' properties", async () => {
    const { getByText } = render(
      <Drawer isExpanded={true}>
        <DrawerContent panelContent={<CatalogItemDetails catalogItem={catalogItem} onClose={jest.fn} />}>
          <DrawerContentBody></DrawerContentBody>
        </DrawerContent>
      </Drawer>,
    );

    const catalogItemDisplayName = 'Test Config';
    const providedByText = 'provided by Red Hat';
    const descriptionLabel = 'Description';
    const descriptionText = 'Test empty config which deploys no cloud resources.';
    const categoryLabel = 'Category';
    const categoryText = 'Other';

    await waitFor(() => {
      expect(getByText(catalogItemDisplayName)).toBeInTheDocument();
      expect(getByText(providedByText)).toBeInTheDocument();
      expect(getByText(descriptionLabel).closest('div').textContent).toContain(descriptionText);
      expect(getByText(new RegExp(categoryLabel, 'i')).closest('div').textContent).toContain(categoryText);
    });
  });

  test('When onClose is clicked the onClose function is called', async () => {
    const handleClick = jest.fn();
    const { container, getByText } = render(
      <Drawer isExpanded={true}>
        <DrawerContent panelContent={<CatalogItemDetails catalogItem={catalogItem} onClose={handleClick} />}>
          <DrawerContentBody></DrawerContentBody>
        </DrawerContent>
      </Drawer>,
    );
    const catalogItemDisplayName = 'Test Config';
    await waitFor(() => expect(getByText(catalogItemDisplayName)).toBeInTheDocument());
    const button = container.getElementsByClassName('pf-v5-c-drawer__close')[0].querySelectorAll('button')[0];
    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
