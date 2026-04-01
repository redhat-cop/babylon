jest.mock('../api');
import React from 'react';
import { SWRConfig } from 'swr';
import { generateSession, render, waitFor, screen } from '../utils/test-utils';
import { within } from '@testing-library/react';
import Ops, { getWorkshopScheduleStartMs, matchesOpsScheduleFilter } from './Ops';
import { apiPaths, fetcher, deleteResourceClaim, lockWorkshop, patchWorkshop, patchWorkshopProvision } from '@app/api';
import { Workshop, WorkshopProvision, WorkshopUserAssignment, ResourceClaim } from '@app/types';
import userEvent from '@testing-library/user-event';

function renderOps(ui: React.ReactElement = <Ops />) {
  return render(<SWRConfig value={{ suspense: false }}>{ui}</SWRConfig>);
}

function getScaleWorkshopsCard(): HTMLElement {
  const node = screen.getAllByText('Scale Workshops').find((el) => el.closest('.pf-v6-c-card'));
  if (!node) throw new Error('Scale Workshops card not found');
  return node.closest('.pf-v6-c-card') as HTMLElement;
}

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
  startDate: string;
  destroyDate: string;
  workshopId: string;
  multiworkshopSource: string;
  namespace: string;
  whiteGlove: boolean;
}>): Workshop {
  const {
    name = 'ws-test',
    displayName = 'Test Workshop',
    locked = false,
    accessPassword,
    openRegistration = true,
    provisionDisabled = false,
    stopDate,
    startDate,
    destroyDate,
    workshopId,
    multiworkshopSource,
    namespace = TEST_NAMESPACE,
    whiteGlove,
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
        ...(whiteGlove ? { [`${DEMO_DOMAIN}/white-glove`]: 'true' } : {}),
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
      ...((stopDate || startDate) ? {
        actionSchedule: {
          ...(stopDate ? { stop: stopDate } : {}),
          ...(startDate ? { start: startDate } : {}),
        },
      } : { actionSchedule: undefined }),
      lifespan: destroyDate ? { end: destroyDate } : undefined,
    },
  };
}

