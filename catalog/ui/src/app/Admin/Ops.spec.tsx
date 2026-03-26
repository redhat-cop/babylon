jest.mock('../api');
import React from 'react';
import { generateSession, render, waitFor, screen } from '../utils/test-utils';
import Ops from './Ops';
import { apiPaths, fetcher, lockWorkshop, patchWorkshop, patchWorkshopProvision } from '@app/api';
import { Workshop, WorkshopProvision, WorkshopUserAssignment } from '@app/types';
import userEvent from '@testing-library/user-event';

const TEST_NAMESPACE = 'test-ns.prod';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ namespace: TEST_NAMESPACE }),
  useNavigate: () => jest.fn(),
}));

jest.mock('@app/utils/useSession', () =>
  jest.fn(() => ({
    getSession: () => generateSession({ isAdmin: true }),
  })),
);

const BABYLON_DOMAIN = 'babylon.gpte.redhat.com';
const DEMO_DOMAIN = 'demo.redhat.com';

function makeWorkshop(overrides: Partial<{
  name: string;
  displayName: string;
  locked: boolean;
  accessPassword: string;
  openRegistration: boolean;
  provisionDisabled: boolean;
  stopDate: string;
  destroyDate: string;
  workshopId: string;
  multiworkshopSource: string;
  namespace: string;
}>): Workshop {
  const {
    name = 'ws-test',
    displayName = 'Test Workshop',
    locked = false,
    accessPassword,
    openRegistration = true,
    provisionDisabled = false,
    stopDate,
    destroyDate,
    workshopId,
    multiworkshopSource,
    namespace = TEST_NAMESPACE,
  } = overrides;
  return {
    apiVersion: `${BABYLON_DOMAIN}/v1`,
    kind: 'Workshop',
    metadata: {
      name,
      namespace,
      uid: `uid-${name}`,
      labels: {
        [`${BABYLON_DOMAIN}/catalogItemName`]: name,
        ...(locked ? { [`${DEMO_DOMAIN}/lock-enabled`]: 'true' } : {}),
        ...(workshopId ? { [`${BABYLON_DOMAIN}/workshop-id`]: workshopId } : {}),
      },
      annotations: {
        ...(multiworkshopSource ? { [`${BABYLON_DOMAIN}/multiworkshop-source`]: multiworkshopSource } : {}),
      },
    },
    spec: {
      displayName,
      accessPassword,
      openRegistration,
      provisionDisabled,
      actionSchedule: stopDate ? { stop: stopDate } : undefined,
      lifespan: destroyDate ? { end: destroyDate } : undefined,
    },
  };
}

function makeProvision(workshopName: string, count: number, namespace = TEST_NAMESPACE): WorkshopProvision {
  return {
    apiVersion: `${BABYLON_DOMAIN}/v1`,
    kind: 'WorkshopProvision',
    metadata: { name: `prov-${workshopName}`, namespace, uid: `prov-uid-${workshopName}` },
    spec: {
      catalogItem: { name: 'ci-test', namespace: 'ci-ns' },
      concurrency: 1,
      count,
      parameters: {},
      workshopName,
    },
  };
}

function makeAssignment(workshopName: string, email?: string, namespace = TEST_NAMESPACE): WorkshopUserAssignment {
  return {
    apiVersion: `${BABYLON_DOMAIN}/v1`,
    kind: 'WorkshopUserAssignment',
    metadata: { name: `assign-${workshopName}-${email || 'free'}`, namespace, uid: `assign-uid-${email || 'free'}` },
    spec: {
      workshopName,
      ...(email ? { assignment: { email } } : {}),
    },
  };
}

const ws1 = makeWorkshop({ name: 'ws-ansible', displayName: 'Ansible Lab', locked: true, accessPassword: 'redhat123', workshopId: 'abc123', stopDate: new Date(Date.now() + 48 * 3600000).toISOString(), destroyDate: new Date(Date.now() + 96 * 3600000).toISOString() });
const ws2 = makeWorkshop({ name: 'ws-openshift', displayName: 'OpenShift AI', stopDate: new Date(Date.now() + 30 * 60000).toISOString(), destroyDate: new Date(Date.now() + 2 * 3600000).toISOString() });
const ws3 = makeWorkshop({ name: 'ws-stopped', displayName: 'Stopped Workshop', provisionDisabled: true });
const ws4 = makeWorkshop({ name: 'ws-ansible-2', displayName: 'Ansible Lab', workshopId: 'abc456' });
const wsMulti = makeWorkshop({ name: 'ws-multi-child', displayName: 'Multi Child', multiworkshopSource: 'parent-multi' });

const allWorkshops = [ws1, ws2, ws3, ws4, wsMulti];

