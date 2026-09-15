import React from 'react';
import { render, waitFor, screen, fireEvent } from '@app/utils/test-utils';
import { createMemoryHistory } from 'history';
import MultiWorkshopCreate from './MultiWorkshopCreate';

const mockSession = {
  authUser: 'test-user',
  email: 'test@redhat.com',
  fullName: 'Test User',
  isAdmin: false,
  groups: [],
  roles: [],
  catalogNamespaces: [{ name: 'fake.catalog', displayName: 'Fake Catalog', description: '' }],
  consoleUrl: '',
  userInterface: '',
  serviceNamespaces: [{ displayName: 'User test', name: 'user-test-redhat-com', requester: 'test-redhat.com' }],
  userNamespace: { displayName: 'User test', name: 'user-test-redhat-com', requester: 'test-redhat.com' },
};

let currentSession = { ...mockSession };

jest.mock('@app/utils/useSession', () => ({
  __esModule: true,
  default: () => ({ getSession: () => currentSession }),
}));

jest.mock('@app/utils/useServiceQuota', () => ({
  __esModule: true,
  default: () => ({
    standaloneServicesCount: 2,
    workshopsCount: 1,
    currentServicesCount: 3,
    quotaLimit: 10,
  }),
}));

jest.mock('@app/utils/useHelpLink', () => ({
  __esModule: true,
  default: () => 'https://help.example.com',
}));

jest.mock('@app/utils/useSystemStatus', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    isWorkshopOrderingBlocked: false,
    workshopOrderingBlockedMessage: '',
    wgBlockedDates: [],
  })),
}));

jest.mock('@app/api', () => ({
  ...jest.requireActual('@app/api'),
  fetcher: jest.fn().mockResolvedValue(null),
  silentFetcher: jest.fn().mockResolvedValue(null),
  createMultiWorkshop: jest.fn(),
  dateToApiString: jest.fn((d: Date) => d.toISOString()),
  patchWhiteGloveRequest: jest.fn(),
  apiPaths: {
    CATALOG_ITEMS: jest.fn().mockReturnValue('/api/catalog-items'),
    CATALOG_ITEM: jest.fn().mockReturnValue('/api/catalog-item'),
    ASSET_METRICS: jest.fn().mockReturnValue('/api/metrics'),
    WHITE_GLOVE_REQUEST: jest.fn().mockReturnValue(null),
    SYSTEM_STATUS: jest.fn().mockReturnValue('/api/system-status'),
  },
}));

jest.mock('@app/components/CatalogItemSelectorModal', () => ({
  __esModule: true,
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="catalog-selector-modal">Catalog Selector</div> : null,
}));

jest.mock('@app/components/ActivityPurposeSelector', () => ({
  __esModule: true,
  default: ({ onChange }: { onChange: (a: string, p: string, e: string) => void }) => (
    <div data-testid="activity-purpose-selector">
      <button onClick={() => onChange('Workshop', 'Customer Demo', '')}>Set Activity</button>
    </div>
  ),
}));

jest.mock('@app/components/SalesforceItemsField', () => ({
  __esModule: true,
  default: ({ items, onChange }: { items: Array<{ id: string; type: string }>; onChange: (items: Array<{ id: string; type: string }>) => void }) => (
    <div data-testid="salesforce-items-field">
      <button onClick={() => onChange([{ id: 'SF-001', type: 'campaign' }])}>Add SF</button>
      <span>{items?.length || 0} SF items</span>
    </div>
  ),
}));

jest.mock('@app/components/ProjectSelector', () => ({
  __esModule: true,
  default: ({ currentNamespaceName }: { currentNamespaceName: string }) => (
    <div data-testid="project-selector">{currentNamespaceName}</div>
  ),
}));

jest.mock('@app/components/DateTimePickerModal', () => ({
  DateTimePickerButton: ({ date }: { date: Date | null }) => (
    <button data-testid="datetime-picker-btn">{date ? 'Date set' : 'Not set'}</button>
  ),
  DateTimePickerModalDialog: () => null,
}));

jest.mock('@app/components/UserDisabledModal', () => ({
  __esModule: true,
  default: () => null,
}));

