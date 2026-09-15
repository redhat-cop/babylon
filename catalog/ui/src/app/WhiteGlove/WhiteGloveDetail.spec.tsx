import React from 'react';
import { waitFor } from '@testing-library/react';
import { render as customRender, generateSession } from '@app/utils/test-utils';
import { createMemoryHistory } from 'history';
import WhiteGloveDetail from './WhiteGloveDetail';

const DEMO_DOMAIN = 'demo.redhat.com';
const BABYLON_DOMAIN = 'babylon.gpte.redhat.com';

let adminSession = false;

jest.mock('@app/utils/useSession', () =>
  jest.fn(() => ({
    getSession: () =>
      generateSession({
        isAdmin: adminSession,
      }),
  })),
);

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ namespace: 'user-test-redhat-com', name: 'wgr-test-1' }),
  useLocation: () => ({
    state: null,
    pathname: '/white-glove/user-test-redhat-com/wgr-test-1',
    search: '',
    hash: '',
  }),
}));

const mockFetcher = jest.fn();
const mockSilentFetcher = jest.fn().mockResolvedValue(null);

jest.mock('@app/api', () => ({
  ...jest.requireActual('@app/api'),
  fetcher: (...args: unknown[]) => mockFetcher(...args),
  silentFetcher: (...args: unknown[]) => mockSilentFetcher(...args),
  patchWhiteGloveRequest: jest.fn().mockResolvedValue(null),
  addJiraComment: jest.fn().mockResolvedValue(null),
  updateJiraLabels: jest.fn().mockResolvedValue(null),
}));

jest.mock('@app/utils/useDebounce', () => ({
  __esModule: true,
  default: (fn: (...args: unknown[]) => void) => fn,
}));

jest.mock('@app/components/CatalogItemSelectorModal', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@app/components/ActivityPurposeSelector', () => ({
  __esModule: true,
  default: ({ value }: { value: { activity: string; purpose: string } }) => (
    <div data-testid="activity-purpose-selector">
      {value?.activity} / {value?.purpose}
    </div>
  ),
}));

jest.mock('@app/components/SalesforceItemsField', () => ({
  __esModule: true,
  default: ({ items }: { items: Array<{ id: string; type: string }> }) => (
    <div data-testid="salesforce-items-field">{items?.length || 0} items</div>
  ),
}));

jest.mock('@app/components/DateTimePickerModal', () => ({
  DateTimePickerButton: ({ date }: { date: Date | null }) => (
    <button data-testid="datetime-picker-btn">{date ? 'Date set' : 'Not set'}</button>
  ),
  DateTimePickerModalDialog: () => null,
}));

jest.mock('@app/components/PatientNumberInput', () => ({
  __esModule: true,
  default: ({ value }: { value: number }) => <span data-testid="patient-number-input">{value}</span>,
}));

jest.mock('@app/components/ProjectSelector', () => ({
  __esModule: true,
  default: () => <div data-testid="project-selector" />,
}));

function makeWgrData(state = 'pending-approval', extraAnnotations = {} as Record<string, string>) {
  return {
    apiVersion: 'babylon.io/v1',
    kind: 'WhiteGloveRequest',
    metadata: {
      name: 'wgr-test-1',
      namespace: 'user-test-redhat-com',
      uid: 'uid-1',
      creationTimestamp: '2026-09-01T10:00:00Z',
      annotations: {
        [`${DEMO_DOMAIN}/state`]: state,
        [`${BABYLON_DOMAIN}/created-by`]: 'test@redhat.com',
        ...extraAnnotations,
      },
    },
    spec: {
      displayName: 'RHEL 9 Summit Workshop',
      purpose: 'Customer Demo',
      activity: 'Workshop',
      numberOfUsers: 10,
      eventDate: '2026-10-01T09:00:00Z',
      eventEndDate: '2026-10-02T17:00:00Z',
      deliveryMode: 'virtual',
      audienceType: 'external-customers',
      salesforceItems: [{ id: 'SF-001', type: 'campaign' }],
    },
  };
}