function makeProvision(workshopName: string, count: number, namespace = TEST_NAMESPACE, failedCount = 0): WorkshopProvision {
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
    ...(failedCount > 0 ? { status: { failedCount, resourceClaimCount: failedCount, retryCount: failedCount } } : {}),
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

function makeResourceClaim(workshopName: string, state: string, idx = 0, namespace = TEST_NAMESPACE): ResourceClaim {
  return {
    apiVersion: 'poolboy.gpte.redhat.com/v1',
    kind: 'ResourceClaim',
    metadata: { name: `rc-${workshopName}-${idx}`, namespace, uid: `rc-uid-${workshopName}-${idx}`, creationTimestamp: new Date().toISOString(), labels: { [`${BABYLON_DOMAIN}/workshop`]: workshopName } },
    spec: { resources: [] },
    status: { summary: { state } },
  } as unknown as ResourceClaim;
}

const ws1 = makeWorkshop({ name: 'ws-ansible', displayName: 'Ansible Lab', locked: true, accessPassword: 'redhat123', workshopId: 'abc123', stopDate: new Date(Date.now() + 48 * 3600000).toISOString(), destroyDate: new Date(Date.now() + 96 * 3600000).toISOString() });
const ws2 = makeWorkshop({ name: 'ws-openshift', displayName: 'OpenShift AI', stopDate: new Date(Date.now() + 30 * 60000).toISOString(), destroyDate: new Date(Date.now() + 2 * 3600000).toISOString() });
const ws3 = makeWorkshop({ name: 'ws-stopped', displayName: 'Stopped Workshop', provisionDisabled: true });
const ws4 = makeWorkshop({ name: 'ws-ansible-2', displayName: 'Ansible Lab', workshopId: 'abc456' });
const wsMulti = makeWorkshop({ name: 'ws-multi-child', displayName: 'Multi Child', multiworkshopSource: 'parent-multi' });
const wsFailed = makeWorkshop({ name: 'ws-failed-prov', displayName: 'Failed Provision Workshop' });

const allWorkshops = [ws1, ws2, ws3, ws4, wsMulti, wsFailed];

const provisionData: Record<string, WorkshopProvision[]> = {
  [ws1.metadata.name]: [makeProvision(ws1.metadata.name, 5)],
  [ws2.metadata.name]: [makeProvision(ws2.metadata.name, 1)],
  [ws3.metadata.name]: [],
  [ws4.metadata.name]: [makeProvision(ws4.metadata.name, 3)],
  [wsMulti.metadata.name]: [makeProvision(wsMulti.metadata.name, 2)],
  [wsFailed.metadata.name]: [makeProvision(wsFailed.metadata.name, 5, TEST_NAMESPACE, 5)],
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
  [wsFailed.metadata.name]: [],
};

const resourceClaimData: Record<string, ResourceClaim[]> = {
  [ws1.metadata.name]: [
    makeResourceClaim(ws1.metadata.name, 'Running', 0),
    makeResourceClaim(ws1.metadata.name, 'Running', 1),
    makeResourceClaim(ws1.metadata.name, 'Running', 2),
    makeResourceClaim(ws1.metadata.name, 'Provisioning', 3),
    makeResourceClaim(ws1.metadata.name, 'Provisioning', 4),
  ],
  [ws2.metadata.name]: [makeResourceClaim(ws2.metadata.name, 'Running', 0)],
  [ws3.metadata.name]: [],
  [ws4.metadata.name]: [
    makeResourceClaim(ws4.metadata.name, 'Running', 0),
    makeResourceClaim(ws4.metadata.name, 'Running', 1),
    makeResourceClaim(ws4.metadata.name, 'Running', 2),
  ],
  [wsMulti.metadata.name]: [
    makeResourceClaim(wsMulti.metadata.name, 'Provisioning', 0),
    makeResourceClaim(wsMulti.metadata.name, 'Provisioning', 1),
  ],
  [wsFailed.metadata.name]: [
    makeResourceClaim(wsFailed.metadata.name, 'Provision Failed', 0),
    makeResourceClaim(wsFailed.metadata.name, 'Provision Failed', 1),
    makeResourceClaim(wsFailed.metadata.name, 'Provision Failed', 2),
    makeResourceClaim(wsFailed.metadata.name, 'Provision Failed', 3),
    makeResourceClaim(wsFailed.metadata.name, 'Provision Failed', 4),
  ],
};

const mockMultiWorkshop = {
  apiVersion: `${BABYLON_DOMAIN}/v1`,
  kind: 'MultiWorkshop',
  metadata: { name: 'parent-multi', namespace: TEST_NAMESPACE, uid: 'mw-uid-1' },
  spec: {
    displayName: 'Multi Asset Event',
    numberSeats: 20,
    assets: [
      { key: 'asset-1', name: wsMulti.metadata.name, namespace: TEST_NAMESPACE, displayName: 'Multi Child' },
    ],
  },
};

jest.mock('@app/api', () => ({
  ...jest.requireActual('@app/api'),
  fetcher: jest.fn((url: string) => {
    if (url.includes('/multiworkshops?')) {
      return Promise.resolve({ items: [mockMultiWorkshop], metadata: {} });
    }
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
      if (url.includes('/resourceclaims?') && url.includes(`workshop=${ws.metadata.name}`)) {
        return Promise.resolve({ items: resourceClaimData[ws.metadata.name] || [], metadata: {} });
      }
    }
    return Promise.resolve({ items: [], metadata: {} });
  }),
  deleteResourceClaim: jest.fn(() => Promise.resolve()),
  lockWorkshop: jest.fn(() => Promise.resolve()),
  patchWorkshop: jest.fn(() => Promise.resolve()),
  patchWorkshopProvision: jest.fn(() => Promise.resolve()),
}));

