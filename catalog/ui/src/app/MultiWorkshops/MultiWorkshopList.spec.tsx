import React from 'react';
import { waitFor } from '@testing-library/react';
import { render as customRender, generateSession } from '@app/utils/test-utils';
import { createMemoryHistory } from 'history';
import MultiWorkshopList from './MultiWorkshopList';

const DEMO_DOMAIN = 'demo.redhat.com';

jest.mock('@app/utils/useSession', () =>
  jest.fn(() => ({
    getSession: () => generateSession({}),
  })),
);

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ namespace: 'user-test-redhat-com' }),
}));

const mockFetcher = jest.fn();

jest.mock('@app/api', () => ({
  ...jest.requireActual('@app/api'),
  fetcher: (...args: unknown[]) => mockFetcher(...args),
  deleteMultiWorkshop: jest.fn().mockResolvedValue(null),
}));

jest.mock('@app/Modal/Modal', () => {
  const React = require('react');
  const Modal = React.forwardRef(
    (
      { children, title }: { children: React.ReactNode; title: string; onConfirm: () => void },
      ref: React.Ref<{ open: () => void }>,
    ) => {
      const [isOpen, setIsOpen] = React.useState(false);
      React.useImperativeHandle(ref, () => ({ open: () => setIsOpen(true) }));
      if (!isOpen) return null;
      return <div data-testid="confirm-modal">{title}</div>;
    },
  );
  Modal.displayName = 'Modal';
  return {
    __esModule: true,
    default: Modal,
    useModal: () => {
      const ref = React.useRef({ open: () => {} });
      return [ref, () => ref.current?.open()];
    },
  };
});

describe('MultiWorkshopList', () => {
  test('renders list with table, links, dates, assets, seats, and locked state', async () => {
    const mw1 = {
      apiVersion: 'babylon.io/v1',
      kind: 'MultiWorkshop',
      metadata: {
        name: 'mw-summit-2026',
        namespace: 'user-test-redhat-com',
        uid: 'mw-uid-1',
        creationTimestamp: '2026-09-01T10:00:00Z',
        labels: {},
      },
      spec: {
        displayName: 'Summit 2026 Labs',
        description: 'Collection of labs',
        startDate: '2026-10-01T09:00:00Z',
        endDate: '2026-10-03T17:00:00Z',
        numberSeats: 50,
        assets: [
          { key: 'rhel-lab', name: 'rhel-lab', namespace: 'ns', type: 'Workshop' },
          { key: 'ocp-lab', name: 'ocp-lab', namespace: 'ns', type: 'Workshop' },
        ],
      },
    };
    const mwLocked = {
      ...mw1,
      metadata: {
        ...mw1.metadata,
        name: 'mw-locked',
        uid: 'mw-uid-2',
        labels: { [`${DEMO_DOMAIN}/lock-enabled`]: 'true' },
      },
      spec: {
        displayName: 'Locked Workshop',
        numberSeats: undefined,
        assets: [],
        startDate: undefined,
        endDate: undefined,
      },
    };

    mockFetcher.mockResolvedValue({ items: [mw1, mwLocked], metadata: {} });

    const { getByText, getAllByText } = await customRender(<MultiWorkshopList />, {
      history: createMemoryHistory({ initialEntries: ['/multi-workshop/user-test-redhat-com'] }),
    });

    await waitFor(() => {
      expect(getByText('Summit 2026 Labs')).toBeInTheDocument();
    });

    // Page title and subtitle
    expect(getByText('Multi Asset Workshop')).toBeInTheDocument();
    expect(getByText(/user-test-redhat-com/)).toBeInTheDocument();
    expect(getAllByText('Create Multi Asset Workshop').length).toBeGreaterThanOrEqual(1);

    // Link to detail page
    const link = getByText('Summit 2026 Labs').closest('a');
    expect(link).toHaveAttribute('href', '/multi-workshop/user-test-redhat-com/mw-summit-2026');

    // Asset counts
    expect(getByText('2')).toBeInTheDocument();
    expect(getByText('0')).toBeInTheDocument();

    // Seat counts
    expect(getByText('50')).toBeInTheDocument();
    expect(getByText('N/A')).toBeInTheDocument();

    // Not scheduled dates
    expect(getAllByText('Not scheduled').length).toBe(2);

    // Locked workshop present
    expect(getByText('Locked Workshop')).toBeInTheDocument();

    // Locked delete is disabled
    const deleteButtons = document.querySelectorAll('[aria-label="Delete"]');
    const lockedDeleteBtn = Array.from(deleteButtons).find((btn) => btn.hasAttribute('disabled'));
    expect(lockedDeleteBtn).toBeTruthy();
  });
});
