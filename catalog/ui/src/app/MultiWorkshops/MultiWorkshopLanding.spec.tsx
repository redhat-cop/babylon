import React from 'react';
import { waitFor } from '@testing-library/react';
import { render as customRender } from '@app/utils/test-utils';
import { createMemoryHistory } from 'history';
import MultiWorkshopLanding from './MultiWorkshopLanding';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ multiWorkshopId: 'mw-summit-2026' }),
}));

const mockPublicFetcher = jest.fn();

jest.mock('@app/api', () => ({
  ...jest.requireActual('@app/api'),
  publicFetcher: (...args: unknown[]) => mockPublicFetcher(...args),
}));

jest.mock('./hero-img.jpeg', () => 'hero-img-stub');

jest.mock('./LabIcon', () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => <img data-testid="lab-icon" alt={alt} />,
}));

jest.mock('@app/components/Footer', () => ({
  __esModule: true,
  default: () => <div data-testid="footer">Footer</div>,
}));

jest.mock('@app/utils/useSession', () =>
  jest.fn(() => ({
    getSession: () => ({
      authUser: '',
      email: 'test@test.com',
      fullName: '',
      isAdmin: false,
      groups: [],
      roles: [],
      catalogNamespaces: [],
      consoleUrl: '',
      userInterface: '',
      serviceNamespaces: [],
      userNamespace: { name: 'ns', displayName: 'NS', requester: 'r' },
    }),
  })),
);

describe('MultiWorkshopLanding', () => {
  test('renders workshop cards with title, description, types, seats, and footer', async () => {
    const mw = {
      apiVersion: 'babylon.io/v1',
      kind: 'MultiWorkshop',
      metadata: {
        name: 'mw-summit-2026',
        namespace: 'user-test-redhat-com',
        uid: 'mw-uid-1',
        creationTimestamp: '2026-09-01T10:00:00Z',
      },
      spec: {
        displayName: 'Summit 2026 Labs',
        description: 'Hands-on labs for Red Hat Summit 2026',
        startDate: '2026-10-01T09:00:00Z',
        endDate: '2026-10-03T17:00:00Z',
        numberSeats: 50,
        logoImage: 'https://example.com/logo.png',
        assets: [
          {
            key: 'rhel-lab',
            name: 'rhel-lab',
            displayName: 'RHEL 9 Fundamentals',
            description: 'Learn RHEL 9 basics',
            type: 'Workshop',
            workshopId: 'ws-rhel-1',
          },
          {
            key: 'ext-lab',
            name: 'ext-lab',
            displayName: 'External Workshop',
            description: 'Hosted externally',
            type: 'external',
            url: 'https://external.example.com/lab',
          },
          {
            key: 'pending-lab',
            name: 'pending-lab',
            displayName: 'Pending Lab',
            description: 'Not yet provisioned',
            type: 'Workshop',
          },
          {
            key: 'lab-seats',
            name: 'lab-seats',
            displayName: 'Lab With Seats',
            type: 'Workshop',
            workshopId: 'ws-seats',
            availableSeats: 5,
          },
          {
            key: 'lab-1-seat',
            name: 'lab-1-seat',
            displayName: 'Lab One Seat',
            type: 'SelfPacedLab',
            workshopId: 'spl-1',
            availableSeats: 1,
          },
        ],
      },
    };
    mockPublicFetcher.mockResolvedValue(mw);

    const { getByText, getByTestId, getByAltText } = await customRender(<MultiWorkshopLanding />, {
      history: createMemoryHistory({ initialEntries: ['/event/mw-summit-2026'] }),
    });

    // Title and description
    await waitFor(() => {
      expect(getByText('Summit 2026 Labs')).toBeInTheDocument();
    });
    expect(getByText('Hands-on labs for Red Hat Summit 2026')).toBeInTheDocument();

    // Logo image
    const logo = getByAltText('Summit 2026 Labs Logo');
    expect(logo).toHaveAttribute('src', 'https://example.com/logo.png');

    // Workshop cards
    expect(getByText('RHEL 9 Fundamentals')).toBeInTheDocument();
    expect(getByText('Learn RHEL 9 basics')).toBeInTheDocument();

    // External workshop
    expect(getByText('External Workshop')).toBeInTheDocument();
    expect(getByText('Hosted externally')).toBeInTheDocument();
    const extCard = getByText('External Workshop').closest('a');
    expect(extCard).toHaveAttribute('href', 'https://external.example.com/lab');

    // Pending/unavailable workshop
    expect(getByText('Pending Lab')).toBeInTheDocument();
    expect(getByText('Workshop unavailable')).toBeInTheDocument();

    // Seats display
    expect(getByText(/5 seats available/)).toBeInTheDocument();
    expect(getByText(/1 seat available/)).toBeInTheDocument();

    // Footer
    expect(getByTestId('footer')).toBeInTheDocument();
  });
});

describe('MultiWorkshopLanding - invalid URL', () => {
  test('shows error when multiWorkshopId is missing', async () => {
    jest.spyOn(require('react-router-dom'), 'useParams').mockReturnValue({});

    const { getByText } = await customRender(<MultiWorkshopLanding />, {
      history: createMemoryHistory({ initialEntries: ['/event/'] }),
    });

    await waitFor(() => {
      expect(getByText('Invalid URL')).toBeInTheDocument();
    });
  });
});
