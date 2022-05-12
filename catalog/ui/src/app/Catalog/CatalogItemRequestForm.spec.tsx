import '@testing-library/jest-dom';
import * as React from 'react';
import { render, fireEvent, waitFor } from '../utils/test-utils';
import CatalogItemRequestForm from './CatalogItemRequestForm';
import catalogItemObj from '../__mocks__/catalogItem.json';
import userEvent from '@testing-library/user-event';

describe('CatalogItemRequestForm Component', () => {
  test("When renders should display 'CatalogItem' properties and parameters", async () => {
    const { getByText, getByLabelText } = render(
      <CatalogItemRequestForm catalogItem={catalogItemObj} onCancel={jest.fn} />
    );

    const catalogItemDisplayName = await waitFor(() => getByText('Request Test Config'));
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

  test('When Cancel button is clicked the onCancel function is called', async () => {
    const handleClick = jest.fn();
    const { getByText } = render(<CatalogItemRequestForm catalogItem={catalogItemObj} onCancel={handleClick} />);
    const button = await waitFor(() => getByText('Cancel'));
    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  test('Submit button disabled until required fields are filled', async () => {
    const { getByText } = render(<CatalogItemRequestForm catalogItem={catalogItemObj} onCancel={jest.fn} />);
    const button = await waitFor(() => getByText('Request'));
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
    const { queryByText, getByLabelText } = render(
      <CatalogItemRequestForm catalogItem={catalogItemObj} onCancel={jest.fn} />
    );

    const sfidLabel = await waitFor(() => getByLabelText('Salesforce ID'));
    const sfidDescriptionText = 'Salesforce Opportunity ID, Campaign ID, or Partner Registration';
    expect(queryByText(sfidDescriptionText)).not.toBeInTheDocument();
    await userEvent.hover(sfidLabel.closest('.pf-c-form__group').querySelector('.tooltip-icon-only'));
    await waitFor(() => expect(queryByText(sfidDescriptionText)).toBeInTheDocument());
  });
});