describe('MultiWorkshopCreate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentSession = { ...mockSession };
  });

  test('renders the form with title and breadcrumb', async () => {
    await render(<MultiWorkshopCreate />, {
      history: createMemoryHistory({ initialEntries: ['/multi-workshop/create'] }),
    });

    await waitFor(() => {
      expect(screen.getAllByText('Create Multi Asset Workshop').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText('Multi Asset Workshop')).toBeInTheDocument();
  });

  test('renders early release warning alert', async () => {
    await render(<MultiWorkshopCreate />, {
      history: createMemoryHistory({ initialEntries: ['/multi-workshop/create'] }),
    });

    await waitFor(() => {
      expect(screen.getByText(/Early Release/)).toBeInTheDocument();
    });
  });

  test('renders informational banner about multi-asset purpose', async () => {
    await render(<MultiWorkshopCreate />, {
      history: createMemoryHistory({ initialEntries: ['/multi-workshop/create'] }),
    });

    await waitFor(() => {
      expect(screen.getByText(/multiple catalog items/)).toBeInTheDocument();
    });
  });

  test('renders required form fields', async () => {
    await render(<MultiWorkshopCreate />, {
      history: createMemoryHistory({ initialEntries: ['/multi-workshop/create'] }),
    });

    await waitFor(() => {
      expect(screen.getByText('Name')).toBeInTheDocument();
    });
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Provisioning Start Date')).toBeInTheDocument();
    expect(screen.getByText('Auto-destroy workshops')).toBeInTheDocument();
    expect(screen.getByText('Number of Seats')).toBeInTheDocument();
    expect(screen.getByText('Assets')).toBeInTheDocument();
  });

  test('submit button is disabled when form is incomplete', async () => {
    await render(<MultiWorkshopCreate />, {
      history: createMemoryHistory({ initialEntries: ['/multi-workshop/create'] }),
    });

    await waitFor(() => {
      expect(screen.getAllByText('Create Multi Asset Workshop').length).toBeGreaterThanOrEqual(1);
    });
    const buttons = screen.getAllByText('Create Multi Asset Workshop');
    const submitBtn = buttons.find((el) => el.tagName === 'BUTTON' || el.closest('button'));
    expect(submitBtn?.closest('button')).toBeDisabled();
  });

  test('renders initial asset card with Asset 1', async () => {
    await render(<MultiWorkshopCreate />, {
      history: createMemoryHistory({ initialEntries: ['/multi-workshop/create'] }),
    });

    await waitFor(() => {
      expect(screen.getByText('Asset 1')).toBeInTheDocument();
    });
    expect(screen.getByText('Select catalog item')).toBeInTheDocument();
  });

  test('add asset button creates additional asset cards', async () => {
    await render(<MultiWorkshopCreate />, {
      history: createMemoryHistory({ initialEntries: ['/multi-workshop/create'] }),
    });

    await waitFor(() => {
      expect(screen.getByText('Asset 1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Asset'));

    await waitFor(() => {
      expect(screen.getByText('Asset 2')).toBeInTheDocument();
    });
  });

  test('remove button is disabled when only one asset exists', async () => {
    await render(<MultiWorkshopCreate />, {
      history: createMemoryHistory({ initialEntries: ['/multi-workshop/create'] }),
    });

    await waitFor(() => {
      expect(screen.getByText('Remove')).toBeInTheDocument();
    });
    expect(screen.getByText('Remove').closest('button')).toBeDisabled();
  });

  test('remove button is enabled when multiple assets exist', async () => {
    await render(<MultiWorkshopCreate />, {
      history: createMemoryHistory({ initialEntries: ['/multi-workshop/create'] }),
    });

    await waitFor(() => {
      expect(screen.getByText('Add Asset')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Asset'));

    await waitFor(() => {
      expect(screen.getByText('Asset 2')).toBeInTheDocument();
    });

    const removeButtons = screen.getAllByText('Remove');
    removeButtons.forEach((btn) => {
      expect(btn.closest('button')).not.toBeDisabled();
    });
  });

  test('renders cancel button', async () => {
    await render(<MultiWorkshopCreate />, {
      history: createMemoryHistory({ initialEntries: ['/multi-workshop/create'] }),
    });

    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
  });

  test('non-admin sees max seats message', async () => {
    currentSession = { ...mockSession, isAdmin: false };

    await render(<MultiWorkshopCreate />, {
      history: createMemoryHistory({ initialEntries: ['/multi-workshop/create'] }),
    });

    await waitFor(() => {
      expect(screen.getByText(/Maximum 30 seats/)).toBeInTheDocument();
    });
  });

  test('admin does not see max seats message', async () => {
    currentSession = { ...mockSession, isAdmin: true };

    await render(<MultiWorkshopCreate />, {
      history: createMemoryHistory({ initialEntries: ['/multi-workshop/create'] }),
    });

    await waitFor(() => {
      expect(screen.getByText('Number of Seats')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Maximum 30 seats/)).not.toBeInTheDocument();
  });

  test('renders landing page image fields', async () => {
    await render(<MultiWorkshopCreate />, {
      history: createMemoryHistory({ initialEntries: ['/multi-workshop/create'] }),
    });

    await waitFor(() => {
      expect(screen.getByText('Landing Page Images')).toBeInTheDocument();
    });
    expect(screen.getByText('Background Image URL')).toBeInTheDocument();
    expect(screen.getByText('Logo Image URL')).toBeInTheDocument();
  });

  test('shows workshop ordering blocked alert when blocked', async () => {
    const useSystemStatus = jest.requireMock('@app/utils/useSystemStatus').default;
    useSystemStatus.mockReturnValue({
      isWorkshopOrderingBlocked: true,
      workshopOrderingBlockedMessage: 'Maintenance in progress',
      wgBlockedDates: [],
    });

    await render(<MultiWorkshopCreate />, {
      history: createMemoryHistory({ initialEntries: ['/multi-workshop/create'] }),
    });

    await waitFor(() => {
      expect(screen.getByText('Workshop Ordering Temporarily Disabled')).toBeInTheDocument();
    });
    expect(screen.getByText('Maintenance in progress')).toBeInTheDocument();
  });

  test('admin sees project selector when multiple namespaces exist', async () => {
    currentSession = {
      ...mockSession,
      isAdmin: true,
      serviceNamespaces: [
        { displayName: 'NS1', name: 'ns-1', requester: 'user1' },
        { displayName: 'NS2', name: 'ns-2', requester: 'user2' },
      ],
    };

    await render(<MultiWorkshopCreate />, {
      history: createMemoryHistory({ initialEntries: ['/multi-workshop/create'] }),
    });

    await waitFor(() => {
      expect(screen.getByTestId('project-selector')).toBeInTheDocument();
    });
  });
});
