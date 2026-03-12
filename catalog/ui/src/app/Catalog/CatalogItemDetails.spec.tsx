import React from 'react';
import { render, fireEvent, waitFor, generateSession } from '../utils/test-utils';
import { Drawer, DrawerContent, DrawerContentBody } from '@patternfly/react-core';
import CatalogItemDetails from './CatalogItemDetails';
import catalogItemObj from '../__mocks__/catalogItem.json';
import { CatalogItem, ResourceClaim } from '@app/types';

jest.mock('@app/api', () => ({
  ...jest.requireActual('@app/api'),
  silentFetcher: () => Promise.resolve(null),
  fetcherItemsInAllPages: jest.fn(() => Promise.resolve([] as ResourceClaim[])),
}));
jest.mock('@app/utils/useSession', () =>
  jest.fn(() => ({
    getSession: () => generateSession({}),
  })),
);
const mockUseServiceQuota = jest.fn(() => ({
  standaloneServicesCount: 0,
  workshopsCount: 0,
  currentServicesCount: 0,
  isQuotaExceeded: false,
  quotaLimit: 5,
  isLoading: false,
}));
jest.mock('@app/utils/useServiceQuota', () => {
  return () => mockUseServiceQuota();
});

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
    const button = container.getElementsByClassName('pf-v6-c-drawer__close')[0].querySelectorAll('button')[0];
    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  describe('Service Quota', () => {
    beforeEach(() => {
      mockUseServiceQuota.mockReset();
    });

    test('Order button should be disabled when quota is exceeded', async () => {
      mockUseServiceQuota.mockReturnValue({
        standaloneServicesCount: 3,
        workshopsCount: 2,
        currentServicesCount: 5,
        isQuotaExceeded: true,
        quotaLimit: 5,
        isLoading: false,
      });

      const { getByRole } = render(
        <Drawer isExpanded={true}>
          <DrawerContent panelContent={<CatalogItemDetails catalogItem={catalogItem} onClose={jest.fn} />}>
            <DrawerContentBody></DrawerContentBody>
          </DrawerContent>
        </Drawer>,
      );

      await waitFor(() => {
        const orderButton = getByRole('button', { name: /Order/i });
        expect(orderButton).toBeDisabled();
      });
    });

    test('Quota exceeded message should be displayed when quota is exceeded', async () => {
      mockUseServiceQuota.mockReturnValue({
        standaloneServicesCount: 3,
        workshopsCount: 2,
        currentServicesCount: 5,
        isQuotaExceeded: true,
        quotaLimit: 5,
        isLoading: false,
      });

      const { getByText } = render(
        <Drawer isExpanded={true}>
          <DrawerContent panelContent={<CatalogItemDetails catalogItem={catalogItem} onClose={jest.fn} />}>
            <DrawerContentBody></DrawerContentBody>
          </DrawerContent>
        </Drawer>,
      );

      await waitFor(() => {
        expect(getByText(/You have reached your quota of 5 services/)).toBeInTheDocument();
        expect(getByText(/3 standalone service/)).toBeInTheDocument();
        expect(getByText(/2 workshops/)).toBeInTheDocument();
      });
    });

    test('Order button should be enabled when quota is not exceeded', async () => {
      mockUseServiceQuota.mockReturnValue({
        standaloneServicesCount: 2,
        workshopsCount: 1,
        currentServicesCount: 3,
        isQuotaExceeded: false,
        quotaLimit: 5,
        isLoading: false,
      });

      const { getByRole, queryByText } = render(
        <Drawer isExpanded={true}>
          <DrawerContent panelContent={<CatalogItemDetails catalogItem={catalogItem} onClose={jest.fn} />}>
            <DrawerContentBody></DrawerContentBody>
          </DrawerContent>
        </Drawer>,
      );

      await waitFor(() => {
        const orderButton = getByRole('button', { name: /Order/i });
        expect(orderButton).toBeEnabled();
        expect(queryByText(/You have reached your quota of 5 services/)).not.toBeInTheDocument();
      });
    });
  });
});
