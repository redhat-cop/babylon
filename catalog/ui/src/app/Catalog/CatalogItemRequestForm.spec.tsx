import '@testing-library/jest-dom';
import * as React from 'react';
import { render, fireEvent, act, waitFor, prettyDOM } from '../utils/test-utils';
import CatalogItemRequestForm from './CatalogItemRequestForm';
import catalogItemObj from '../__mocks__/catalogItem.json';

describe('CatalogItemRequestForm Component', () => {
  test("When renders should display 'CatalogItem' properties and parameters", async () => {
    const { getByText } = render(<CatalogItemRequestForm catalogItem={catalogItemObj} onCancel={jest.fn} />);

    await act(async () => {
      const catalogItemDisplayName = await waitFor(() => getByText('Request Test Config'));
      const sfidLabel = getByText('Salesforce ID');
      const purposeLabel = getByText('Purpose');
      const purposePlaceholder = '- Select Purpose -';
      const termsOfServiceLabel = getByText('IMPORTANT PLEASE READ');
      const termsOfServiceAck = 'I confirm that I understand the above warnings.';

      expect(catalogItemDisplayName).toBeInTheDocument();
      expect(sfidLabel).toBeInTheDocument();
      expect(purposeLabel.closest('.pf-c-form__group').textContent).toContain(purposePlaceholder);
      expect(termsOfServiceLabel.closest('.catalog-terms-of-service').textContent).toContain(termsOfServiceAck);
    });
  });

  test('When Cancel button is clicked the onCancel function is called', async () => {
    const handleClick = jest.fn();
    const { getByText } = render(<CatalogItemRequestForm catalogItem={catalogItemObj} onCancel={handleClick} />);
    await act(async () => {
      const button = await waitFor(() => getByText('Cancel'));
      fireEvent.click(button);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  test('Submit button disabled until required fields are filled', async () => {
    const { getByText, findByText } = render(
      <CatalogItemRequestForm catalogItem={catalogItemObj} onCancel={jest.fn} />
    );
    await act(async () => {
      const button = await waitFor(() => getByText('Request'));
      expect(button).toBeDisabled();

      const termsOfServiceAck = getByText(
        'I confirm that I understand the above warnings.'
      ).parentElement.querySelector('input[type="checkbox"]');
      expect(termsOfServiceAck).not.toBeChecked();
      fireEvent.click(termsOfServiceAck);
      expect(termsOfServiceAck).toBeChecked();
      expect(button).toBeDisabled();

      const purposePlaceholder = getByText('- Select Purpose -');
      //console.log(prettyDOM(getByText('tancat')));
      fireEvent.click(purposePlaceholder.closest('button'));
      //console.log(prettyDOM(getByText('obert')));
      // await waitFor(() => getByText('Development - Catalog item creation / maintenance'));
      /*const purposeOption = getByText('Development - Catalog item creation / maintenance');
      fireEvent.click(purposeOption.closest('button'));
      expect(button).toBeEnabled();*/
    });
  });

  /*test('Description should be visible when hovering', async () => {
    const { getByText, queryByText } = render(
      <CatalogItemRequestForm catalogItem={catalogItemObj} onCancel={jest.fn} />
    );

    await act(async () => {
      const sfidLabel = await waitFor(() => getByText('Salesforce ID'));
      const sfidIcon = sfidLabel.closest('.pf-c-form__group').querySelector('.tooltip-icon-only');
      prettyDOM(sfidIcon);
      const sfidDescriptionText = 'Salesforce Opportunity ID, Campaign ID, or Partner Registration';
      expect(queryByText(sfidDescriptionText)).not.toBeInTheDocument();
      fireEvent.mouseOver(sfidIcon);
      await waitFor(() => {
        expect(queryByText(sfidDescriptionText)).toBeVisible();
      });
    });
  });*/
});
