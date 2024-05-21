import React from 'react';
import { render, fireEvent, waitFor, generateSession } from '../utils/test-utils';
import CatalogItemForm from './CatalogItemForm';
import catalogItemObj from '../__mocks__/catalogItem.json';
import userEvent from '@testing-library/user-event';
import { CatalogItem, ServiceNamespace, UserNamespace } from '@app/types';
import useSession from '@app/utils/useSession';
import useHelpLink from '@app/utils/useHelpLink';

jest.mock('@app/api', () => ({
  ...jest.requireActual('@app/api'),
  fetcher: () => Promise.resolve(catalogItemObj as CatalogItem),
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ namespace: 'babylon-catalog-test', name: 'tests.test-empty-config.prod' }),
  useNavigate: () => mockNavigate,
}));

const namespace = {
  displayName: 'User test-redhat.com',
  name: 'user-test-redhat-com',
  requester: 'test-redhat.com',
};
jest.mock('@app/utils/useSession', () =>
  jest.fn(() => ({
    getSession: () =>
      generateSession({
        serviceNamespaces: [namespace as ServiceNamespace],
        userNamespace: namespace as UserNamespace,
        groups: ['rhpds-devs', 'rhpds-admins'],
      }),
  }))
);
jest.mock('@app/utils/useHelpLink', () => {
  return jest.fn(() => 'https://red.ht/open-support');
});

describe('CatalogItemForm Component', () => {
  test("When renders should display 'CatalogItem' properties and parameters", async () => {
    const { getByText, getByLabelText } = render(<CatalogItemForm />);
    const catalogItemDisplayName = await waitFor(() => getByText('Order Test Config'));
    const sfidLabel = getByLabelText('Salesforce ID (Opportunity ID, Campaign ID, CDH Party or Project ID)');
    const purposeLabel = getByText('Purpose');
    const purposePlaceholder = '- Select purpose -';
    const termsOfServiceLabel = getByText('IMPORTANT PLEASE READ');
    const termsOfServiceAck = 'I confirm that I understand the above warnings.';

    expect(catalogItemDisplayName).toBeInTheDocument();
    expect(sfidLabel).toBeInTheDocument();
    expect(purposeLabel.closest('.pf-c-form__group').textContent).toContain(purposePlaceholder);
    expect(termsOfServiceLabel.closest('.terms-of-service').textContent).toContain(termsOfServiceAck);
  });

  test('When Cancel button is clicked the history goBack function is called', async () => {
    const { getByText } = render(<CatalogItemForm />);
    const button = await waitFor(() => getByText('Cancel'));
    fireEvent.click(button);
    expect(mockNavigate).toHaveBeenCalled();
  });

  test('Submit button disabled until required fields are filled', async () => {
    const { getByText, getByLabelText, getByRole } = render(<CatalogItemForm />);
    const button = await waitFor(() =>
      getByRole('button', {
        name: /Order/i,
      })
    );
    expect(button).toBeDisabled();

    const termsOfServiceAck = getByText('I confirm that I understand the above warnings.').parentElement.querySelector(
      'input[type="checkbox"]'
    );
    expect(termsOfServiceAck).not.toBeChecked();
    fireEvent.click(termsOfServiceAck);
    expect(termsOfServiceAck).toBeChecked();
    expect(button).toBeDisabled();

    await userEvent.click(getByLabelText('Asset Development'));
    await userEvent.click(getByText('- Select purpose -').closest('button'));
    await userEvent.click(getByText('Other'));
    expect(button).toBeEnabled();
  });

  test('Description should be visible when hovering', async () => {
    const { queryByText, getByLabelText } = render(<CatalogItemForm />);

    const sfidLabel = await waitFor(() =>
      getByLabelText('Salesforce ID (Opportunity ID, Campaign ID, CDH Party or Project ID)')
    );
    const sfidTypeDescriptionText = 'Salesforce ID type: Opportunity ID, Campaign ID, CDH Party or Project ID.';
    expect(queryByText(sfidTypeDescriptionText)).not.toBeInTheDocument();
    await userEvent.hover(sfidLabel.closest('.pf-c-form__group').querySelector('.tooltip-icon-only'));
    await waitFor(() => expect(queryByText(sfidTypeDescriptionText)).toBeInTheDocument());
  });

  test('Enabling Workshop switch should display form', async () => {
    const { getByText, queryByText, getByLabelText } = render(<CatalogItemForm />);
    const switchBtn = await waitFor(() => getByLabelText('Enable workshop user interface'));

    const workshopItemDisplayName = 'Test Config';
    expect(queryByText('Display Name')).not.toBeInTheDocument();
    expect(queryByText('Password')).not.toBeInTheDocument();
    expect(queryByText('User Registration')).not.toBeInTheDocument();
    expect(queryByText('Description')).not.toBeInTheDocument();

    await userEvent.click(switchBtn);

    const input: HTMLInputElement = getByText('Display Name')
      .closest('.pf-c-form__group')
      .querySelector('input[type="text"]');
    expect(getByText('Display Name')).toBeInTheDocument();
    expect(input.value).toContain(workshopItemDisplayName);
    expect(getByText('Password')).toBeInTheDocument();
    expect(getByText('User Registration')).toBeInTheDocument();
    expect(getByText('Description')).toBeInTheDocument();
  });

  test('Workshop Title is required', async () => {
    const { getByText, getByLabelText, getByRole } = render(<CatalogItemForm />);
    const button = await waitFor(() =>
      getByRole('button', {
        name: /Order/i,
      })
    );

    expect(button).toBeDisabled();

    const termsOfServiceAck = getByText('I confirm that I understand the above warnings.').parentElement.querySelector(
      'input[type="checkbox"]'
    );

    fireEvent.click(termsOfServiceAck);
    await userEvent.click(getByLabelText('Asset Development'));
    await userEvent.click(getByText('- Select purpose -').closest('button'));
    await userEvent.click(getByText('Other'));
    await userEvent.click(getByLabelText('Enable workshop user interface'));

    expect(termsOfServiceAck).toBeChecked();
    expect(getByLabelText('Enable workshop user interface')).toBeChecked();
    expect(button).toBeEnabled();

    const input: HTMLInputElement = getByText('Display Name')
      .closest('.pf-c-form__group')
      .querySelector('input[type="text"]');
    await userEvent.clear(input);

    expect(button).toBeDisabled();
  });
});
