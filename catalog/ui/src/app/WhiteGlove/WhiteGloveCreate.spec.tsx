import React from 'react';
import { render, waitFor, screen, fireEvent } from '@app/utils/test-utils';
import { createMemoryHistory } from 'history';
import WhiteGloveCreate from './WhiteGloveCreate';

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

jest.mock('@app/utils/useSession', () => ({
  __esModule: true,
  default: () => ({ getSession: () => mockSession }),
}));

jest.mock('@app/utils/useSystemStatus', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    wgBlockedDates: [],
    isWorkshopOrderingBlocked: false,
    workshopOrderingBlockedMessage: '',
  })),
}));

jest.mock('@app/api', () => ({
  ...jest.requireActual('@app/api'),
  silentFetcher: jest.fn().mockResolvedValue(null),
  createWhiteGloveRequest: jest.fn(),
  createJiraTicketForWgr: jest.fn(),
  patchWhiteGloveRequest: jest.fn(),
  apiPaths: {
    CATALOG_ITEMS: jest.fn().mockReturnValue('/api/catalog-items'),
  },
}));

jest.mock('@app/components/CatalogItemSelectorModal', () => ({
  __esModule: true,
  default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="catalog-selector-modal">Catalog Selector</div> : null),
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
  default: ({ onChange, items }: { onChange: (items: Array<{ id: string; type: string }>) => void; items: Array<{ id: string; type: string }> }) => (
    <div data-testid="salesforce-items-field">
      <button onClick={() => onChange([{ id: 'SF-001', type: 'campaign' }])}>Add Salesforce</button>
      <span>{items.length} SF items</span>
    </div>
  ),
}));

jest.mock('@app/components/DateTimePickerModal', () => ({
  DateTimePickerButton: ({ date }: { date: Date | null }) => (
    <button data-testid="datetime-picker-btn">{date ? date.toISOString() : 'Not set'}</button>
  ),
  DateTimePickerModalDialog: () => null,
}));

describe('WhiteGloveCreate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders the form with title and about alert', async () => {
    await render(<WhiteGloveCreate />, {
      history: createMemoryHistory({ initialEntries: ['/white-glove/create'] }),
    });

    await waitFor(() => {
      expect(screen.getByText('Request White Glove Workshop')).toBeInTheDocument();
    });
    expect(screen.getByText('About White Glove Workshops')).toBeInTheDocument();
    expect(screen.getByText(/Submit a request at least 14 days/)).toBeInTheDocument();
  });

  test('renders all required form fields', async () => {
    await render(<WhiteGloveCreate />, {
      history: createMemoryHistory({ initialEntries: ['/white-glove/create'] }),
    });

    await waitFor(() => {
      expect(screen.getByText('Event Title')).toBeInTheDocument();
    });
    expect(screen.getByText('Catalog Item')).toBeInTheDocument();
    expect(screen.getByText('Event Start Date')).toBeInTheDocument();
    expect(screen.getByText('Event End Date')).toBeInTheDocument();
    expect(screen.getByText('Event Delivery Mode')).toBeInTheDocument();
    expect(screen.getByText('Audience Type')).toBeInTheDocument();
    expect(screen.getByText('Notes for Operations')).toBeInTheDocument();
  });

  test('submit button is disabled when form is incomplete', async () => {
    await render(<WhiteGloveCreate />, {
      history: createMemoryHistory({ initialEntries: ['/white-glove/create'] }),
    });

    await waitFor(() => {
      expect(screen.getByText('Submit Request')).toBeInTheDocument();
    });
    const submitBtn = screen.getByText('Submit Request').closest('button');
    expect(submitBtn).toBeDisabled();
  });

  test('shows consultation checkbox and clears catalog items when checked', async () => {
    await render(<WhiteGloveCreate />, {
      history: createMemoryHistory({ initialEntries: ['/white-glove/create'] }),
    });

    await waitFor(() => {
      expect(screen.getByText("I'm not sure / Need consultation")).toBeInTheDocument();
    });

    const checkbox = screen.getByLabelText("I'm not sure / Need consultation");
    fireEvent.click(checkbox);

    expect(checkbox).toBeChecked();
    expect(screen.queryByText('Select catalog item')).not.toBeInTheDocument();
  });

  test('renders breadcrumb with link back to list', async () => {
    await render(<WhiteGloveCreate />, {
      history: createMemoryHistory({ initialEntries: ['/white-glove/create'] }),
    });

    await waitFor(() => {
      expect(screen.getByText('White Glove Requests')).toBeInTheDocument();
    });
    expect(screen.getByText('New Request')).toBeInTheDocument();
  });

  test('renders number of users input', async () => {
    await render(<WhiteGloveCreate />, {
      history: createMemoryHistory({ initialEntries: ['/white-glove/create'] }),
    });

    await waitFor(() => {
      expect(screen.getByText(/Number of Users/)).toBeInTheDocument();
    });
  });

  test('renders share with email field', async () => {
    await render(<WhiteGloveCreate />, {
      history: createMemoryHistory({ initialEntries: ['/white-glove/create'] }),
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter email address')).toBeInTheDocument();
    });
    expect(screen.getByText('Add')).toBeInTheDocument();
  });

  test('renders delivery mode options', async () => {
    await render(<WhiteGloveCreate />, {
      history: createMemoryHistory({ initialEntries: ['/white-glove/create'] }),
    });

    await waitFor(() => {
      expect(screen.getByText('Select delivery mode...')).toBeInTheDocument();
    });
  });

  test('renders audience type options', async () => {
    await render(<WhiteGloveCreate />, {
      history: createMemoryHistory({ initialEntries: ['/white-glove/create'] }),
    });

    await waitFor(() => {
      expect(screen.getByText('Select audience type...')).toBeInTheDocument();
    });
  });

  test('displays blocked dates when present', async () => {
    const useSystemStatus = jest.requireMock('@app/utils/useSystemStatus').default;
    useSystemStatus.mockReturnValue({
      wgBlockedDates: [
        { startDate: '2026-10-01', endDate: '2026-10-05', message: 'Holiday' },
      ],
      isWorkshopOrderingBlocked: false,
      workshopOrderingBlockedMessage: '',
    });

    await render(<WhiteGloveCreate />, {
      history: createMemoryHistory({ initialEntries: ['/white-glove/create'] }),
    });

    await waitFor(() => {
      expect(screen.getByText('Some dates are unavailable')).toBeInTheDocument();
    });
    expect(screen.getByText(/Holiday/)).toBeInTheDocument();
  });
});