describe('WhiteGloveDetail - pending approval (non-admin)', () => {
  beforeAll(() => {
    adminSession = false;
  });

  test('renders detail page with status, stepper, detail fields, and tabs', async () => {
    const wgr = makeWgrData('pending-approval', {
      [`${DEMO_DOMAIN}/jira-ticket-id`]: 'WGR-123',
      [`${DEMO_DOMAIN}/jira-ticket-url`]: 'https://jira.example.com/WGR-123',
    });
    mockFetcher.mockResolvedValue(wgr);

    const { getByText, getAllByText } = await customRender(<WhiteGloveDetail />, {
      history: createMemoryHistory({
        initialEntries: ['/white-glove/user-test-redhat-com/wgr-test-1'],
      }),
    });

    // Title (also appears in breadcrumb)
    await waitFor(() => {
      expect(getAllByText('RHEL 9 Summit Workshop').length).toBeGreaterThanOrEqual(1);
    });

    // Status banner (also appears in stepper)
    expect(getAllByText('Pending Approval').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('Submitted').length).toBeGreaterThanOrEqual(1);

    // Jira link in banner
    expect(getAllByText(/WGR-123/).length).toBeGreaterThanOrEqual(1);

    // Tabs
    expect(getAllByText('Details').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText(/Activity/).length).toBeGreaterThanOrEqual(1);

    // Detail fields
    expect(getByText('Event Title')).toBeInTheDocument();
    expect(getByText('Request Type')).toBeInTheDocument();
    expect(getByText('White Glove')).toBeInTheDocument();
    expect(getByText('Requested By')).toBeInTheDocument();
    expect(getByText('Event Start Date')).toBeInTheDocument();
    expect(getByText('Event End Date')).toBeInTheDocument();
    expect(getByText('Number of Users')).toBeInTheDocument();
    expect(getByText('Event Delivery Mode')).toBeInTheDocument();
    expect(getByText('Audience Type')).toBeInTheDocument();
    expect(getByText('Notes')).toBeInTheDocument();

    // Non-admin should see read-only activity/purpose
    expect(getByText('Workshop / Customer Demo')).toBeInTheDocument();

    // Non-admin should NOT see approve/reject buttons
    expect(document.querySelector('button')).toBeDefined();
    const allButtons = Array.from(document.querySelectorAll('button'));
    const approveBtn = allButtons.find((b) => b.textContent === 'Approve');
    const rejectBtn = allButtons.find((b) => b.textContent === 'Reject');
    expect(approveBtn).toBeUndefined();
    expect(rejectBtn).toBeUndefined();
  });
});

describe('WhiteGloveDetail - approved with service (non-admin)', () => {
  beforeAll(() => {
    adminSession = false;
    mockFetcher.mockReset();
  });

  test('renders approved state with service link and progress stepper', async () => {
    const wgr = makeWgrData('approved', {
      [`${DEMO_DOMAIN}/service-name`]: 'workshop-1',
      [`${DEMO_DOMAIN}/service-namespace`]: 'user-test-redhat-com',
      [`${DEMO_DOMAIN}/service-type`]: 'workshops',
    });
    mockFetcher.mockResolvedValue(wgr);

    const { getByText, getAllByText } = await customRender(<WhiteGloveDetail />, {
      history: createMemoryHistory({
        initialEntries: ['/white-glove/user-test-redhat-com/wgr-test-1'],
      }),
    });

    await waitFor(() => {
      expect(getAllByText('RHEL 9 Summit Workshop').length).toBeGreaterThanOrEqual(1);
    });

    expect(getByText('Approved')).toBeInTheDocument();
    expect(getByText('View Service')).toBeInTheDocument();
  });
});

describe('WhiteGloveDetail - admin actions', () => {
  beforeAll(() => {
    adminSession = true;
    mockFetcher.mockReset();
  });

  test('admin sees approve and reject buttons on pending request', async () => {
    const wgr = makeWgrData('pending-approval');
    mockFetcher.mockResolvedValue(wgr);

    const { getByText, getAllByText } = await customRender(<WhiteGloveDetail />, {
      history: createMemoryHistory({
        initialEntries: ['/white-glove/user-test-redhat-com/wgr-test-1'],
      }),
    });

    await waitFor(() => {
      expect(getAllByText('RHEL 9 Summit Workshop').length).toBeGreaterThanOrEqual(1);
    });

    expect(getByText('Approve')).toBeInTheDocument();
    expect(getByText('Reject')).toBeInTheDocument();
  });
});