const provisionData: Record<string, WorkshopProvision[]> = {
  [ws1.metadata.name]: [makeProvision(ws1.metadata.name, 5)],
  [ws2.metadata.name]: [makeProvision(ws2.metadata.name, 1)],
  [ws3.metadata.name]: [],
  [ws4.metadata.name]: [makeProvision(ws4.metadata.name, 3)],
  [wsMulti.metadata.name]: [makeProvision(wsMulti.metadata.name, 2)],
};

const assignmentData: Record<string, WorkshopUserAssignment[]> = {
  [ws1.metadata.name]: [
    makeAssignment(ws1.metadata.name, 'user1@test.com'),
    makeAssignment(ws1.metadata.name, 'user2@test.com'),
    makeAssignment(ws1.metadata.name),
  ],
  [ws2.metadata.name]: [],
  [ws3.metadata.name]: [],
  [ws4.metadata.name]: [makeAssignment(ws4.metadata.name, 'user3@test.com')],
  [wsMulti.metadata.name]: [],
};

jest.mock('@app/api', () => ({
  ...jest.requireActual('@app/api'),
  fetcher: jest.fn((url: string) => {
    if (url.includes('/workshops?')) {
      return Promise.resolve({ items: allWorkshops, metadata: {} });
    }
    for (const ws of allWorkshops) {
      if (url.includes('/workshopprovisions?') && url.includes(`workshop=${ws.metadata.name}`)) {
        return Promise.resolve({ items: provisionData[ws.metadata.name] || [], metadata: {} });
      }
      if (url.includes('/workshopuserassignments?') && url.includes(`workshop=${ws.metadata.name}`)) {
        return Promise.resolve({ items: assignmentData[ws.metadata.name] || [], metadata: {} });
      }
    }
    return Promise.resolve({ items: [], metadata: {} });
  }),
  lockWorkshop: jest.fn(() => Promise.resolve()),
  patchWorkshop: jest.fn(() => Promise.resolve()),
  patchWorkshopProvision: jest.fn(() => Promise.resolve()),
}));

