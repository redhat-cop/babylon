import '@testing-library/jest-dom';
import * as React from 'react';
import { render, fireEvent, act, waitFor } from '../utils/test-utils';
import CatalogItemRequestForm from './CatalogItemRequestForm';
import catalogItemObj from '../__mocks__/catalogItem.json';

describe('CatalogItemRequestForm Component', () => {
  test("When renders should display 'CatalogItem' properties and parameters", () => {
    const { getByText } = render(<CatalogItemRequestForm catalogItem={catalogItemObj} onCancel={jest.fn} />);

    const catalogItemDisplayName = 'Request Test Config';
    const sfidLabel = 'Salesforce ID';
    const sfidDescription = 'Salesforce Opportunity ID, Campaign ID, or Partner Registration';
    const purposeLabel = 'Purpose';
    const purposeOption = 'Development - Catalog item creation / maintenance';
    const termsOfServiceLabel = 'IMPORTANT PLEASE READ';
    const termsOfServiceAck = 'I confirm that I understand the above warnings.';

    act(async () => {
      await waitFor(() => expect(getByText(catalogItemDisplayName)).toBeInTheDocument());
      expect(getByText(sfidLabel).closest('.pf-c-form__group').textContent).toContain(sfidDescription);
      expect(getByText(sfidDescription)).not.toBeVisible();
      expect(getByText(purposeLabel).closest('.pf-c-form__group').textContent).toContain(purposeOption);
      expect(getByText(purposeOption)).not.toBeVisible();
      expect(getByText(termsOfServiceLabel).parentElement.textContent).toContain(termsOfServiceAck);
    });
  });

  test('When Cancel button is clicked the onCancel function is called', () => {
    const handleClick = jest.fn();
    const { getByText } = render(<CatalogItemRequestForm catalogItem={catalogItemObj} onCancel={handleClick} />);
    act(async () => {
      const button = await waitFor(() => getByText('Cancel'));
      fireEvent.click(button);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });
});
