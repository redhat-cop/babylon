import React from 'react';
import { render, screen, waitFor } from '../utils/test-utils';
import userEvent from '@testing-library/user-event';

let mockIsAdmin = false;

jest.mock('@app/utils/useSession', () => ({
  __esModule: true,
  default: () => ({
    getSession: () => ({
      isAdmin: mockIsAdmin,
      email: 'test@redhat.com',
      userInterface: 'rhpds',
    }),
  }),
}));

jest.mock('@app/utils/useImpersonateUser', () => ({
  __esModule: true,
  default: () => ({
    clearImpersonation: jest.fn(),
    userImpersonated: null,
  }),
}));

jest.mock('@app/utils/useHelpLink', () => ({
  __esModule: true,
  default: () => 'https://help.example.com',
}));

jest.mock('@app/utils/useInterfaceConfig', () => ({
  __esModule: true,
  default: () => ({
    help_text: 'Help',
    status_page_url: '',
    feedback_link: '',
    learn_more_link: '',
  }),
}));

jest.mock('@app/components/IncidentsNotificationDrawer', () => ({
  __esModule: true,
  default: () => <div data-testid="notification-drawer" />,
}));

import Header from './Header';

const renderHeader = () =>
  render(
    <Header isNavOpen={true} isMobileView={false} onNavToggle={jest.fn()} onNavToggleMobile={jest.fn()} />,
  );

describe('Header', () => {
  beforeEach(() => {
    mockIsAdmin = false;
    localStorage.clear();
    document.documentElement.classList.remove('pf-v6-theme-dark');
  });

  afterEach(() => {
    document.documentElement.classList.remove('pf-v6-theme-dark');
  });

  test('renders user email in toolbar', () => {
    renderHeader();
    expect(screen.getByText('test@redhat.com')).toBeInTheDocument();
  });

  test('renders help menu', () => {
    renderHeader();
    expect(screen.getByLabelText('Help menu')).toBeInTheDocument();
  });

  describe('Dark mode (admin-only beta)', () => {
    test('dark mode toggle is hidden for non-admin users', () => {
      mockIsAdmin = false;
      renderHeader();
      expect(screen.queryByLabelText('Toggle dark mode (beta)')).not.toBeInTheDocument();
    });

    test('dark mode toggle is visible for admin users', () => {
      mockIsAdmin = true;
      renderHeader();
      expect(screen.getByLabelText('Toggle dark mode (beta)')).toBeInTheDocument();
    });

    test('clicking dark mode toggle adds pf-v6-theme-dark class', async () => {
      mockIsAdmin = true;
      renderHeader();
      expect(document.documentElement).not.toHaveClass('pf-v6-theme-dark');
      await userEvent.click(screen.getByLabelText('Toggle dark mode (beta)'));
      expect(document.documentElement).toHaveClass('pf-v6-theme-dark');
    });

    test('dark mode toggle persists to localStorage', async () => {
      mockIsAdmin = true;
      renderHeader();
      await userEvent.click(screen.getByLabelText('Toggle dark mode (beta)'));
      expect(localStorage.getItem('babylon-dark-mode')).toBe('true');
    });

    test('dark mode is disabled for non-admin even if localStorage has it', async () => {
      localStorage.setItem('babylon-dark-mode', 'true');
      mockIsAdmin = false;
      renderHeader();
      await waitFor(() => {
        expect(document.documentElement).not.toHaveClass('pf-v6-theme-dark');
      });
    });
  });
});