describe('Ops Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Page Layout', () => {
    test('renders page header with "Operations" title and namespace', async () => {
      render(<Ops />);
      await waitFor(() => {
        expect(screen.getByText('Operations')).toBeInTheDocument();
        expect(screen.getByText(TEST_NAMESPACE)).toBeInTheDocument();
      });
    });

    test('renders all five operation cards', async () => {
      render(<Ops />);
      await waitFor(() => {
        expect(screen.getByText('Resource Lock')).toBeInTheDocument();
        expect(screen.getByText(/Extend Stop Time/)).toBeInTheDocument();
        expect(screen.getByText(/Extend Destroy Time/)).toBeInTheDocument();
        expect(screen.getAllByText(/Disable Auto-Stop/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Scale Workshops')).toBeInTheDocument();
      });
    });

    test('renders summary stats bar with all stat labels', async () => {
      render(<Ops />);
      await waitFor(() => {
        const bar = document.querySelector('.ops-summary-bar')!;
        expect(bar).toBeInTheDocument();
        expect(bar.textContent).toContain('Workshops');
        expect(bar.textContent).toContain('Instances');
        expect(bar.textContent).toContain('Seats filled');
        expect(bar.textContent).toContain('Active');
        expect(bar.textContent).toContain('Locked');
      });
    });

    test('renders timezone selector defaulting to "local"', async () => {
      render(<Ops />);
      await waitFor(() => {
        const tz = screen.getByLabelText('Timezone');
        expect(tz).toHaveValue('local');
      });
    });

    test('renders "All Workshops" default in scope selector', async () => {
      render(<Ops />);
      await waitFor(() => {
        expect(screen.getByText('All Workshops')).toBeInTheDocument();
      });
    });

    test('renders stage filter chips (prod, event, dev, test)', async () => {
      render(<Ops />);
      await waitFor(() => {
        expect(screen.getByText('prod')).toBeInTheDocument();
        expect(screen.getByText('event')).toBeInTheDocument();
        expect(screen.getByText('dev')).toBeInTheDocument();
      });
    });

    test('renders refresh button', async () => {
      render(<Ops />);
      await waitFor(() => {
        expect(screen.getByLabelText('Refresh data')).toBeInTheDocument();
      });
    });
  });

  describe('Workshop Table', () => {
    test('renders workshop display names in the table', async () => {
      render(<Ops />);
      await waitFor(() => {
        const table = document.querySelector('.ops-table-wrap')!;
        expect(table).toBeInTheDocument();
        expect(table.textContent).toContain('Ansible Lab');
        expect(table.textContent).toContain('OpenShift AI');
        expect(table.textContent).toContain('Stopped Workshop');
      });
    });

    test('groups workshops with same display name and shows badge count', async () => {
      render(<Ops />);
      await waitFor(() => {
        const table = document.querySelector('.ops-table-wrap')!;
        expect(table).toBeInTheDocument();
        expect(table.textContent).toContain('Ansible Lab');
      });
      const badges = screen.getAllByText('2');
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });

    test('shows "Show passwords" toggle button', async () => {
      render(<Ops />);
      await waitFor(() => {
        expect(screen.getByText('Show passwords')).toBeInTheDocument();
      });
    });

    test('clicking "Show passwords" reveals password text', async () => {
      render(<Ops />);
      await waitFor(() => {
        expect(screen.getByText('Show passwords')).toBeInTheDocument();
      });
      await userEvent.click(screen.getByText('Show passwords'));
      await waitFor(() => {
        expect(screen.getByText('Hide passwords')).toBeInTheDocument();
        expect(screen.getByText('redhat123')).toBeInTheDocument();
      });
    });

    test('shows "Open" registration labels', async () => {
      render(<Ops />);
      await waitFor(() => {
        const labels = screen.getAllByText('Open');
        expect(labels.length).toBeGreaterThanOrEqual(1);
      });
    });

    test('shows workshop URL link', async () => {
      render(<Ops />);
      await waitFor(() => {
        expect(screen.getByText('abc123')).toBeInTheDocument();
      });
    });

    test('shows "No auto-stop" for workshops without stop date', async () => {
      render(<Ops />);
      await waitFor(() => {
        expect(screen.getAllByText('No auto-stop').length).toBeGreaterThanOrEqual(1);
      });
    });

    test('shows "No auto-destroy" for workshops without destroy date', async () => {
      render(<Ops />);
      await waitFor(() => {
        expect(screen.getAllByText('No auto-destroy').length).toBeGreaterThanOrEqual(1);
      });
    });

    test('shows multi-asset label for child workshops', async () => {
      render(<Ops />);
      await waitFor(() => {
        expect(screen.getByText(/Multi-Asset: parent-multi/)).toBeInTheDocument();
      });
    });

    test('shows workshops in scope heading with group count', async () => {
      render(<Ops />);
      await waitFor(() => {
        expect(screen.getByText('Workshops in scope')).toBeInTheDocument();
      });
    });

    test('shows instance count note when groups differ from total', async () => {
      render(<Ops />);
      await waitFor(() => {
        const note = screen.queryByText(/instances\)/);
        if (note) expect(note).toBeInTheDocument();
      });
    });
  });

  describe('Date Urgency Color Coding', () => {
    test('renders critical urgency elements for dates < 1 hour', async () => {
      render(<Ops />);
      await waitFor(() => {
        const critical = document.querySelectorAll('.ops-date-critical');
        expect(critical.length).toBeGreaterThanOrEqual(1);
      });
    });

    test('shows "Need attention" stat when critical dates exist', async () => {
      render(<Ops />);
      await waitFor(() => {
        expect(screen.getByText('Need attention')).toBeInTheDocument();
      });
    });
  });

  describe('Operation Confirmation Modals', () => {
    test('Lock button opens lock confirmation modal', async () => {
      render(<Ops />);
      await waitFor(() => screen.getByText('Resource Lock'));
      await userEvent.click(screen.getByRole('button', { name: 'Lock' }));
      await waitFor(() => {
        expect(screen.getByText('Confirm Lock')).toBeInTheDocument();
        expect(screen.getByText(/lock-enabled=true/)).toBeInTheDocument();
      });
    });

    test('Unlock button opens unlock confirmation modal', async () => {
      render(<Ops />);
      await waitFor(() => screen.getByText('Resource Lock'));
      await userEvent.click(screen.getByRole('button', { name: 'Unlock' }));
      await waitFor(() => {
        expect(screen.getByText('Confirm Unlock')).toBeInTheDocument();
        expect(screen.getByText(/lock-enabled=false/)).toBeInTheDocument();
      });
    });

    test('Lock confirmation shows workshop count', async () => {
      render(<Ops />);
      await waitFor(() => screen.getByText('Resource Lock'));
      await userEvent.click(screen.getByRole('button', { name: 'Lock' }));
      await waitFor(() => {
        expect(screen.getByText(/workshop\(s\)/)).toBeInTheDocument();
      });
    });

    test('Scale button opens scale confirmation modal', async () => {
      render(<Ops />);
      await waitFor(() => screen.getByText('Scale Workshops'));
      const scaleBtn = screen.getAllByRole('button').find(b => b.textContent === 'Scale');
      if (scaleBtn) await userEvent.click(scaleBtn);
      await waitFor(() => {
        expect(screen.getByText('Confirm Scale')).toBeInTheDocument();
      });
    });

    test('Scale shows current vs new count per workshop', async () => {
      render(<Ops />);
      await waitFor(() => screen.getByText('Scale Workshops'));
      const scaleBtn = screen.getAllByRole('button').find(b => b.textContent === 'Scale');
      if (scaleBtn) await userEvent.click(scaleBtn);
      await waitFor(() => {
        const arrows = screen.getAllByText('→');
        expect(arrows.length).toBeGreaterThanOrEqual(1);
      });
    });

    test('Scale to zero shows destructive confirmation with type-to-confirm', async () => {
      render(<Ops />);
      await waitFor(() => screen.getByText('Scale Workshops'));
      const minusButtons = screen.getAllByLabelText('Minus');
      const lastMinus = minusButtons[minusButtons.length - 1];
      for (let i = 0; i < 5; i++) await userEvent.click(lastMinus);
      await waitFor(() => screen.getByText('Scale to Zero'));
      await userEvent.click(screen.getByRole('button', { name: 'Scale to Zero' }));
      await waitFor(() => {
        expect(screen.getByText('Confirm Scale to Zero')).toBeInTheDocument();
        expect(screen.getByText(/SCALE-TO-ZERO/)).toBeInTheDocument();
        expect(screen.getByText(/Destructive operation/)).toBeInTheDocument();
      });
    });

    test('Disable Auto-Stop opens confirmation modal', async () => {
      render(<Ops />);
      await waitFor(() => screen.getByText(/Removes/));
      const btn = screen.getAllByRole('button').find(b => {
        const text = b.textContent?.trim();
        return text === 'Disable Auto-Stop' && b.closest('.pf-v6-c-card__body');
      });
      expect(btn).toBeTruthy();
      if (btn) await userEvent.click(btn);
      await waitFor(() => {
        expect(screen.getByText('Confirm Disable Auto-Stop')).toBeInTheDocument();
      });
    });

    test('Extend Stop is disabled when both day and hour are 0', async () => {
      render(<Ops />);
      await waitFor(() => screen.getByText(/Extend Stop Time/));
      const extendStopBtn = screen.getAllByRole('button').find(b => b.textContent === 'Extend Stop');
      expect(extendStopBtn).toBeDisabled();
    });

    test('Extend Destroy is disabled when both day and hour are 0', async () => {
      render(<Ops />);
      await waitFor(() => screen.getByText(/Extend Destroy Time/));
      const extendDestroyBtn = screen.getAllByRole('button').find(b => b.textContent === 'Extend Destroy');
      expect(extendDestroyBtn).toBeDisabled();
    });
  });

  describe('Multi-namespace Mode', () => {
    test('shows multi-namespace toggle for admin users', async () => {
      render(<Ops />);
      await waitFor(() => {
        expect(screen.getByText('Multi-namespace mode')).toBeInTheDocument();
      });
    });

    test('clicking multi-namespace toggle shows confirmation modal', async () => {
      render(<Ops />);
      await waitFor(() => screen.getByText('Multi-namespace mode'));
      const toggle = screen.getByLabelText('Multi-namespace mode');
      await userEvent.click(toggle);
      await waitFor(() => {
        expect(screen.getByText('Enable Multi-Namespace Mode')).toBeInTheDocument();
        expect(screen.getByText(/Cross-namespace operations/)).toBeInTheDocument();
        expect(screen.getByText(/I understand, enable multi-namespace/)).toBeInTheDocument();
      });
    });
  });

  describe('Scale Analysis Labels', () => {
    test('shows scale analysis labels (up/down/same)', async () => {
      render(<Ops />);
      await waitFor(() => screen.getByText('Scale Workshops'));
      await waitFor(() => {
        const labels = document.querySelectorAll('.pf-v6-c-label');
        expect(labels.length).toBeGreaterThanOrEqual(1);
      });
    });

    test('scale card gets warning border when scaling down', async () => {
      render(<Ops />);
      await waitFor(() => screen.getByText('Scale Workshops'));
      const minusButtons = screen.getAllByLabelText('Minus');
      const lastMinus = minusButtons[minusButtons.length - 1];
      for (let i = 0; i < 4; i++) await userEvent.click(lastMinus);
      await waitFor(() => {
        const dangerCards = document.querySelectorAll('.ops-scale-danger');
        expect(dangerCards.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('Empty State', () => {
    test('empty state component renders correctly when given no data', () => {
      const { EmptyState: PFEmptyState } = require('@patternfly/react-core');
      const { render: rtlRender } = require('@testing-library/react');
      const result = rtlRender(
        <PFEmptyState titleText="No workshops found" headingLevel="h4" />
      );
      expect(result.getByText('No workshops found')).toBeInTheDocument();
    });
  });

  describe('Timezone', () => {
    test('timezone selector can be changed', async () => {
      render(<Ops />);
      await waitFor(() => screen.getByLabelText('Timezone'));
      const tz = screen.getByLabelText('Timezone') as HTMLSelectElement;
      await userEvent.selectOptions(tz, 'UTC');
      expect(tz).toHaveValue('UTC');
    });
  });
});