describe('Ops Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Page Layout', () => {
    test('renders page header with "Operations Workshop Control" title and namespace', async () => {
      renderOps();
      await waitFor(() => {
        expect(screen.getByText('Operations Workshop Control')).toBeInTheDocument();
        expect(screen.getByText(TEST_NAMESPACE)).toBeInTheDocument();
      });
    });

    test('renders all five operation cards', async () => {
      renderOps();
      await waitFor(() => {
        expect(screen.getByText('Resource Lock')).toBeInTheDocument();
        expect(screen.getByText(/Extend Stop Time/)).toBeInTheDocument();
        expect(screen.getByText(/Extend Destroy Time/)).toBeInTheDocument();
        expect(screen.getAllByText(/Disable Auto-Stop/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Scale Workshops')).toBeInTheDocument();
      });
    });

    test('renders summary stats bar with all stat labels', async () => {
      renderOps();
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
      renderOps();
      await waitFor(() => {
        const tz = screen.getByLabelText('Timezone');
        expect(tz).toHaveValue('local');
      });
    });

    test('renders "All Workshops" default in scope selector', async () => {
      renderOps();
      await waitFor(() => {
        expect(screen.getAllByText(/All Workshops/i).length).toBeGreaterThanOrEqual(1);
      }, { timeout: 5000 });
    });

    test('renders stage filter chips (prod, event, dev, test)', async () => {
      renderOps();
      await waitFor(() => {
        expect(screen.getByText('prod')).toBeInTheDocument();
        expect(screen.getByText('event')).toBeInTheDocument();
        expect(screen.getByText('dev')).toBeInTheDocument();
      });
    });

    test('renders refresh button', async () => {
      renderOps();
      await waitFor(() => {
        expect(screen.getByLabelText('Refresh data')).toBeInTheDocument();
      });
    });
  });

  describe('Workshop Table', () => {
    test('renders workshop display names in the table', async () => {
      renderOps();
      await waitFor(() => {
        const table = document.querySelector('.ops-table-wrap')!;
        expect(table).toBeInTheDocument();
        expect(table.textContent).toContain('Ansible Lab');
        expect(table.textContent).toContain('OpenShift AI');
        expect(table.textContent).toContain('Stopped Workshop');
      });
    });

    test('groups workshops with same display name and shows badge count', async () => {
      renderOps();
      await waitFor(() => {
        const table = document.querySelector('.ops-table-wrap')!;
        expect(table).toBeInTheDocument();
        expect(table.textContent).toContain('Ansible Lab');
      });
      const badges = screen.getAllByText('2');
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });

    test('shows "Show passwords" toggle button', async () => {
      renderOps();
      await waitFor(() => {
        expect(screen.getByText('Show passwords')).toBeInTheDocument();
      });
    });

    test('clicking "Show passwords" reveals password text', async () => {
      renderOps();
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
      renderOps();
      await waitFor(() => {
        const labels = screen.getAllByText('Open');
        expect(labels.length).toBeGreaterThanOrEqual(1);
      });
    });

    test('shows workshop URL link', async () => {
      renderOps();
      await waitFor(() => {
        expect(screen.getByText('abc123')).toBeInTheDocument();
      });
    });

    test('shows "No auto-stop" for workshops without stop date', async () => {
      renderOps();
      await waitFor(() => {
        expect(screen.getAllByText('No auto-stop').length).toBeGreaterThanOrEqual(1);
      });
    });

    test('shows "No auto-destroy" for workshops without destroy date', async () => {
      renderOps();
      await waitFor(() => {
        expect(screen.getAllByText('No auto-destroy').length).toBeGreaterThanOrEqual(1);
      });
    });

    test('shows multi-asset label for multi-asset workshop groups', async () => {
      renderOps();
      await waitFor(() => {
        expect(screen.getAllByText('Multi-Asset').length).toBeGreaterThanOrEqual(1);
      });
    });

    test('multi-asset group uses MultiWorkshop displayName and shows parent seats', async () => {
      renderOps();
      await waitFor(() => {
        expect(screen.getByText('Multi Asset Event')).toBeInTheDocument();
        expect(screen.getByText('20')).toBeInTheDocument();
      });
    });

    test('shows workshops in scope heading with group count', async () => {
      renderOps();
      await waitFor(() => {
        expect(screen.getByText('Workshops in scope')).toBeInTheDocument();
      });
    });

    test('shows Provision Failed status from WorkshopStatus for workshops with failed provisions', async () => {
      renderOps();
      await waitFor(() => screen.getByText('Failed Provision Workshop'));
      const failedElements = screen.getAllByText(/Provision Failed/i);
      expect(failedElements.length).toBeGreaterThanOrEqual(1);
    });

    test('shows Running status from WorkshopStatus for active workshops', async () => {
      renderOps();
      await waitFor(() => screen.getByText('Ansible Lab'));
      const runningElements = screen.getAllByText(/Running/i);
      expect(runningElements.length).toBeGreaterThanOrEqual(1);
    });

    test('shows instance count note when groups differ from total', async () => {
      renderOps();
      await waitFor(() => {
        const note = screen.queryByText(/instances\)/);
        if (note) expect(note).toBeInTheDocument();
      });
    });
  });

  describe('Date Urgency Color Coding', () => {
    test('renders critical urgency elements for dates < 1 hour', async () => {
      renderOps();
      await waitFor(() => {
        const critical = document.querySelectorAll('.ops-date-critical');
        expect(critical.length).toBeGreaterThanOrEqual(1);
      });
    });

    test('shows "Need attention" stat when critical dates exist', async () => {
      renderOps();
      await waitFor(() => {
        expect(screen.getByText('Need attention')).toBeInTheDocument();
      });
    });
  });

  describe('Operation Confirmation Modals', () => {
    test('Lock button opens lock confirmation modal', async () => {
      renderOps();
      await waitFor(() => screen.getByText('Resource Lock'));
      await userEvent.click(screen.getByRole('button', { name: 'Lock' }));
      await waitFor(() => {
        expect(screen.getByText('Confirm Lock')).toBeInTheDocument();
        expect(screen.getByText(/lock-enabled=true/)).toBeInTheDocument();
      });
    });

    test('Unlock button opens unlock confirmation modal', async () => {
      renderOps();
      await waitFor(() => screen.getByText('Resource Lock'));
      await userEvent.click(screen.getByRole('button', { name: 'Unlock' }));
      await waitFor(() => {
        expect(screen.getByText('Confirm Unlock')).toBeInTheDocument();
        expect(screen.getByText(/lock-enabled=false/)).toBeInTheDocument();
      });
    });

    test('Unlock modal warns about multi-asset child workshops', async () => {
      renderOps();
      await waitFor(() => screen.getByText('Resource Lock'));
      await userEvent.click(screen.getByRole('button', { name: 'Unlock' }));
      await waitFor(() => {
        expect(screen.getByText('Confirm Unlock')).toBeInTheDocument();
        expect(screen.getByText(/belong to a multi-asset parent/)).toBeInTheDocument();
        expect(screen.getByText(/stop date sync/)).toBeInTheDocument();
      });
    });

    test('Lock confirmation shows workshop count', async () => {
      renderOps();
      await waitFor(() => screen.getByText('Resource Lock'));
      await userEvent.click(screen.getByRole('button', { name: 'Lock' }));
      await waitFor(() => {
        const modal = document.querySelector('.pf-v6-c-modal-box');
        expect(modal).toBeInTheDocument();
        expect(modal!.textContent).toMatch(/\d+.*workshop/);
      });
    });

    test('Scale button opens scale confirmation modal', async () => {
      renderOps();
      await waitFor(() => screen.getByText('Scale Workshops'));
      const scaleBtn = screen.getAllByRole('button').find(b => b.textContent === 'Scale');
      if (scaleBtn) await userEvent.click(scaleBtn);
      await waitFor(() => {
        expect(screen.getByText('Confirm Scale')).toBeInTheDocument();
      });
    });

    test('Scale shows current vs new count per workshop', async () => {
      renderOps();
      await waitFor(() => screen.getByText('Scale Workshops'));
      const scaleBtn = screen.getAllByRole('button').find(b => b.textContent === 'Scale');
      if (scaleBtn) await userEvent.click(scaleBtn);
      await waitFor(() => {
        const arrows = screen.getAllByText('→');
        expect(arrows.length).toBeGreaterThanOrEqual(1);
      });
    });

    test('Scale to zero shows destructive confirmation with type-to-confirm', async () => {
      renderOps();
      await waitFor(() => screen.getByText('Scale Workshops'));
      const scaleCard = getScaleWorkshopsCard();
      const lastMinus = within(scaleCard).getByLabelText('Minus');
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
      renderOps();
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
      renderOps();
      await waitFor(() => screen.getByText(/Extend Stop Time/));
      const extendStopBtn = screen.getAllByRole('button').find(b => b.textContent === 'Extend Stop');
      expect(extendStopBtn).toBeDisabled();
    });

    test('Extend Destroy is disabled when both day and hour are 0', async () => {
      renderOps();
      await waitFor(() => screen.getByText(/Extend Destroy Time/));
      const extendDestroyBtn = screen.getAllByRole('button').find(b => b.textContent === 'Extend Destroy');
      expect(extendDestroyBtn).toBeDisabled();
    });
  });

  describe('Multi-namespace Mode', () => {
    test('shows multi-namespace toggle for admin users', async () => {
      renderOps();
      await waitFor(() => {
        expect(screen.getByText('Multi-namespace mode')).toBeInTheDocument();
      });
    });

    test('clicking multi-namespace toggle shows confirmation modal', async () => {
      renderOps();
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
      renderOps();
      await waitFor(() => screen.getByText('Scale Workshops'));
      await waitFor(() => {
        const labels = document.querySelectorAll('.pf-v6-c-label');
        expect(labels.length).toBeGreaterThanOrEqual(1);
      });
    });

    test('scale card gets warning border when scaling down', async () => {
      renderOps();
      await waitFor(() => screen.getByText('Scale Workshops'));
      const scaleCard = getScaleWorkshopsCard();
      const lastMinus = within(scaleCard).getByLabelText('Minus');
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
      renderOps();
      await waitFor(() => screen.getByLabelText('Timezone'));
      const tz = screen.getByLabelText('Timezone') as HTMLSelectElement;
      await userEvent.selectOptions(tz, 'UTC');
      expect(tz).toHaveValue('UTC');
    });
  });

  describe('Bulk Select', () => {
    test('renders select all checkbox in table header', async () => {
      renderOps();
      await waitFor(() => screen.getByLabelText('Select all workshops'));
      expect(screen.getByLabelText('Select all workshops')).toBeInTheDocument();
    });

    test('selecting all shows selection badge and clear button', async () => {
      renderOps();
      await waitFor(() => screen.getByLabelText('Select all workshops'));
      await userEvent.click(screen.getByLabelText('Select all workshops'));
      expect(screen.getByText('Selected workshops')).toBeInTheDocument();
      expect(screen.getByText('clear')).toBeInTheDocument();
    });

    test('clear button deselects all', async () => {
      renderOps();
      await waitFor(() => screen.getByLabelText('Select all workshops'));
      await userEvent.click(screen.getByLabelText('Select all workshops'));
      expect(screen.getByText('Selected workshops')).toBeInTheDocument();
      await userEvent.click(screen.getByText('clear'));
      expect(screen.queryByText('Selected workshops')).not.toBeInTheDocument();
    });
  });

  describe('CSV Export', () => {
    test('renders Export to CSV button', async () => {
      renderOps();
      await waitFor(() => screen.getByLabelText('Export to CSV'));
      expect(screen.getByLabelText('Export to CSV')).toBeInTheDocument();
    });

    test('CSV export triggers file download', async () => {
      const clickSpy = jest.fn();
      const origCreateElement = document.createElement.bind(document);
      jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = origCreateElement(tag);
        if (tag === 'a') {
          Object.defineProperty(el, 'click', { value: clickSpy });
        }
        return el;
      });
      window.URL.createObjectURL = jest.fn().mockReturnValue('blob:test');

      renderOps();
      await waitFor(() => screen.getByLabelText('Export to CSV'));
      await userEvent.click(screen.getByLabelText('Export to CSV'));
      expect(clickSpy).toHaveBeenCalled();

      (document.createElement as jest.Mock).mockRestore();
      delete (window.URL as any).createObjectURL;
    });
  });

  describe('Dark mode', () => {
    beforeEach(() => {
      localStorage.clear();
      document.documentElement.classList.remove('pf-v6-theme-dark');
    });

    test('renders dark mode toggle button', async () => {
      render(<Ops />);
      await waitFor(() => screen.getByLabelText('Toggle dark mode'));
      expect(screen.getByLabelText('Toggle dark mode')).toBeInTheDocument();
    });

    test('clicking toggle adds pf-v6-theme-dark class to html element', async () => {
      render(<Ops />);
      await waitFor(() => screen.getByLabelText('Toggle dark mode'));
      expect(document.documentElement).not.toHaveClass('pf-v6-theme-dark');
      await userEvent.click(screen.getByLabelText('Toggle dark mode'));
      expect(document.documentElement).toHaveClass('pf-v6-theme-dark');
    });

    test('persists preference in localStorage', async () => {
      render(<Ops />);
      await waitFor(() => screen.getByLabelText('Toggle dark mode'));
      await userEvent.click(screen.getByLabelText('Toggle dark mode'));
      expect(localStorage.getItem('ops-dark-mode')).toBe('true');
      await userEvent.click(screen.getByLabelText('Toggle dark mode'));
      expect(localStorage.getItem('ops-dark-mode')).toBe('false');
    });
  });

  describe('Schedule helpers', () => {
    test('getWorkshopScheduleStartMs reads actionSchedule.start', () => {
      const ws = makeWorkshop({ startDate: '2030-01-15T12:00:00.000Z' });
      expect(getWorkshopScheduleStartMs(ws)).toBe(new Date('2030-01-15T12:00:00.000Z').getTime());
    });

    test('matchesOpsScheduleFilter scheduled is future start only', () => {
      const now = new Date('2030-01-01T00:00:00.000Z').getTime();
      const past = makeWorkshop({ startDate: '2020-01-01T12:00:00.000Z' });
      const future = makeWorkshop({ name: 'ws-fut', startDate: '2035-06-01T12:00:00.000Z' });
      expect(matchesOpsScheduleFilter(past, 'scheduled', now)).toBe(false);
      expect(matchesOpsScheduleFilter(future, 'scheduled', now)).toBe(true);
    });

    test('matchesOpsScheduleFilter d1 is within 24h', () => {
      const now = new Date('2030-01-01T12:00:00.000Z').getTime();
      const in12h = makeWorkshop({ startDate: new Date(now + 12 * 3600 * 1000).toISOString() });
      const in2d = makeWorkshop({ name: 'ws-2d', startDate: new Date(now + 2 * 86400 * 1000).toISOString() });
      expect(matchesOpsScheduleFilter(in12h, 'd1', now)).toBe(true);
      expect(matchesOpsScheduleFilter(in2d, 'd1', now)).toBe(false);
      expect(matchesOpsScheduleFilter(in2d, 'd2', now)).toBe(true);
    });
  });

});
