import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Navigation from './Navigation';
import useWhatsNew from '@app/WhatsNew/useWhatsNew';
import useSession from '@app/utils/useSession';

jest.mock('@app/WhatsNew/useWhatsNew', () => ({ __esModule: true, default: jest.fn(() => ({})) }));

jest.mock('@app/utils/useSession', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@app/utils/useInterfaceConfig', () => ({
  __esModule: true,
  default: () => ({ white_glove_enabled: true }),
}));

function renderNavigation(isAdmin: boolean, userInterface = 'rhpds') {
  (useSession as jest.Mock).mockReturnValue({
    getSession: () => ({ isAdmin, userInterface, email: 'nav-user', userNamespace: { name: 'test' } }),
  });
  return render(<MemoryRouter initialEntries={['/whats-new']}><Navigation /></MemoryRouter>);
}

it('places the active What\'s New link between White Glove Requests and Admin', () => {
  renderNavigation(true);
  const link = screen.getByRole('link', { name: "What's New" });
  expect(link).toHaveAttribute('href', '/whats-new');
  expect(link).toHaveClass('pf-m-current');
  expect(link.closest('li').previousElementSibling).toHaveTextContent('White Glove Requests');
  expect(link.closest('li').nextElementSibling).toHaveTextContent('Admin');
});

it('hides What\'s New from non-admins', () => {
  renderNavigation(false);
  expect(screen.queryByRole('link', { name: "What's New" })).not.toBeInTheDocument();
});

it('preserves the partner interface exclusion', () => {
  renderNavigation(true, 'rhdp-partners');
  expect(screen.queryByRole('link', { name: "What's New" })).not.toBeInTheDocument();
});

it('shows the badge and opens the newest page once before returning to the parent', () => {
  localStorage.clear();
  (useWhatsNew as jest.Mock).mockReturnValue({ data: { children: [{
    id: 'latest', createdAt: new Date(Date.now() - 1000).toISOString(),
  }] } });
  renderNavigation(true);
  expect(screen.getByText('New')).toBeInTheDocument();
  const link = screen.getByRole('link', { name: /What's New/ });
  expect(link).toHaveAttribute('href', '/whats-new/latest');
  fireEvent.click(link);
  expect(screen.queryByText('New')).not.toBeInTheDocument();
  expect(link).toHaveAttribute('href', '/whats-new');
  expect(localStorage.getItem('whats-new-read:nav-user')).toBe('latest');
});

describe('catalog item order navigation', () => {
  function renderWithOrders(catalogItemOrdersEnabled: boolean, isAdmin = false, path = '/orders') {
    (useSession as jest.Mock).mockReturnValue({
      getSession: () => ({ isAdmin, userInterface: 'rhpds', email: 'nav-user', userNamespace: { name: 'test' }, catalogItemOrdersEnabled }),
    });
    return render(<MemoryRouter initialEntries={[path]}><Navigation /></MemoryRouter>);
  }

  it('hides Approvals and Order Approvals while the feature is disabled', () => {
    renderWithOrders(false, true);
    expect(screen.queryByRole('link', { name: 'Approvals' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Order Approvals' })).not.toBeInTheDocument();
  });

  it('offers Approvals to every user and highlights My Services for orders', () => {
    renderWithOrders(true);
    expect(screen.getByRole('link', { name: 'Approvals' })).toHaveAttribute('href', '/approvals');
    expect(screen.getByRole('link', { name: 'My Services' })).toHaveClass('pf-m-current');
    expect(screen.queryByRole('link', { name: 'Order Approvals' })).not.toBeInTheDocument();
  });

  it('adds the admin view for administrators', () => {
    renderWithOrders(true, true, '/admin/approvals');
    expect(screen.getByRole('link', { name: 'Order Approvals' })).toHaveAttribute('href', '/admin/approvals');
  });
});
