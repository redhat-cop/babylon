import React from 'react';
import { waitFor } from '@testing-library/react';
import { render as customRender, generateSession } from '@app/utils/test-utils';
import { createMemoryHistory } from 'history';
import WhiteGloveList from './WhiteGloveList';

const DEMO_DOMAIN = 'demo.redhat.com';

jest.mock('@app/utils/useSession', () =>
  jest.fn(() => ({
    getSession: () => generateSession({}),
  })),
);

const mockFetcher = jest.fn();
const mockSilentFetcher = jest.fn().mockResolvedValue(null);

jest.mock('@app/api', () => ({
  ...jest.requireActual('@app/api'),
  fetcher: (...args: unknown[]) => mockFetcher(...args),
  silentFetcher: (...args: unknown[]) => mockSilentFetcher(...args),
}));

describe('WhiteGloveList', () => {
  test('renders request list with pending, approved, and rejected statuses', async () => {
    const wgrPending = {
      apiVersion: 'babylon.io/v1',
      kind: 'WhiteGloveRequest',
      metadata: {
        name: 'wgr-pending',
        namespace: 'user-test-redhat-com',
        uid: 'uid-1',
        creationTimestamp: '2026-09-01T10:00:00Z',
        annotations: {
          [`${DEMO_DOMAIN}/state`]: 'pending-approval',
          [`${DEMO_DOMAIN}/jira-ticket-id`]: 'WGR-123',
          [`${DEMO_DOMAIN}/jira-ticket-url`]: 'https://jira.example.com/WGR-123',
        },
      },
      spec: {
        displayName: 'RHEL 9 Summit Workshop',
        purpose: 'Demo',
        activity: 'Workshop',
        numberOfUsers: 10,
      },
    };
    const wgrApproved = {
      ...wgrPending,
      metadata: {
        ...wgrPending.metadata,
        name: 'wgr-approved',
        uid: 'uid-2',
        creationTimestamp: '2026-09-10T10:00:00Z',
        annotations: {
          [`${DEMO_DOMAIN}/state`]: 'approved',
          [`${DEMO_DOMAIN}/service-name`]: 'workshop-1',
          [`${DEMO_DOMAIN}/service-namespace`]: 'user-test-redhat-com',
          [`${DEMO_DOMAIN}/service-type`]: 'services',
        },
      },
      spec: { ...wgrPending.spec, displayName: 'Approved Workshop' },
    };
    const wgrRejected = {
      ...wgrPending,
      metadata: {
        ...wgrPending.metadata,
        name: 'wgr-rejected',
        uid: 'uid-3',
        creationTimestamp: '2026-08-01T10:00:00Z',
        annotations: {
          [`${DEMO_DOMAIN}/state`]: 'rejected',
        },
      },
      spec: { ...wgrPending.spec, displayName: 'Rejected Workshop' },
    };

    mockFetcher.mockResolvedValue({
      items: [wgrPending, wgrApproved, wgrRejected],
      metadata: {},
    });

    const { getByText, getAllByText } = await customRender(<WhiteGloveList />, {
      history: createMemoryHistory({ initialEntries: ['/white-glove'] }),
    });

    // Wait for data to render
    await waitFor(() => {
      expect(getByText('RHEL 9 Summit Workshop')).toBeInTheDocument();
    });

    // Page structure
    expect(getAllByText('White Glove Requests').length).toBeGreaterThanOrEqual(1);
    expect(getByText('Name')).toBeInTheDocument();
    expect(getByText('Status')).toBeInTheDocument();
    expect(getByText('Submitted')).toBeInTheDocument();
    expect(getByText('Assignee')).toBeInTheDocument();
    expect(getByText('Jira')).toBeInTheDocument();
    expect(getByText('Service')).toBeInTheDocument();

    // Pending request with Jira link
    expect(getByText('Pending Approval')).toBeInTheDocument();
    const detailLink = getByText('RHEL 9 Summit Workshop').closest('a');
    expect(detailLink).toHaveAttribute('href', '/white-glove/user-test-redhat-com/wgr-pending');
    expect(getByText('WGR-123')).toBeInTheDocument();
    const jiraLink = getByText('WGR-123').closest('a');
    expect(jiraLink).toHaveAttribute('href', 'https://jira.example.com/WGR-123');

    // Approved request with service link
    expect(getByText('Approved Workshop')).toBeInTheDocument();
    expect(getByText('Approved')).toBeInTheDocument();
    expect(getByText('View Service')).toBeInTheDocument();
    const serviceLink = getByText('View Service').closest('a');
    expect(serviceLink).toHaveAttribute('href', '/services/user-test-redhat-com/workshop-1');

    // Rejected request
    expect(getByText('Rejected Workshop')).toBeInTheDocument();
    expect(getByText('Rejected')).toBeInTheDocument();

    // Items sorted by creationTimestamp descending (Approved: Sep 10 > Pending: Sep 1 > Rejected: Aug 1)
    const rows = document.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain('Approved Workshop');
    expect(rows[1].textContent).toContain('RHEL 9 Summit Workshop');
    expect(rows[2].textContent).toContain('Rejected Workshop');
  });
});
