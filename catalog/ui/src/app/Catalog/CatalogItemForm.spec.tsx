import '@testing-library/jest-dom';
import React from 'react';
import { render, fireEvent, waitFor } from '../utils/test-utils';
import CatalogItemForm from './CatalogItemForm';
import catalogItemObj from '../__mocks__/catalogItem.json';
import userEvent from '@testing-library/user-event';
import { CatalogItem } from '@app/types';

jest.mock('@app/api', () => ({
  ...jest.requireActual('@app/api'),
  fetcher: jest.fn(() => Promise.resolve(catalogItemObj as CatalogItem)),
}));
const mockGoBack = jest.fn();
const mockPush = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ namespace: 'fakeNamespace', catalogItem: 'fakeCatalogItem' }),
  useRouteMatch: () => ({
    url: '/catalog/fakeNamespace/order/fakeCatalogItem',
    params: { namespace: 'fakeNamespace', catalogItem: 'fakeCatalogItem' },
  }),
  useHistory: () => ({
    goBack: mockGoBack,
    push: mockPush,
  }),
}));

describe('CatalogItemForm Component', () => {
  test("When renders should display 'CatalogItem' properties and parameters", async () => {
    const { getByText, getByLabelText } = render(<CatalogItemForm />);

    const catalogItemDisplayName = await waitFor(() => getByText('Order Test Config'));
    const sfidLabel = getByLabelText('Salesforce ID');
    const purposeLabel = getByText('Purpose');
    const purposePlaceholder = '- Select Purpose -';
    const termsOfServiceLabel = getByText('IMPORTANT PLEASE READ');
    const termsOfServiceAck = 'I confirm that I understand the above warnings.';

    expect(catalogItemDisplayName).toBeInTheDocument();
    expect(sfidLabel).toBeInTheDocument();
    expect(purposeLabel.closest('.pf-c-form__group').textContent).toContain(purposePlaceholder);
    expect(termsOfServiceLabel.closest('.catalog-terms-of-service').textContent).toContain(termsOfServiceAck);
  });

  test('When Cancel button is clicked the history goBack function is called', async () => {
    const { getByText } = render(<CatalogItemForm />);
    const button = await waitFor(() => getByText('Cancel'));
    fireEvent.click(button);
    expect(mockGoBack).toHaveBeenCalled();
  });

  test('Submit button disabled until required fields are filled', async () => {
    const { getByText } = render(<CatalogItemForm />);
    const button = await waitFor(() => getByText('Order'));
    expect(button).toBeDisabled();

    const termsOfServiceAck = getByText('I confirm that I understand the above warnings.').parentElement.querySelector(
      'input[type="checkbox"]'
    );
    expect(termsOfServiceAck).not.toBeChecked();
    fireEvent.click(termsOfServiceAck);
    expect(termsOfServiceAck).toBeChecked();
    expect(button).toBeDisabled();

    await userEvent.click(getByText('- Select Purpose -').closest('button'));
    await userEvent.click(getByText('Development - Catalog item creation / maintenance'));
    expect(button).toBeEnabled();
  });

  test('Description should be visible when hovering', async () => {
    const { queryByText, getByLabelText } = render(<CatalogItemForm />);

    const sfidLabel = await waitFor(() => getByLabelText('Salesforce ID'));
    const sfidDescriptionText = 'Salesforce Opportunity ID, Campaign ID, or Partner Registration';
    expect(queryByText(sfidDescriptionText)).not.toBeInTheDocument();
    await userEvent.hover(sfidLabel.closest('.pf-c-form__group').querySelector('.tooltip-icon-only'));
    await waitFor(() => expect(queryByText(sfidDescriptionText)).toBeInTheDocument());
  });
});
