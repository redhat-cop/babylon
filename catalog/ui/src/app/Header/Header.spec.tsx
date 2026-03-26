import React from 'react';
import { render, screen, waitFor, fireEvent } from '../utils/test-utils';
import userEvent from '@testing-library/user-event';

jest.mock('@app/utils/useSession', () => ({
  __esModule: true,
  default: () => ({
    getSession: () => ({
      isAdmin: false,
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

describe('Header', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('pf-v6-theme-dark');
  });

  afterEach(() => {
    document.documentElement.classList.remove('pf-v6-theme-dark');
  });

  test('renders dark mode toggle button in masthead', () => {
    render(
      <Header isNavOpen={true} isMobileView={false} onNavToggle={jest.fn()} onNavToggleMobile={jest.fn()} />,
    );
    expect(screen.getByLabelText('Toggle dark mode')).toBeInTheDocument();
  });

  test('clicking dark mode toggle adds pf-v6-theme-dark class', async () => {
    render(
      <Header isNavOpen={true} isMobileView={false} onNavToggle={jest.fn()} onNavToggleMobile={jest.fn()} />,
    );
    expect(document.documentElement).not.toHaveClass('pf-v6-theme-dark');
    await userEvent.click(screen.getByLabelText('Toggle dark mode'));
    expect(document.documentElement).toHaveClass('pf-v6-theme-dark');
  });

  test('dark mode toggle persists to localStorage', async () => {
    render(
      <Header isNavOpen={true} isMobileView={false} onNavToggle={jest.fn()} onNavToggleMobile={jest.fn()} />,
    );
    await userEvent.click(screen.getByLabelText('Toggle dark mode'));
    expect(localStorage.getItem('babylon-dark-mode')).toBe('true');
  });

  test('renders user email in toolbar', () => {
    render(
      <Header isNavOpen={true} isMobileView={false} onNavToggle={jest.fn()} onNavToggleMobile={jest.fn()} />,
    );
    expect(screen.getByText('test@redhat.com')).toBeInTheDocument();
  });

  test('renders help menu', () => {
    render(
      <Header isNavOpen={true} isMobileView={false} onNavToggle={jest.fn()} onNavToggleMobile={jest.fn()} />,
    );
    expect(screen.getByLabelText('Help menu')).toBeInTheDocument();
  });
});
