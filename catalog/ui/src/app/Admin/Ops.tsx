import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import useSWR from 'swr';
import {
  Alert,
  AlertGroup,
  AlertActionCloseButton,
  AlertVariant,
  Badge,
  Button,
  Card,
  CardBody,
  CardTitle,
  Checkbox,
  EmptyState,
  EmptyStateBody,
  FormSelect,
  FormSelectOption,
  Icon,
  Label,
  NumberInput,
  PageSection,
  Select,
  SelectOption,
  SelectList,
  MenuToggle,
  Modal,
  ModalBody,
  ModalHeader,
  ModalFooter,
  Divider,
  InputGroup,
  InputGroupItem,
  MenuSearch,
  MenuSearchInput,
  Pagination,
  SearchInput,
  Split,
  SplitItem,
  Switch,
  TextInput,
  Tooltip,
  Title,
  ToggleGroup,
  ToggleGroupItem,
} from '@patternfly/react-core';
import LockIcon from '@patternfly/react-icons/dist/js/icons/lock-icon';
import LockOpenIcon from '@patternfly/react-icons/dist/js/icons/lock-open-icon';
import GlobeIcon from '@patternfly/react-icons/dist/js/icons/globe-americas-icon';
import EyeIcon from '@patternfly/react-icons/dist/js/icons/eye-icon';
import EyeSlashIcon from '@patternfly/react-icons/dist/js/icons/eye-slash-icon';
import ExternalLinkAltIcon from '@patternfly/react-icons/dist/js/icons/external-link-alt-icon';
import CheckCircleIcon from '@patternfly/react-icons/dist/js/icons/check-circle-icon';
import InProgressIcon from '@patternfly/react-icons/dist/js/icons/in-progress-icon';
import ExclamationCircleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-circle-icon';
import PauseCircleIcon from '@patternfly/react-icons/dist/js/icons/pause-circle-icon';
import SyncAltIcon from '@patternfly/react-icons/dist/js/icons/sync-alt-icon';
import AngleRightIcon from '@patternfly/react-icons/dist/js/icons/angle-right-icon';
import AngleDownIcon from '@patternfly/react-icons/dist/js/icons/angle-down-icon';
import OutlinedClockIcon from '@patternfly/react-icons/dist/js/icons/outlined-clock-icon';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import DownloadIcon from '@patternfly/react-icons/dist/js/icons/download-icon';
import TableIcon from '@patternfly/react-icons/dist/js/icons/table-icon';
import OutlinedCalendarAltIcon from '@patternfly/react-icons/dist/js/icons/outlined-calendar-alt-icon';
import ListIcon from '@patternfly/react-icons/dist/js/icons/list-icon';
import StarIcon from '@patternfly/react-icons/dist/js/icons/star-icon';

import CogIcon from '@patternfly/react-icons/dist/js/icons/cog-icon';
import MoonIcon from '@patternfly/react-icons/dist/js/icons/moon-icon';
import SunIcon from '@patternfly/react-icons/dist/js/icons/sun-icon';

import {
  apiPaths,
  dateToApiString,
  deleteResourceClaim,
  fetcher,
  lockWorkshop,
  patchWorkshop,
  patchWorkshopProvision,
  scheduleStopForAllResourcesInResourceClaim,
} from '@app/api';
import {
  Workshop, WorkshopList, WorkshopProvision, WorkshopProvisionList,
  WorkshopUserAssignment, WorkshopUserAssignmentList,
  ResourceClaim, ResourceClaimList,
  MultiWorkshop, MultiWorkshopList,
  ServiceNamespace,
} from '@app/types';
import {
  displayName,
  BABYLON_DOMAIN,
  DEMO_DOMAIN,
  getStageFromK8sObject,
  getWhiteGloved,
  namespaceToServiceNamespaceMapper,
} from '@app/util';
import { isWorkshopLocked } from '@app/Workshops/workshops-utils';
import WorkshopStatus from '@app/Workshops/WorkshopStatus';
import ProjectSelector from '@app/components/ProjectSelector';
import useSession from '@app/utils/useSession';
import { Calendar } from 'react-big-calendar';
import {
  workshopCalendarEventStyleGetter,
  workshopCalendarLocalizer,
  workshopToCalendarEventOps,
} from '@app/Admin/workshopCalendarEvents';

import './admin.css';
import './ops.css';
import '!style-loader!css-loader!react-big-calendar/lib/css/react-big-calendar.css';

interface OpsAlert {
  key: number;
  title: string;
  variant: AlertVariant;
  description?: string;
}

export function distributeProvisionCounts(oldCounts: number[], newTotal: number): number[] {
  const n = oldCounts.length;
  if (n === 0) return [];
  const oldSum = oldCounts.reduce((a, b) => a + b, 0);
  if (oldSum === 0) return oldCounts.map(() => 0);
  const exact = oldCounts.map(c => (c * newTotal) / oldSum);
  const floors = exact.map(x => Math.floor(x));
  let rem = newTotal - floors.reduce((a, b) => a + b, 0);
  const order = oldCounts.map((_, i) => i).sort((i, j) => {
    return (exact[j] - floors[j]) - (exact[i] - floors[i]);
  });
  for (const i of order) {
    if (rem <= 0) break;
    floors[i]++;
    rem--;
  }
  return floors;
}

export function workshopProvisionAssignedCount(p: WorkshopProvision): number {
  return (p.status as any)?.assignedCount ?? 0;
}

export function distributeProvisionCountsRespectingAssigned(
  oldCounts: number[],
  targetTotal: number,
  assignedPerProv: number[],
): number[] {
  const base = distributeProvisionCounts(oldCounts, targetTotal);
  const result = base.map((v, i) => Math.max(v, assignedPerProv[i] ?? 0));
  let excess = result.reduce((a, b) => a + b, 0) - targetTotal;
  if (excess > 0) {
    const sorted = result.map((_, i) => i).sort((a, b) => (result[b] - (assignedPerProv[b] ?? 0)) - (result[a] - (assignedPerProv[a] ?? 0)));
    for (const i of sorted) {
      if (excess <= 0) break;
      const canRemove = result[i] - (assignedPerProv[i] ?? 0);
      const remove = Math.min(canRemove, excess);
      result[i] -= remove;
      excess -= remove;
    }
  }
  return result;
}

const COMMON_TIMEZONES = [
  { value: 'local', label: 'Local (browser)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'US Eastern (ET)' },
  { value: 'America/Chicago', label: 'US Central (CT)' },
  { value: 'America/Denver', label: 'US Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'US Pacific (PT)' },
  { value: 'Europe/London', label: 'UK (GMT/BST)' },
  { value: 'Europe/Berlin', label: 'Central Europe (CET)' },
  { value: 'Europe/Madrid', label: 'Spain (CET)' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Asia/Tokyo', label: 'Japan (JST)' },
  { value: 'Australia/Sydney', label: 'Australia Eastern (AEST)' },
];

function seatColorClass(assigned: number, total: number): string {
  if (total <= 0 || assigned <= 0) return '';
  const pct = assigned / total;
  if (pct >= 1) return 'ops-seats-full';
  if (pct >= 0.75) return 'ops-seats-warn';
  return 'ops-seats-ok';
}

const STAGE_FILTERS: { label: string; value: string; color: 'blue' | 'orange' | 'green' | 'purple' }[] = [
  { label: 'prod', value: 'prod', color: 'orange' },
  { label: 'event', value: 'event', color: 'purple' },
  { label: 'dev', value: 'dev', color: 'green' },
  { label: 'test', value: 'test', color: 'blue' },
];

const FETCH_LIMIT = 500;
const ONE_HOUR_MS = 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const ONE_DAY_MS = TWENTY_FOUR_HOURS_MS;
/** ~6 months — matches AutoStopDestroy.tsx (15778800000ms) */
const SIX_MONTHS_MS = 15778800000;

/** Paginate workshop *groups* (rows), not individual asset lines */
const OPS_GROUP_PAGE_DEFAULT = 18;

export type OpsScheduleFilterKey = 'all' | 'scheduled' | 'd1' | 'd2' | 'd3';
export type OpsSortMode = 'start-asc' | 'start-desc' | 'users-desc' | 'name-asc';

/** Start time for sorting / schedule filters: workshop start, lifespan start, or creation time */
export function getWorkshopScheduleStartMs(ws: Workshop): number | null {
  const iso =
    ws.spec?.actionSchedule?.start ||
    ws.spec?.lifespan?.start ||
    ws.metadata?.creationTimestamp;
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

export function matchesOpsScheduleFilter(
  ws: Workshop,
  filter: OpsScheduleFilterKey,
  nowMs: number = Date.now(),
): boolean {
  if (filter === 'all') return true;
  const t = getWorkshopScheduleStartMs(ws);
  if (t === null) return false;
  if (filter === 'scheduled') return t > nowMs;
  if (t <= nowMs) return false;
  if (filter === 'd1') return t <= nowMs + ONE_DAY_MS;
  if (filter === 'd2') return t <= nowMs + 2 * ONE_DAY_MS;
  if (filter === 'd3') return t <= nowMs + 3 * ONE_DAY_MS;
  return true;
}

function compareWorkshopsForSort(
  a: Workshop,
  b: Workshop,
  mode: OpsSortMode,
  getSeats: (w: Workshop) => { assigned: number; total: number } | null,
): number {
  switch (mode) {
    case 'name-asc':
      return displayName(a).localeCompare(displayName(b), undefined, { sensitivity: 'base' });
    case 'users-desc': {
      const sa = getSeats(a)?.assigned ?? 0;
      const sb = getSeats(b)?.assigned ?? 0;
      if (sb !== sa) return sb - sa;
      return displayName(a).localeCompare(displayName(b), undefined, { sensitivity: 'base' });
    }
    case 'start-desc': {
      const ta = getWorkshopScheduleStartMs(a);
      const tb = getWorkshopScheduleStartMs(b);
      const va = ta ?? Number.NEGATIVE_INFINITY;
      const vb = tb ?? Number.NEGATIVE_INFINITY;
      if (vb !== va) return vb - va;
      return displayName(a).localeCompare(displayName(b), undefined, { sensitivity: 'base' });
    }
    case 'start-asc':
    default: {
      const ta = getWorkshopScheduleStartMs(a);
      const tb = getWorkshopScheduleStartMs(b);
      const va = ta ?? Number.POSITIVE_INFINITY;
      const vb = tb ?? Number.POSITIVE_INFINITY;
      if (va !== vb) return va - vb;
      return displayName(a).localeCompare(displayName(b), undefined, { sensitivity: 'base' });
    }
  }
}

const SCHEDULE_FILTER_CHIPS: { label: string; value: OpsScheduleFilterKey }[] = [
  { label: 'All dates', value: 'all' },
  { label: 'Scheduled', value: 'scheduled' },
  { label: '≤1 day', value: 'd1' },
  { label: '≤2 days', value: 'd2' },
  { label: '≤3 days', value: 'd3' },
];

let alertKeyCounter = 0;

function dateUrgency(iso?: string): 'critical' | 'warning' | 'ok' | null {
  if (!iso) return null;
  const remaining = new Date(iso).getTime() - Date.now();
  if (remaining < 0) return 'critical';
  if (remaining < ONE_HOUR_MS) return 'critical';
  if (remaining < TWENTY_FOUR_HOURS_MS) return 'warning';
  return 'ok';
}

function relativeTime(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) {
    const ago = Math.abs(diff);
    if (ago < 60000) return 'just passed';
    if (ago < ONE_HOUR_MS) return `${Math.round(ago / 60000)}m ago`;
    if (ago < TWENTY_FOUR_HOURS_MS) return `${Math.round(ago / ONE_HOUR_MS)}h ago`;
    return `${Math.round(ago / TWENTY_FOUR_HOURS_MS)}d ago`;
  }
  if (diff < 60000) return 'under 1 min';
  if (diff < ONE_HOUR_MS) return `in ${Math.round(diff / 60000)}m`;
  if (diff < TWENTY_FOUR_HOURS_MS) return `in ${Math.round(diff / ONE_HOUR_MS)}h`;
  return `in ${Math.round(diff / TWENTY_FOUR_HOURS_MS)}d`;
}

function wsKey(ws: Workshop): string {
  return `${ws.metadata.namespace}/${ws.metadata.name}`;
}

function wsDetailPath(ws: Workshop): string {
  const ownerRef = ws.metadata?.ownerReferences?.[0];
  if (ownerRef && ownerRef.kind === 'ResourceClaim') {
    return `/services/${ws.metadata.namespace}/${ownerRef.name}/workshop`;
  }
  return `/workshops/${ws.metadata.namespace}/${ws.metadata.name}`;
}

const Ops: React.FC = () => {
  const navigate = useNavigate();
  const { namespace } = useParams();
  const { isAdmin } = useSession().getSession();

  // ---------- Alerts ----------

  const [alerts, setAlerts] = useState<OpsAlert[]>([]);

  const addAlert = useCallback((variant: AlertVariant, title: string, description?: string) => {
    const key = ++alertKeyCounter;
    setAlerts(prev => [{ key, variant, title, description }, ...prev]);
    setTimeout(() => setAlerts(prev => prev.filter(a => a.key !== key)), 8000);
  }, []);

  const removeAlert = useCallback((key: number) => {
    setAlerts(prev => prev.filter(a => a.key !== key));
  }, []);

  // ---------- Multi-namespace mode ----------

  const [multiNsMode, setMultiNsMode] = useState(false);
  const [multiNsAck, setMultiNsAck] = useState(false);
  const [showMultiNsConfirm, setShowMultiNsConfirm] = useState(false);
  const [extraNamespaces, setExtraNamespaces] = useState<string[]>([]);
  const [nsSearchOpen, setNsSearchOpen] = useState(false);
  const [nsSearchText, setNsSearchText] = useState('');

  // ---------- Platform-wide mode ----------

  const [platformMode, setPlatformMode] = useState(false);
  const [showPlatformConfirm, setShowPlatformConfirm] = useState(false);

  // Fetch all user namespaces for multi-ns picker
  const { data: allNsData } = useSWR<{ items: any[] }>(
    multiNsMode ? apiPaths.NAMESPACES({ labelSelector: 'usernamespace.gpte.redhat.com/user-uid' }) : null,
    fetcher,
  );
  const allNamespaces = useMemo<ServiceNamespace[]>(() => {
    if (!allNsData?.items) return [];
    return allNsData.items.map(namespaceToServiceNamespaceMapper);
  }, [allNsData]);

  const filteredNsOptions = useMemo(() => {
    const q = nsSearchText.trim().toLowerCase();
    return allNamespaces
      .filter(ns => ns.name !== namespace && !extraNamespaces.includes(ns.name))
      .filter(ns => !q || ns.name.toLowerCase().includes(q) || (ns.displayName && ns.displayName.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allNamespaces, namespace, extraNamespaces, nsSearchText]);

  const activeNamespaces = useMemo(() => {
    if (platformMode) return [];
    const nsList = namespace ? [namespace] : [];
    if (multiNsMode) nsList.push(...extraNamespaces);
    return nsList;
  }, [namespace, multiNsMode, extraNamespaces, platformMode]);

  const isMultiNs = platformMode || activeNamespaces.length > 1;

  const enableMultiNs = useCallback(() => {
    setMultiNsMode(true);
    setMultiNsAck(true);
    setShowMultiNsConfirm(false);
  }, []);

  const disableMultiNs = useCallback(() => {
    setMultiNsMode(false);
    setMultiNsAck(false);
    setExtraNamespaces([]);
    setNsSearchText('');
    setNsSearchOpen(false);
  }, []);

  const enablePlatformMode = useCallback(() => {
    setPlatformMode(true);
    setShowPlatformConfirm(false);
    setMultiNsMode(false);
    setMultiNsAck(false);
    setExtraNamespaces([]);
    setNsSearchText('');
    setNsSearchOpen(false);
  }, []);

  const disablePlatformMode = useCallback(() => {
    setPlatformMode(false);
  }, []);

  // ---------- Dark mode ----------

  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('ops-dark-mode') === 'true'; } catch { return false; }
  });

  useEffect(() => {
    const el = document.documentElement;
    if (darkMode) {
      el.classList.add('pf-v6-theme-dark');
    } else {
      el.classList.remove('pf-v6-theme-dark');
    }
    return () => { el.classList.remove('pf-v6-theme-dark'); };
  }, [darkMode]);

  const toggleDarkMode = useCallback(() => {
    setDarkMode(prev => {
      const next = !prev;
      try { localStorage.setItem('ops-dark-mode', String(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  // ---------- Timezone ----------

  const [timezone, setTimezone] = useState('local');

  const fmtDate = useCallback((iso?: string) => {
    if (!iso) return null;
    const d = new Date(iso);
    const opts: Intl.DateTimeFormatOptions = {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    };
    if (timezone !== 'local') opts.timeZone = timezone;
    return d.toLocaleString(undefined, opts);
  }, [timezone]);

  // ---------- Data fetching (multi-namespace aware) ----------

  const workshopUrls = useMemo(
    () => platformMode
      ? [apiPaths.WORKSHOPS({ limit: FETCH_LIMIT })]
      : activeNamespaces.map(ns => apiPaths.WORKSHOPS({ namespace: ns, limit: FETCH_LIMIT })),
    [activeNamespaces, platformMode],
  );
  const { data: allWsData, mutate: mutateWorkshops, isValidating: wsValidating } = useSWR<WorkshopList[]>(
    workshopUrls.length > 0 ? workshopUrls : null,
    (urls: string[]) => Promise.all(urls.map(u => fetcher(u) as Promise<WorkshopList>)),
    { refreshInterval: 30000 },
  );
  const workshops = useMemo(() => {
    if (!allWsData) return [];
    return allWsData.flatMap(d => d?.items ?? []);
  }, [allWsData]);

  // Fetch MultiWorkshop resources for multi-asset parent info
  const multiWorkshopUrls = useMemo(
    () => platformMode
      ? [apiPaths.MULTIWORKSHOPS({ limit: 500 })]
      : activeNamespaces.map(ns => apiPaths.MULTIWORKSHOPS({ namespace: ns, limit: 500 })),
    [activeNamespaces, platformMode],
  );
  const { data: allMwData } = useSWR<MultiWorkshopList[]>(
    multiWorkshopUrls.length > 0 ? multiWorkshopUrls : null,
    (urls: string[]) => Promise.all(urls.map(u => fetcher(u) as Promise<MultiWorkshopList>)),
    { refreshInterval: 30000 },
  );
  const multiWorkshopsByName = useMemo(() => {
    const map = new Map<string, MultiWorkshop>();
    if (allMwData) {
      for (const list of allMwData) {
        for (const mw of list?.items ?? []) {
          map.set(`${mw.metadata.namespace}/${mw.metadata.name}`, mw);
        }
      }
    }
    return map;
  }, [allMwData]);

  const provisionKeys = useMemo(
    () => workshops.map(w => apiPaths.WORKSHOP_PROVISIONS({ workshopName: w.metadata.name, namespace: w.metadata.namespace })),
    [workshops],
  );
  const { data: allProvData, mutate: mutateProvisions, isValidating: provValidating } = useSWR<WorkshopProvisionList[]>(
    provisionKeys.length > 0 ? provisionKeys : null,
    (urls: string[]) => Promise.all(urls.map(u => fetcher(u) as Promise<WorkshopProvisionList>)),
    { refreshInterval: 30000 },
  );
  const provisionsByWorkshop = useMemo(() => {
    const map = new Map<string, WorkshopProvision[]>();
    if (allProvData) {
      workshops.forEach((ws, i) => {
        map.set(wsKey(ws), allProvData[i]?.items ?? []);
      });
    }
    return map;
  }, [workshops, allProvData]);

  const getCurrentCount = useCallback((ws: Workshop): number | null => {
    const provs = provisionsByWorkshop.get(wsKey(ws));
    if (!provs || provs.length === 0) return null;
    return provs.reduce((sum, p) => sum + (p.spec?.count ?? 0), 0);
  }, [provisionsByWorkshop]);

  const getFailedCount = useCallback((ws: Workshop): number => {
    const provs = provisionsByWorkshop.get(wsKey(ws));
    if (!provs || provs.length === 0) return 0;
    return provs.reduce((sum, p) => sum + ((p.status as any)?.failedCount ?? 0), 0);
  }, [provisionsByWorkshop]);

  interface ProvisionProgress {
    desired: number;
    claimed: number;
    failed: number;
    concurrency: number;
  }

  const getProvisionProgress = useCallback((ws: Workshop): ProvisionProgress | null => {
    const provs = provisionsByWorkshop.get(wsKey(ws));
    if (!provs || provs.length === 0) return null;
    return {
      desired: provs.reduce((s, p) => s + (p.spec?.count ?? 0), 0),
      claimed: provs.reduce((s, p) => s + ((p.status as any)?.resourceClaimCount ?? 0), 0),
      failed: provs.reduce((s, p) => s + ((p.status as any)?.failedCount ?? 0), 0),
      concurrency: provs.reduce((s, p) => s + (p.spec?.concurrency ?? 1), 0),
    };
  }, [provisionsByWorkshop]);

  const assignmentKeys = useMemo(
    () => workshops.map(w => apiPaths.WORKSHOP_USER_ASSIGNMENTS({ workshopName: w.metadata.name, namespace: w.metadata.namespace })),
    [workshops],
  );
  const { data: allAssignData, mutate: mutateAssignments, isValidating: assignValidating } = useSWR<WorkshopUserAssignmentList[]>(
    assignmentKeys.length > 0 ? assignmentKeys : null,
    (urls: string[]) => Promise.all(urls.map(u => fetcher(u) as Promise<WorkshopUserAssignmentList>)),
    { refreshInterval: 30000 },
  );
  const assignmentsByWorkshop = useMemo(() => {
    const map = new Map<string, WorkshopUserAssignment[]>();
    if (allAssignData) {
      workshops.forEach((ws, i) => {
        map.set(wsKey(ws), allAssignData[i]?.items ?? []);
      });
    }
    return map;
  }, [workshops, allAssignData]);

  const getSeats = useCallback((ws: Workshop): { assigned: number; total: number } | null => {
    const assignments = assignmentsByWorkshop.get(wsKey(ws));
    if (!assignments || assignments.length === 0) return null;
    const assigned = assignments.filter(a => a.spec?.assignment).length;
    return { assigned, total: assignments.length };
  }, [assignmentsByWorkshop]);

  // ResourceClaims per workshop — for real instance-level status (Running / Provisioning / Failed)
  const resourceClaimKeys = useMemo(
    () => workshops.map(w => apiPaths.RESOURCE_CLAIMS({
      namespace: w.metadata.namespace,
      labelSelector: `${BABYLON_DOMAIN}/workshop=${w.metadata.name}`,
      limit: 500,
    })),
    [workshops],
  );
  const { data: allRcData } = useSWR<ResourceClaimList[]>(
    resourceClaimKeys.length > 0 ? resourceClaimKeys : null,
    (urls: string[]) => Promise.all(urls.map(u => fetcher(u) as Promise<ResourceClaimList>)),
    { refreshInterval: 30000 },
  );
  const resourceClaimsByWorkshop = useMemo(() => {
    const map = new Map<string, ResourceClaim[]>();
    if (allRcData) {
      workshops.forEach((ws, i) => {
        map.set(wsKey(ws), allRcData[i]?.items ?? []);
      });
    }
    return map;
  }, [workshops, allRcData]);

  const [showPasswords, setShowPasswords] = useState(false);

  const isRefreshing = wsValidating || provValidating || assignValidating;
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const handleRefresh = useCallback(() => {
    mutateWorkshops();
    mutateProvisions();
    mutateAssignments();
    setLastRefresh(new Date());
  }, [mutateWorkshops, mutateProvisions, mutateAssignments]);

  // ---------- Workshop filter ----------

  const workshopOptions = useMemo(() => {
    const names = new Set(workshops.map(w => displayName(w)));
    return Array.from(names).sort();
  }, [workshops]);

  const [workshopFilter, setWorkshopFilter] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [failedFilter, setFailedFilter] = useState(false);
  const [opsViewMode, setOpsViewMode] = useState<'all' | 'white-glove'>('all');
  const whiteGloveMode = opsViewMode === 'white-glove';
  const [scheduleFilter, setScheduleFilter] = useState<OpsScheduleFilterKey>('all');
  const [sortMode, setSortMode] = useState<OpsSortMode>('start-asc');
  const [tablePage, setTablePage] = useState(1);
  const [tablePerPage, setTablePerPage] = useState(OPS_GROUP_PAGE_DEFAULT);
  const [workshopView, setWorkshopView] = useState<'table' | 'calendar'>('table');

  const targets = useMemo(() => {
    let list = workshops;
    if (workshopFilter) list = list.filter(w => displayName(w) === workshopFilter);
    if (stageFilter) list = list.filter(w => getStageFromK8sObject(w) === stageFilter);
    if (failedFilter) list = list.filter(w => getFailedCount(w) > 0);
    if (whiteGloveMode) list = list.filter(ws => getWhiteGloved(ws));
    if (scheduleFilter !== 'all') list = list.filter(ws => matchesOpsScheduleFilter(ws, scheduleFilter));
    const arr = [...list];
    arr.sort((a, b) => compareWorkshopsForSort(a, b, sortMode, getSeats));
    return arr;
  }, [
    workshops,
    workshopFilter,
    stageFilter,
    failedFilter,
    whiteGloveMode,
    scheduleFilter,
    sortMode,
    getFailedCount,
    getSeats,
  ]);

  const opsCalendarEvents = useMemo(
    () =>
      targets
        .map(ws => workshopToCalendarEventOps(ws, wsDetailPath(ws), isMultiNs))
        .filter(Boolean),
    [targets, isMultiNs],
  );

  const [selectedWs, setSelectedWs] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelectedWs(new Set());
    setTablePage(1);
  }, [workshopFilter, stageFilter, namespace, opsViewMode, scheduleFilter, sortMode, failedFilter, platformMode]);

  useEffect(() => {
    setFailedFilter(false);
  }, [workshopFilter, stageFilter, namespace]);

  const hasSelection = selectedWs.size > 0;
  const operationTargets = useMemo(() => {
    if (!hasSelection) return targets;
    return targets.filter(ws => selectedWs.has(wsKey(ws)));
  }, [targets, selectedWs, hasSelection]);

  const toggleSelectGroup = useCallback((group: { items: Workshop[] }) => {
    setSelectedWs(prev => {
      const next = new Set(prev);
      const groupKeys = group.items.map(ws => wsKey(ws));
      const allGroupSelected = groupKeys.every(k => next.has(k));
      if (allGroupSelected) {
        groupKeys.forEach(k => next.delete(k));
      } else {
        groupKeys.forEach(k => next.add(k));
      }
      return next;
    });
  }, []);

  interface WorkshopGroup {
    name: string;
    items: Workshop[];
    multiWorkshop?: MultiWorkshop;
  }

  const workshopGroups = useMemo(() => {
    const mwGroups = new Map<string, Workshop[]>();
    const standaloneGroups = new Map<string, Workshop[]>();

    for (const ws of targets) {
      const mwSource = ws.metadata.annotations?.[`${BABYLON_DOMAIN}/multiworkshop-source`];
      const mwNs = ws.metadata.namespace;
      if (mwSource) {
        const key = `${mwNs}/${mwSource}`;
        const list = mwGroups.get(key) ?? [];
        list.push(ws);
        mwGroups.set(key, list);
      } else {
        const name = displayName(ws);
        const list = standaloneGroups.get(name) ?? [];
        list.push(ws);
        standaloneGroups.set(name, list);
      }
    }

    const result: WorkshopGroup[] = [];

    // Multi-asset groups first, using the MultiWorkshop displayName as group name
    for (const [key, items] of mwGroups) {
      const mw = multiWorkshopsByName.get(key);
      const name = mw?.spec?.displayName || items[0].metadata.annotations?.[`${BABYLON_DOMAIN}/multiworkshop-source`] || displayName(items[0]);
      result.push({ name, items, multiWorkshop: mw });
    }

    // Standalone groups
    for (const [name, items] of standaloneGroups) {
      result.push({ name, items });
    }

    return result;
  }, [targets, multiWorkshopsByName]);

  const maxTablePage = Math.max(1, Math.ceil(workshopGroups.length / tablePerPage) || 1);
  const safeTablePage = Math.min(tablePage, maxTablePage);

  const pagedWorkshopGroups = useMemo(() => {
    const start = (safeTablePage - 1) * tablePerPage;
    return workshopGroups.slice(start, start + tablePerPage);
  }, [workshopGroups, safeTablePage, tablePerPage]);

  const workshopKeysOnPage = useMemo(() => {
    const keys: string[] = [];
    for (const g of pagedWorkshopGroups) {
      for (const ws of g.items) keys.push(wsKey(ws));
    }
    return keys;
  }, [pagedWorkshopGroups]);

  useEffect(() => {
    if (tablePage > maxTablePage) setTablePage(maxTablePage);
  }, [tablePage, maxTablePage]);

  const allSelected = workshopKeysOnPage.length > 0 && workshopKeysOnPage.every(k => selectedWs.has(k));

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedWs(prev => {
        const next = new Set(prev);
        workshopKeysOnPage.forEach(k => next.delete(k));
        return next;
      });
    } else {
      setSelectedWs(prev => {
        const next = new Set(prev);
        workshopKeysOnPage.forEach(k => next.add(k));
        return next;
      });
    }
  }, [allSelected, workshopKeysOnPage]);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = useCallback((name: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const scopeLabel = useMemo(() => {
    const nsLabel = platformMode ? 'all namespaces (platform)' : isMultiNs ? `${activeNamespaces.length} namespaces` : namespace;
    if (hasSelection) {
      return <>{selectedWs.size} of {targets.length} selected in {nsLabel}</>;
    }
    if (workshopFilter) {
      return <>&ldquo;{workshopFilter}&rdquo; ({targets.length}) in {nsLabel}</>;
    }
    const modePrefix = whiteGloveMode ? 'White glove' : 'All';
    return <>{modePrefix} · {targets.length} workshop{targets.length !== 1 ? 's' : ''} in {nsLabel}</>;
  }, [workshopFilter, targets.length, isMultiNs, activeNamespaces.length, namespace, hasSelection, selectedWs.size, whiteGloveMode, platformMode]);

  // Namespace breakdown for modals
  const namespaceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ws of operationTargets) {
      const ns = ws.metadata.namespace;
      counts.set(ns, (counts.get(ns) ?? 0) + 1);
    }
    return counts;
  }, [operationTargets]);

  const isUnfiltered = !workshopFilter && !stageFilter && !whiteGloveMode && scheduleFilter === 'all';

  const modalScopeDescription = useMemo(() => {
    if (!isMultiNs) {
      return workshopFilter
        ? <> matching &ldquo;{workshopFilter}&rdquo; in <code>{namespace}</code></>
        : <> in <code>{namespace}</code></>;
    }
    return (
      <>
        {workshopFilter ? <> matching &ldquo;{workshopFilter}&rdquo;</> : null}
        {' across '}
        <strong>{namespaceCounts.size} namespace{namespaceCounts.size !== 1 ? 's' : ''}</strong>
        :
        <ul className="ops-ns-breakdown">
          {Array.from(namespaceCounts.entries()).map(([ns, count]) => (
            <li key={ns}><code>{ns}</code> &mdash; {count} workshop{count !== 1 ? 's' : ''}</li>
          ))}
        </ul>
      </>
    );
  }, [isMultiNs, workshopFilter, namespace, namespaceCounts]);

  // ---------- Summary stats ----------

  const effectiveGroups = useMemo(() => {
    if (!hasSelection) return workshopGroups;
    return workshopGroups.filter(g => g.items.some(ws => selectedWs.has(wsKey(ws))));
  }, [workshopGroups, hasSelection, selectedWs]);

  const multiAssetGroupCount = useMemo(() =>
    effectiveGroups.filter(g => g.multiWorkshop).length,
  [effectiveGroups]);

  const effectiveTargets = hasSelection ? operationTargets : targets;

  const summary = useMemo(() => {
    let totalInstances = 0;
    let seatsAssigned = 0;
    let seatsTotal = 0;
    let lockedCount = 0;
    let activeCount = 0;
    let failedCount = 0;
    let attentionCount = 0;
    const failedWorkshops: { name: string; failed: number }[] = [];

    for (const ws of effectiveTargets) {
      const count = getCurrentCount(ws);
      totalInstances += count ?? 1;

      const seats = getSeats(ws);
      if (seats) {
        seatsAssigned += seats.assigned;
        seatsTotal += seats.total;
      }

      if (isWorkshopLocked(ws)) lockedCount++;
      if (seats && seats.assigned > 0) activeCount++;
      const wsFailed = getFailedCount(ws);
      if (wsFailed > 0) {
        failedCount++;
        failedWorkshops.push({ name: displayName(ws), failed: wsFailed });
      }

      const stopUrg = dateUrgency(ws.spec?.actionSchedule?.stop);
      const destroyUrg = dateUrgency(ws.spec?.lifespan?.end);
      if (stopUrg === 'critical' || destroyUrg === 'critical') attentionCount++;
    }

    return { totalInstances, seatsAssigned, seatsTotal, lockedCount, activeCount, failedCount, attentionCount, failedWorkshops };
  }, [effectiveTargets, getCurrentCount, getSeats, getFailedCount]);

  // ---------- Operation parameters ----------

  const [extStopDays, setExtStopDays] = useState(0);
  const [extStopHours, setExtStopHours] = useState(0);
  const [extDestroyDays, setExtDestroyDays] = useState(0);
  const [extDestroyHours, setExtDestroyHours] = useState(0);
  const [scaleCount, setScaleCount] = useState(5);
  const [scaleDownPreference, setScaleDownPreference] = useState<'unused' | 'used'>('unused');

  const [lockLoading, setLockLoading] = useState(false);
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [extStopLoading, setExtStopLoading] = useState(false);
  const [extDestroyLoading, setExtDestroyLoading] = useState(false);
  const [noAutostopLoading, setNoAutostopLoading] = useState(false);
  const [scaleLoading, setScaleLoading] = useState(false);

  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [showUnlockConfirm, setShowUnlockConfirm] = useState(false);
  const [showExtStopConfirm, setShowExtStopConfirm] = useState(false);
  const [showExtDestroyConfirm, setShowExtDestroyConfirm] = useState(false);
  const [showNoAutostopConfirm, setShowNoAutostopConfirm] = useState(false);
  const [showScaleZeroConfirm, setShowScaleZeroConfirm] = useState(false);
  const [showScaleConfirm, setShowScaleConfirm] = useState(false);

  const [scaleConfirmText, setScaleConfirmText] = useState('');

  const anyLoading = lockLoading || unlockLoading || extStopLoading || extDestroyLoading || noAutostopLoading || scaleLoading;

  const scaleAnalysis = useMemo(() => {
    let up = 0, down = 0, same = 0, unknown = 0;
    for (const ws of operationTargets) {
      const cur = getCurrentCount(ws);
      if (cur === null) { unknown++; continue; }
      if (scaleCount > cur) up++;
      else if (scaleCount < cur) down++;
      else same++;
    }
    return { up, down, same, unknown };
  }, [operationTargets, getCurrentCount, scaleCount]);

  const isScaleDown = scaleAnalysis.down > 0;
  const isScaleZero = scaleCount === 0;
  const scaleNeedsConfirmText = isScaleZero || isScaleDown;
  const scaleConfirmWord = isScaleZero ? 'SCALE-TO-ZERO' : 'SCALE-DOWN';
  const scaleConfirmValid = !scaleNeedsConfirmText || scaleConfirmText === scaleConfirmWord;

  // ---------- CSV download ----------

  const handleDownloadCSV = useCallback(() => {
    const csvEsc = (v: string) => {
      if (v.includes(',') || v.includes('"') || v.includes('\n')) return `"${v.replace(/"/g, '""')}"`;
      return v;
    };
    const fmtDateCSV = (iso?: string) => {
      if (!iso) return '';
      const d = new Date(iso);
      const opts: Intl.DateTimeFormatOptions = {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
      };
      if (timezone !== 'local') opts.timeZone = timezone;
      return d.toLocaleString(undefined, opts);
    };

    const header = ['Group', 'Name', 'K8s Name', 'Namespace', 'Stage', 'Locked',
      'Instances', 'Concurrency', 'Seats Assigned', 'Seats Total',
      'Registration', 'Password', 'Auto-Stop', 'Auto-Destroy', 'Workshop URL', 'White glove'];

    const rows: string[][] = [];
    for (const group of workshopGroups) {
      const isMultiAsset = !!group.multiWorkshop;
      const groupLabel = isMultiAsset ? `[Multi-Asset] ${group.name}` : group.name;

      for (const ws of group.items) {
        const locked = isWorkshopLocked(ws);
        const progress = getProvisionProgress(ws);
        const seats = getSeats(ws);
        const password = ws.spec?.accessPassword ?? '';
        const workshopId = ws.metadata.labels?.[`${BABYLON_DOMAIN}/workshop-id`];
        const wsUrl = workshopId ? `https://catalog.demo.redhat.com/workshop/${workshopId}` : '';
        const stop = ws.spec?.actionSchedule?.stop;
        const destroy = ws.spec?.lifespan?.end;
        const stage = getStageFromK8sObject(ws) || '';
        const reg = ws.spec?.openRegistration === false ? 'Closed' : 'Open';
        const assetKey = isMultiAsset ? ws.metadata.annotations?.[`${BABYLON_DOMAIN}/asset-key`] || '' : '';
        const nameLabel = isMultiAsset && assetKey ? `${displayName(ws)} (${assetKey})` : displayName(ws);

        rows.push([
          groupLabel, nameLabel, ws.metadata.name, ws.metadata.namespace, stage,
          locked ? 'Yes' : 'No',
          progress ? String(progress.desired) : '',
          progress ? String(progress.concurrency) : '',
          seats ? String(seats.assigned) : '',
          seats ? String(seats.total) : '',
          reg, password,
          stop ? (
            (new Date(stop).getTime() > Date.now() + SIX_MONTHS_MS ||
              (destroy && new Date(stop).getTime() >= new Date(destroy).getTime()))
              ? 'No auto-stop'
              : fmtDateCSV(stop)
          ) : 'No auto-stop',
          destroy ? fmtDateCSV(destroy) : '',
          wsUrl,
          getWhiteGloved(ws) ? 'Yes' : 'No',
        ]);
      }
    }

    const csv = [header, ...rows].map(r => r.map(csvEsc).join(',')).join('\n');
    const url = window.URL.createObjectURL(new Blob([csv], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.style.display = 'none';
    const ts = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
    link.setAttribute('href', url);
    link.setAttribute('download', `workshops-${namespace || 'multi'}-${ts}.csv`);
    document.body.appendChild(link);
    link.click();
  }, [workshopGroups, timezone, namespace, getProvisionProgress, getSeats, getWhiteGloved]);

  // ---------- Handlers ----------

  const handleLock = async () => {
    setShowLockConfirm(false);
    setLockLoading(true);
    let ok = 0, fail = 0;
    for (const ws of operationTargets) {
      try { await lockWorkshop(ws); ok++; } catch { fail++; }
    }
    setLockLoading(false);
    mutateWorkshops();
    if (fail === 0) addAlert(AlertVariant.success, `Locked ${ok} workshop(s)`);
    else addAlert(AlertVariant.danger, `Lock: ${ok} succeeded, ${fail} failed`);
  };

  const handleUnlock = async () => {
    setShowUnlockConfirm(false);
    setUnlockLoading(true);
    let ok = 0, fail = 0;
    for (const ws of operationTargets) {
      try {
        await patchWorkshop({
          name: ws.metadata.name,
          namespace: ws.metadata.namespace,
          patch: { metadata: { labels: { [`${DEMO_DOMAIN}/lock-enabled`]: 'false' } } },
        });
        ok++;
      } catch { fail++; }
    }
    setUnlockLoading(false);
    mutateWorkshops();
    if (fail === 0) addAlert(AlertVariant.success, `Unlocked ${ok} workshop(s)`);
    else addAlert(AlertVariant.danger, `Unlock: ${ok} succeeded, ${fail} failed`);
  };

  const handleExtendStop = async () => {
    if (extStopDays === 0 && extStopHours === 0) return;
    if (!showExtStopConfirm) { setShowExtStopConfirm(true); return; }
    setShowExtStopConfirm(false);
    setExtStopLoading(true);
    const addMs = (extStopDays * 24 + extStopHours) * 3600_000;
    let ok = 0, fail = 0, skip = 0;
    for (const ws of operationTargets) {
      const currentStop = ws.spec?.actionSchedule?.stop;
      if (!currentStop) { skip++; continue; }
      try {
        const newDate = new Date(new Date(currentStop).getTime() + addMs);
        await patchWorkshop({
          name: ws.metadata.name,
          namespace: ws.metadata.namespace,
          patch: { spec: { actionSchedule: { stop: dateToApiString(newDate) } } },
        });
        ok++;
      } catch { fail++; }
    }
    setExtStopLoading(false);
    mutateWorkshops();
    const skipMsg = skip > 0 ? ` (${skip} skipped — no auto-stop set)` : '';
    if (fail === 0) addAlert(AlertVariant.success, `Extended stop on ${ok} workshop(s) by ${extStopDays}d ${extStopHours}h${skipMsg}`);
    else addAlert(AlertVariant.danger, `Extend stop: ${ok} succeeded, ${fail} failed${skipMsg}`);
  };

  const handleExtendDestroy = async () => {
    if (extDestroyDays === 0 && extDestroyHours === 0) return;
    if (!showExtDestroyConfirm) { setShowExtDestroyConfirm(true); return; }
    setShowExtDestroyConfirm(false);
    setExtDestroyLoading(true);
    const addMs = (extDestroyDays * 24 + extDestroyHours) * 3600_000;
    let ok = 0, fail = 0, skip = 0;
    for (const ws of operationTargets) {
      const currentEnd = ws.spec?.lifespan?.end;
      if (!currentEnd) { skip++; continue; }
      try {
        const newDate = new Date(new Date(currentEnd).getTime() + addMs);
        await patchWorkshop({
          name: ws.metadata.name,
          namespace: ws.metadata.namespace,
          patch: { spec: { lifespan: { end: dateToApiString(newDate) } } },
        });
        ok++;
      } catch { fail++; }
    }
    setExtDestroyLoading(false);
    mutateWorkshops();
    const skipMsg = skip > 0 ? ` (${skip} skipped — no auto-destroy set)` : '';
    if (fail === 0) addAlert(AlertVariant.success, `Extended destroy on ${ok} workshop(s) by ${extDestroyDays}d ${extDestroyHours}h${skipMsg}`);
    else addAlert(AlertVariant.danger, `Extend destroy: ${ok} succeeded, ${fail} failed${skipMsg}`);
  };

  const handleDisableAutostop = async () => {
    if (!showNoAutostopConfirm) { setShowNoAutostopConfirm(true); return; }
    setShowNoAutostopConfirm(false);
    setNoAutostopLoading(true);
    const farFuture = new Date(Date.now() + 365 * 24 * 3600_000);
    let ok = 0, fail = 0;
    for (const ws of operationTargets) {
      try {
        await patchWorkshop({
          name: ws.metadata.name,
          namespace: ws.metadata.namespace,
          patch: { spec: { actionSchedule: { stop: dateToApiString(farFuture) } } },
        });
        const rcResp = await fetcher(apiPaths.RESOURCE_CLAIMS({
          namespace: ws.metadata.namespace,
          labelSelector: `${BABYLON_DOMAIN}/workshop=${ws.metadata.name}`,
          limit: 500,
        })) as ResourceClaimList;
        const liveRCs = (rcResp?.items || []).filter(rc => !rc.metadata?.deletionTimestamp);
        await Promise.all(liveRCs.map(rc => scheduleStopForAllResourcesInResourceClaim(rc, farFuture)));
        ok++;
      } catch { fail++; }
    }
    setNoAutostopLoading(false);
    mutateWorkshops();
    if (fail === 0) addAlert(AlertVariant.success, `Disabled auto-stop on ${ok} workshop(s) — stop pushed to ~1 year`);
    else addAlert(AlertVariant.danger, `Disable auto-stop: ${ok} succeeded, ${fail} failed`);
  };

  const openScaleConfirm = () => {
    setScaleConfirmText('');
    if (scaleCount === 0) setShowScaleZeroConfirm(true);
    else setShowScaleConfirm(true);
  };

  const handleScale = async () => {
    setShowScaleZeroConfirm(false);
    setShowScaleConfirm(false);
    setScaleConfirmText('');
    setScaleLoading(true);
    let ok = 0, fail = 0;
    for (const ws of operationTargets) {
      try {
        const provResp = await fetcher(apiPaths.WORKSHOP_PROVISIONS({
          workshopName: ws.metadata.name,
          namespace: ws.metadata.namespace,
        })) as WorkshopProvisionList;
        const provs = provResp.items;
        const isSingle = provs.length === 1;

        if (isSingle) {
          const prov = provs[0];
          const currentSpecCount = prov.spec?.count ?? 0;
          if (currentSpecCount !== scaleCount) {
            await patchWorkshopProvision({
              name: prov.metadata.name,
              namespace: prov.metadata.namespace,
              patch: { spec: { count: scaleCount } },
            });
          }
        } else if (provs.length > 1) {
          const oldCounts = provs.map(p => p.spec?.count ?? 0);
          const assignedPerProv = provs.map(p => workshopProvisionAssignedCount(p));
          const newCounts = distributeProvisionCountsRespectingAssigned(oldCounts, scaleCount, assignedPerProv);
          for (let i = 0; i < provs.length; i++) {
            if (newCounts[i] !== oldCounts[i]) {
              await patchWorkshopProvision({
                name: provs[i].metadata.name,
                namespace: provs[i].metadata.namespace,
                patch: { spec: { count: newCounts[i] } },
              });
            }
          }
        }

        if (isScaleDown || isScaleZero) {
          const rcResp = await fetcher(apiPaths.RESOURCE_CLAIMS({
            namespace: ws.metadata.namespace,
            labelSelector: `${BABYLON_DOMAIN}/workshop=${ws.metadata.name}`,
            limit: 500,
          })) as ResourceClaimList;
          const liveRcs = rcResp.items.filter(rc => !rc.metadata.deletionTimestamp);

          const totalNewCount = isSingle
            ? scaleCount
            : (() => {
                const oldCounts = provs.map(p => p.spec?.count ?? 0);
                const assignedPerProv = provs.map(p => workshopProvisionAssignedCount(p));
                return distributeProvisionCountsRespectingAssigned(oldCounts, scaleCount, assignedPerProv)
                  .reduce((a, b) => a + b, 0);
              })();

          const excess = liveRcs.length - totalNewCount;
          if (excess > 0) {
            const assignments = assignmentsByWorkshop.get(wsKey(ws)) ?? [];
            const assignedRcNames = new Set(assignments.filter(a => a.spec?.assignment).map(a =>
              a.spec?.resourceClaimName
            ).filter(Boolean));

            const sorted = [...liveRcs].sort((a, b) => {
              const aAssigned = assignedRcNames.has(a.metadata.name) ? 1 : 0;
              const bAssigned = assignedRcNames.has(b.metadata.name) ? 1 : 0;
              return scaleDownPreference === 'unused'
                ? aAssigned - bAssigned
                : bAssigned - aAssigned;
            });

            const toDelete = sorted.slice(0, excess);
            for (const rc of toDelete) {
              try {
                await deleteResourceClaim(rc);
              } catch { /* best-effort */ }
            }
          }
        }

        ok++;
      } catch { fail++; }
    }
    setScaleLoading(false);
    mutateWorkshops();
    mutateProvisions();
    if (fail === 0) addAlert(AlertVariant.success, `Scaled ${ok} workshop(s) to ${scaleCount} instances`);
    else addAlert(AlertVariant.danger, `Scale: ${ok} succeeded, ${fail} failed`);
  };

  // ---------- No namespace selected ----------

  if (!namespace) {
    return (
      <div className="admin-container">
        <PageSection key="header" className="admin-header" variant="default">
          <Split hasGutter style={{ alignItems: 'center' }}>
            <SplitItem>
              <ProjectSelector
                currentNamespaceName={namespace}
                onSelect={(n) => navigate(`/admin/ops/${n.name}`)}
              />
            </SplitItem>
            <SplitItem isFilled>
              <Title headingLevel="h4" style={{ display: 'inline-block', lineHeight: '36px' }}>Operations Workshop Control</Title>
            </SplitItem>
            <SplitItem>
              <Tooltip content={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
                <Button variant="plain" onClick={toggleDarkMode} aria-label="Toggle dark mode">
                  {darkMode ? <SunIcon /> : <MoonIcon />}
                </Button>
              </Tooltip>
            </SplitItem>
          </Split>
        </PageSection>
        <PageSection key="body" className="admin-body" variant="default">
          <EmptyState titleText="Select a namespace" headingLevel="h4">
            <EmptyStateBody>
              Choose a project from the selector above, then perform bulk operations
              on all workshops in that namespace.
            </EmptyStateBody>
          </EmptyState>
        </PageSection>
      </div>
    );
  }

  // ---------- Namespace selected — full UI ----------

  /**
   * Render a date cell. For auto-stop, pass `destroyIso` so we can match the
   * existing AutoStopDestroy.tsx logic: show "No auto-stop" when stop >= destroy
   * or stop is >6 months out.
   */
  const renderDateCell = (iso?: string, offLabel?: string, destroyIso?: string) => {
    if (!iso) {
      if (offLabel) {
        return <Label color="yellow" isCompact icon={<OutlinedClockIcon />}>{offLabel}</Label>;
      }
      return <span className="ops-muted">—</span>;
    }

    const t = new Date(iso).getTime();
    const nowMs = Date.now();

    if (destroyIso) {
      let showNoAutoStop = false;
      if (t > nowMs + SIX_MONTHS_MS) {
        showNoAutoStop = true;
      } else {
        const destroyT = new Date(destroyIso).getTime();
        if (Number.isFinite(destroyT) && t >= destroyT) {
          showNoAutoStop = true;
        }
      }
      if (showNoAutoStop) {
        return (
          <Tooltip content={`Actual: ${fmtDate(iso)} (${relativeTime(iso)})`}>
            <Label color="yellow" isCompact icon={<OutlinedClockIcon />}>{offLabel || 'No auto-stop'}</Label>
          </Tooltip>
        );
      }
    }

    const urgency = dateUrgency(iso);
    const formatted = fmtDate(iso);
    const relative = relativeTime(iso);

    if (urgency === 'critical') {
      return (
        <Tooltip content={`${formatted} — ${relative}`}>
          <span className="ops-date-critical">
            <ExclamationTriangleIcon className="ops-date-icon" />
            {relative}
          </span>
        </Tooltip>
      );
    }
    if (urgency === 'warning') {
      return (
        <Tooltip content={formatted!}>
          <span className="ops-date-warning">
            <OutlinedClockIcon className="ops-date-icon" />
            {relative}
          </span>
        </Tooltip>
      );
    }
    return (
      <Tooltip content={`${formatted} — ${relative}`}>
        <span className="ops-date-ok">{formatted}</span>
      </Tooltip>
    );
  };

  const multiNsBanner = isMultiNs ? (
    <Alert variant="warning" isInline title="Multi-namespace mode active" className="ops-multi-ns-banner">
      Operations will affect workshops across <strong>{activeNamespaces.length}</strong> namespaces.
      Double-check the scope before executing any operation.
    </Alert>
  ) : null;

  return (
    <div className="admin-container">
      <AlertGroup isToast isLiveRegion className="ops-toast-group">
        {alerts.map(a => (
          <Alert
            key={a.key}
            variant={a.variant}
            title={a.title}
            actionClose={<AlertActionCloseButton onClose={() => removeAlert(a.key)} />}
          >
            {a.description && <p>{a.description}</p>}
          </Alert>
        ))}
      </AlertGroup>

      <PageSection key="header" className="admin-header" variant="default">
        <Split hasGutter style={{ alignItems: 'center' }}>
          <SplitItem>
            <ProjectSelector
              currentNamespaceName={namespace}
              onSelect={(n) => { setWorkshopFilter(''); navigate(`/admin/ops/${n.name}`); }}
            />
          </SplitItem>
          <SplitItem isFilled>
            <Title headingLevel="h4" className="ops-page-title">
              <CogIcon className="ops-page-title-icon" />
              Operations Workshop Control
              <code className="ops-page-ns">{namespace}</code>
              {isMultiNs && <Label color="orange" isCompact style={{ marginLeft: 8, verticalAlign: 'middle' }}>+{extraNamespaces.length} NS</Label>}
            </Title>
          </SplitItem>
          <SplitItem>
            <Tooltip content={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
              <Button variant="plain" onClick={toggleDarkMode} aria-label="Toggle dark mode">
                {darkMode ? <SunIcon /> : <MoonIcon />}
              </Button>
            </Tooltip>
          </SplitItem>
          <SplitItem>
            <Tooltip content={`Last refreshed: ${lastRefresh.toLocaleTimeString()}. Auto-refreshes every 30s.`}>
              <Button variant="plain" onClick={handleRefresh} isDisabled={isRefreshing}
                aria-label="Refresh data" className={isRefreshing ? 'ops-spin' : undefined}>
                <SyncAltIcon />
              </Button>
            </Tooltip>
          </SplitItem>
          <SplitItem>
            {workshops.length > 0 && (
              <Label isCompact color={platformMode ? 'orange' : 'blue'}>
                {workshops.length} workshop{workshops.length !== 1 ? 's' : ''}
                {platformMode ? ' (platform-wide)' : isMultiNs ? ` across ${activeNamespaces.length} namespaces` : ''}
              </Label>
            )}
          </SplitItem>
        </Split>
      </PageSection>

      <PageSection key="body" className="admin-body" variant="default">
        {/* View mode + namespace bar */}
        {isAdmin && (
          <div className={`ops-mode-bar ${(multiNsMode || platformMode) ? 'ops-mode-bar--multi-active' : ''}`}>
            <Split hasGutter style={{ alignItems: 'center' }}>
              <SplitItem>
                <Tooltip content={
                  platformMode
                    ? 'Filtering all workshops on the platform'
                    : isMultiNs
                      ? `Filtering workshops across ${activeNamespaces.length} namespaces`
                      : `Filtering workshops in ${namespace}`
                }>
                  <ToggleGroup aria-label="Workshop view mode" isCompact className="ops-view-mode-toggle">
                    <ToggleGroupItem
                      icon={<ListIcon />}
                      text="All Workshops"
                      buttonId="view-all"
                      isSelected={opsViewMode === 'all'}
                      onChange={() => setOpsViewMode('all')}
                    />
                    <ToggleGroupItem
                      icon={<StarIcon />}
                      text="White Glove"
                      buttonId="view-white-glove"
                      isSelected={opsViewMode === 'white-glove'}
                      onChange={() => setOpsViewMode('white-glove')}
                    />
                  </ToggleGroup>
                </Tooltip>
              </SplitItem>
              {!platformMode && (
                <SplitItem>
                  <Tooltip content="Enable to select additional namespaces. Use with caution — operations will span multiple projects.">
                    <Switch
                      id="multi-ns-toggle"
                      label="Multi-namespace mode"
                      isChecked={multiNsMode}
                      onChange={(_e, checked) => {
                        if (checked && !multiNsAck) {
                          setShowMultiNsConfirm(true);
                        } else if (!checked) {
                          disableMultiNs();
                        }
                      }}
                    />
                  </Tooltip>
                </SplitItem>
              )}
              <SplitItem>
                <Tooltip content="Load every workshop across all namespaces on the platform. Use with caution — can be slow and operations affect everything.">
                  <Switch
                    id="platform-mode-toggle"
                    label={<><GlobeIcon /> All Workshops (Platform)</>}
                    isChecked={platformMode}
                    onChange={(_e, checked) => {
                      if (checked) {
                        setShowPlatformConfirm(true);
                      } else {
                        disablePlatformMode();
                      }
                    }}
                  />
                </Tooltip>
              </SplitItem>
              {multiNsMode && !platformMode && (
                <SplitItem isFilled>
                  <Select
                    isOpen={nsSearchOpen}
                    onSelect={(_e, val) => {
                      const ns = val as string;
                      if (ns && !extraNamespaces.includes(ns)) {
                        setExtraNamespaces(prev => [...prev, ns]);
                      }
                      setNsSearchText('');
                    }}
                    onOpenChange={(open) => {
                      setNsSearchOpen(open);
                      if (!open) setNsSearchText('');
                    }}
                    toggle={(toggleRef) => (
                      <MenuToggle ref={toggleRef} onClick={() => setNsSearchOpen(p => !p)} isExpanded={nsSearchOpen} style={{ minWidth: 360 }}>
                        {extraNamespaces.length > 0
                          ? `${extraNamespaces.length} extra namespace${extraNamespaces.length !== 1 ? 's' : ''}`
                          : 'Add namespaces…'}
                      </MenuToggle>
                    )}
                    shouldFocusToggleOnSelect={false}
                  >
                    <MenuSearch>
                      <MenuSearchInput>
                        <InputGroup>
                          <InputGroupItem isFill>
                            <SearchInput
                              value={nsSearchText}
                              placeholder="Type to search namespaces…"
                              onChange={(_e, val) => setNsSearchText(val)}
                              aria-label="Search namespaces"
                            />
                          </InputGroupItem>
                        </InputGroup>
                      </MenuSearchInput>
                    </MenuSearch>
                    <Divider />
                    <SelectList style={{ maxHeight: 280, overflowY: 'auto' }}>
                      {filteredNsOptions.length === 0 ? (
                        <SelectOption isDisabled value="">
                          {nsSearchText ? 'No matching namespaces' : 'Loading…'}
                        </SelectOption>
                      ) : filteredNsOptions.slice(0, 100).map(ns => (
                        <SelectOption key={ns.name} value={ns.name}>
                          {ns.displayName && ns.displayName !== ns.name ? `${ns.displayName} (${ns.name})` : ns.name}
                        </SelectOption>
                      ))}
                    </SelectList>
                  </Select>
                </SplitItem>
              )}
            </Split>
            {multiNsMode && extraNamespaces.length > 0 && (
              <div className="ops-ns-chips">
                <span className="ops-ns-chips-label">Selected:</span>
                <Label isCompact color="blue" style={{ marginRight: 4 }}>{namespace} (primary)</Label>
                {extraNamespaces.map(ns => (
                  <Label key={ns} isCompact color="orange" onClose={() => setExtraNamespaces(prev => prev.filter(n => n !== ns))} style={{ marginRight: 4 }}>
                    {ns}
                  </Label>
                ))}
              </div>
            )}
            {whiteGloveMode && (
              <div className="ops-mode-hint">
                <StarIcon className="ops-mode-hint-icon" />
                Showing only workshops labeled <code>{`${DEMO_DOMAIN}/white-glove=true`}</code>.
                {!isMultiNs && <> Enable multi-namespace mode to aggregate across namespaces.</>}
              </div>
            )}
          </div>
        )}

        {multiNsBanner}

        {workshops.length === 0 ? (
          <EmptyState titleText="No workshops found" headingLevel="h4" status="info">
            <EmptyStateBody>
              No workshops exist in {isMultiNs ? 'the selected namespaces' : <><code>{namespace}</code></>}.
              <br />Deploy workshops first, then return here for bulk operations.
            </EmptyStateBody>
          </EmptyState>
        ) : (
          <>
            {/* Scope + timezone bar */}
            <div className="ops-scope-bar">
              <div className="ops-scope-bar-main">
                <label htmlFor="ops-scope" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                  Workshop
                </label>
                <Select
                  id="ops-scope"
                  isOpen={filterOpen}
                  selected={workshopFilter}
                  onSelect={(_e, val) => { setWorkshopFilter(val as string); setFilterOpen(false); }}
                  onOpenChange={setFilterOpen}
                  toggle={(toggleRef) => (
                    <MenuToggle ref={toggleRef} onClick={() => setFilterOpen(p => !p)} isExpanded={filterOpen} style={{ minWidth: 280 }}>
                      {workshopFilter || 'All Workshops'}
                    </MenuToggle>
                  )}
                  shouldFocusToggleOnSelect
                >
                  <SelectList>
                    <SelectOption value="">All Workshops</SelectOption>
                    {workshopOptions.map(ci => <SelectOption key={ci} value={ci}>{ci}</SelectOption>)}
                  </SelectList>
                </Select>
                <div className="ops-stage-filters">
                  {STAGE_FILTERS.map(f => (
                    <Label
                      key={f.value}
                      color={stageFilter === f.value ? f.color : 'grey'}
                      isCompact
                      onClick={() => setStageFilter(stageFilter === f.value ? null : f.value)}
                      className="ops-stage-chip"
                    >
                      {f.label}
                    </Label>
                  ))}
                </div>
                <span className="ops-scope-summary">
                  {scopeLabel}
                  {hasSelection && (
                    <span style={{ marginLeft: 8 }}>
                      <Badge isRead>{selectedWs.size} selected</Badge>
                      <Button variant="link" isInline style={{ marginLeft: 4, fontSize: '0.78rem' }}
                        onClick={() => setSelectedWs(new Set())}>clear</Button>
                    </span>
                  )}
                </span>
                <span className="ops-scope-spacer" />
                <GlobeIcon style={{ color: 'var(--pf-t--global--text--color--subtle)' }} />
                <FormSelect
                  aria-label="Timezone"
                  value={timezone}
                  onChange={(_e, val) => setTimezone(val)}
                  className="ops-tz-select"
                >
                  {COMMON_TIMEZONES.map(tz => (
                    <FormSelectOption key={tz.value} value={tz.value} label={tz.label} />
                  ))}
                </FormSelect>
              </div>
              <div className="ops-scope-bar-extra">
                <label htmlFor="ops-sort" className="ops-filter-inline-label">Sort</label>
                <FormSelect
                  id="ops-sort"
                  aria-label="Sort workshops"
                  value={sortMode}
                  onChange={(_e, val) => setSortMode(val as OpsSortMode)}
                  className="ops-sort-select"
                >
                  <FormSelectOption value="start-asc" label="Start (oldest first)" />
                  <FormSelectOption value="start-desc" label="Start (newest first)" />
                  <FormSelectOption value="users-desc" label="Most seats assigned" />
                  <FormSelectOption value="name-asc" label="Name (A–Z)" />
                </FormSelect>
                <span className="ops-filter-inline-label">Start window</span>
                <div className="ops-schedule-filters">
                  {SCHEDULE_FILTER_CHIPS.map(c => (
                    <Label
                      key={c.value}
                      color={scheduleFilter === c.value ? 'blue' : 'grey'}
                      isCompact
                      onClick={() => setScheduleFilter(scheduleFilter === c.value && c.value !== 'all' ? 'all' : c.value)}
                      className="ops-schedule-chip"
                    >
                      {c.label}
                    </Label>
                  ))}
                </div>
              </div>
            </div>

            {/* Summary stats */}
            <div className="ops-summary-bar">
              {isMultiNs && (
                <>
                  <div className="ops-stat">
                    <span className="ops-stat-value">{activeNamespaces.length}</span>
                    <span className="ops-stat-label">Namespaces</span>
                  </div>
                  <div className="ops-stat-divider" />
                </>
              )}
              <div className="ops-stat">
                <span className="ops-stat-value">{effectiveTargets.length}</span>
                <span className="ops-stat-label">Workshops</span>
              </div>
              {multiAssetGroupCount > 0 && (
                <>
                  <div className="ops-stat-divider" />
                  <div className="ops-stat">
                    <span className="ops-stat-value">{multiAssetGroupCount}</span>
                    <span className="ops-stat-label">Multi-Asset</span>
                  </div>
                </>
              )}
              <div className="ops-stat-divider" />
              <div className="ops-stat">
                <span className="ops-stat-value">{summary.totalInstances}</span>
                <span className="ops-stat-label">Instances</span>
              </div>
              <div className="ops-stat-divider" />
              <div className="ops-stat">
                <span className="ops-stat-value">
                  <span className={`ops-seats-assigned ${seatColorClass(summary.seatsAssigned, summary.seatsTotal)}`}>
                    {summary.seatsAssigned}
                  </span>
                  {' '}<span className="ops-stat-of">/ {summary.seatsTotal}</span>
                </span>
                <span className="ops-stat-label">Seats filled</span>
              </div>
              <div className="ops-stat-divider" />
              <div className="ops-stat">
                <span className="ops-stat-value">{summary.activeCount}</span>
                <span className="ops-stat-label">Active</span>
              </div>
              {summary.failedCount > 0 && (
                <>
                  <div className="ops-stat-divider" />
                  <Tooltip content={
                    <div>
                      {summary.failedWorkshops.map(fw => (
                        <div key={fw.name}>{fw.name}: {fw.failed} failed</div>
                      ))}
                    </div>
                  }>
                    <div
                      className={`ops-stat ops-stat-attention ${failedFilter ? 'ops-stat-active-filter' : ''}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setFailedFilter(f => !f)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setFailedFilter(f => !f); }}
                    >
                      <span className="ops-stat-value">{summary.failedCount}</span>
                      <span className="ops-stat-label">Failed{failedFilter ? ' (filtered)' : ''}</span>
                    </div>
                  </Tooltip>
                </>
              )}
              <div className="ops-stat-divider" />
              <div className="ops-stat">
                <span className="ops-stat-value">{summary.lockedCount}</span>
                <span className="ops-stat-label">Locked</span>
              </div>
              {summary.attentionCount > 0 && (
                <>
                  <div className="ops-stat-divider" />
                  <div className="ops-stat ops-stat-attention">
                    <span className="ops-stat-value">{summary.attentionCount}</span>
                    <span className="ops-stat-label">Need attention</span>
                  </div>
                </>
              )}
            </div>

            {targets.length === 0 && workshops.length > 0 && (
              <Alert variant="warning" isInline title="No workshops match the current filters" style={{ marginBottom: 16 }}>
                Try another workshop name, stage, white glove mode, start window, or failed filter.
              </Alert>
            )}

            <div className="ops-grid">
              {/* Resource Lock */}
              <Card isFullHeight>
                <CardTitle><LockIcon className="ops-card-icon" /> Resource Lock</CardTitle>
                <CardBody>
                  <p className="ops-desc">
                    Toggle <code>lock-enabled</code> on workshops.
                    Locked resources cannot be modified by non-admin users.
                  </p>
                  <div className="ops-button-row">
                    <Button variant="warning" onClick={() => setShowLockConfirm(true)}
                      isLoading={lockLoading} isDisabled={anyLoading}>Lock</Button>
                    <Button variant="warning" onClick={() => setShowUnlockConfirm(true)}
                      isLoading={unlockLoading} isDisabled={anyLoading}>Unlock</Button>
                  </div>
                </CardBody>
              </Card>

              {/* Extend Stop */}
              <Card isFullHeight>
                <CardTitle>
                  <Tooltip content="Push back the auto-stop time. Workshops can be restarted after stop.">
                    <span><OutlinedClockIcon className="ops-card-icon" /> Extend Stop Time</span>
                  </Tooltip>
                </CardTitle>
                <CardBody>
                  <div className="ops-number-row">
                    <NumberInput value={extStopDays} min={0}
                      onMinus={() => setExtStopDays(Math.max(0, extStopDays - 1))}
                      onPlus={() => setExtStopDays(extStopDays + 1)}
                      onChange={(e) => setExtStopDays(Math.max(0, Number((e.target as HTMLInputElement).value)))}
                      widthChars={3} aria-label="Days" />
                    <span>days</span>
                    <NumberInput value={extStopHours} min={0}
                      onMinus={() => setExtStopHours(Math.max(0, extStopHours - 1))}
                      onPlus={() => setExtStopHours(extStopHours + 1)}
                      onChange={(e) => setExtStopHours(Math.max(0, Number((e.target as HTMLInputElement).value)))}
                      widthChars={3} aria-label="Hours" />
                    <span>hours</span>
                  </div>
                  <Button variant="primary" onClick={handleExtendStop}
                    isLoading={extStopLoading} isDisabled={anyLoading || (extStopDays === 0 && extStopHours === 0)}>
                    Extend Stop
                  </Button>
                </CardBody>
              </Card>

              {/* Extend Destroy */}
              <Card isFullHeight>
                <CardTitle>
                  <Tooltip content="Push back the auto-destroy deadline. Cannot be reversed after the deadline passes.">
                    <span><ExclamationTriangleIcon className="ops-card-icon" /> Extend Destroy Time</span>
                  </Tooltip>
                </CardTitle>
                <CardBody>
                  <div className="ops-number-row">
                    <NumberInput value={extDestroyDays} min={0}
                      onMinus={() => setExtDestroyDays(Math.max(0, extDestroyDays - 1))}
                      onPlus={() => setExtDestroyDays(extDestroyDays + 1)}
                      onChange={(e) => setExtDestroyDays(Math.max(0, Number((e.target as HTMLInputElement).value)))}
                      widthChars={3} aria-label="Days" />
                    <span>days</span>
                    <NumberInput value={extDestroyHours} min={0}
                      onMinus={() => setExtDestroyHours(Math.max(0, extDestroyHours - 1))}
                      onPlus={() => setExtDestroyHours(extDestroyHours + 1)}
                      onChange={(e) => setExtDestroyHours(Math.max(0, Number((e.target as HTMLInputElement).value)))}
                      widthChars={3} aria-label="Hours" />
                    <span>hours</span>
                  </div>
                  <Button variant="primary" onClick={handleExtendDestroy}
                    isLoading={extDestroyLoading} isDisabled={anyLoading || (extDestroyDays === 0 && extDestroyHours === 0)}>
                    Extend Destroy
                  </Button>
                </CardBody>
              </Card>

              {/* Disable Auto-Stop */}
              <Card isFullHeight>
                <CardTitle>
                  <Tooltip content="Remove the auto-stop schedule so workshops keep running until destroy or manual intervention.">
                    <span><PauseCircleIcon className="ops-card-icon" /> Disable Auto-Stop</span>
                  </Tooltip>
                </CardTitle>
                <CardBody>
                  <p className="ops-desc">
                    Removes <code>actionSchedule.stop</code> so workshops remain running
                    until their destroy deadline or manual stop.
                  </p>
                  <Button variant="warning" onClick={handleDisableAutostop}
                    isLoading={noAutostopLoading} isDisabled={anyLoading}>
                    Disable Auto-Stop
                  </Button>
                </CardBody>
              </Card>

              {/* Scale */}
              <Card isFullHeight className={isScaleDown || isScaleZero ? 'ops-scale-danger' : undefined}>
                <CardTitle><SyncAltIcon className="ops-card-icon" /> Scale Workshops</CardTitle>
                <CardBody>
                  <p className="ops-desc">
                    Sets <code>spec.count</code> to the value below.
                    This <strong>replaces</strong> the current instance count.
                  </p>
                  <div className="ops-number-row">
                    <NumberInput value={scaleCount} min={0}
                      onMinus={() => setScaleCount(Math.max(0, scaleCount - 1))}
                      onPlus={() => setScaleCount(scaleCount + 1)}
                      onChange={(e) => setScaleCount(Math.max(0, Number((e.target as HTMLInputElement).value)))}
                      widthChars={4} aria-label="New instance count" />
                    <span>new instance count</span>
                  </div>
                  {scaleAnalysis.up > 0 && <Label color="blue" isCompact style={{ marginRight: 4 }}>{scaleAnalysis.up} scale up</Label>}
                  {scaleAnalysis.down > 0 && <Label color="orange" isCompact style={{ marginRight: 4 }}>{scaleAnalysis.down} scale down</Label>}
                  {scaleAnalysis.same > 0 && <Label color="grey" isCompact style={{ marginRight: 4 }}>{scaleAnalysis.same} no change</Label>}
                  {(isScaleDown || isScaleZero) && (
                    <div style={{ marginTop: 12 }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Remove preference</label>
                      <FormSelect
                        aria-label="Scale down preference"
                        value={scaleDownPreference}
                        onChange={(_e, val) => setScaleDownPreference(val as 'unused' | 'used')}
                        className="ops-scale-pref-select"
                      >
                        <FormSelectOption value="unused" label="Unused instances first (safest)" />
                        <FormSelectOption value="used" label="Used instances first (DANGEROUS)" />
                      </FormSelect>
                    </div>
                  )}
                  <div style={{ marginTop: 12 }}>
                    <Button variant={isScaleZero ? 'danger' : isScaleDown ? 'warning' : 'primary'}
                      onClick={openScaleConfirm}
                      isLoading={scaleLoading} isDisabled={anyLoading}>
                      {isScaleZero ? 'Scale to Zero' : isScaleDown ? 'Scale Down' : 'Scale'}
                    </Button>
                  </div>
                </CardBody>
              </Card>
            </div>

            {/* Workshop detail table */}
            <div className="ops-workshops-section">
              <Split hasGutter style={{ marginBottom: 12 }}>
                <SplitItem isFilled>
                  <Title headingLevel="h5">
                    {hasSelection ? 'Selected workshops' : 'Workshops in scope'}
                    <Badge isRead style={{ marginLeft: 8 }}>{hasSelection ? selectedWs.size : workshopGroups.length}</Badge>
                    {!hasSelection && maxTablePage > 1 && (
                      <span style={{ marginLeft: 6, fontSize: '0.78rem', color: 'var(--pf-t--global--text--color--subtle)' }}>
                        page {safeTablePage} of {maxTablePage} ({pagedWorkshopGroups.length} groups shown)
                      </span>
                    )}
                    {!hasSelection && workshopGroups.length !== targets.length && (
                      <span style={{ marginLeft: 6, fontSize: '0.78rem', color: 'var(--pf-t--global--text--color--subtle)' }}>
                        ({targets.length} instances)
                      </span>
                    )}
                    {hasSelection && selectedWs.size !== targets.length && (
                      <span style={{ marginLeft: 6, fontSize: '0.78rem', color: 'var(--pf-t--global--text--color--subtle)' }}>
                        of {targets.length} total
                      </span>
                    )}
                  </Title>
                </SplitItem>
                <SplitItem>
                  <ToggleGroup aria-label="Workshop list view" isCompact className="ops-view-toggle">
                    <ToggleGroupItem
                      icon={<TableIcon />}
                      text="Table"
                      isSelected={workshopView === 'table'}
                      onChange={(_e, selected) => {
                        if (selected) setWorkshopView('table');
                      }}
                    />
                    <ToggleGroupItem
                      icon={<OutlinedCalendarAltIcon />}
                      text="Calendar"
                      isSelected={workshopView === 'calendar'}
                      onChange={(_e, selected) => {
                        if (selected) setWorkshopView('calendar');
                      }}
                    />
                  </ToggleGroup>
                </SplitItem>
                {workshopView === 'table' && (
                  <SplitItem>
                    <Button variant="plain" onClick={() => setShowPasswords(p => !p)}
                      aria-label={showPasswords ? 'Hide passwords' : 'Show passwords'}>
                      {showPasswords ? <EyeSlashIcon /> : <EyeIcon />}
                      <span style={{ marginLeft: 6, fontSize: '0.85rem' }}>{showPasswords ? 'Hide passwords' : 'Show passwords'}</span>
                    </Button>
                  </SplitItem>
                )}
                <SplitItem>
                  <Tooltip content="Export to CSV">
                    <Button icon={<DownloadIcon />} variant="plain" onClick={handleDownloadCSV}
                      aria-label="Export to CSV" isDisabled={workshopGroups.length === 0} />
                  </Tooltip>
                </SplitItem>
              </Split>
              {workshopView === 'table' && workshopGroups.length > 0 && (
                <Pagination
                  className="ops-table-pagination"
                  itemCount={workshopGroups.length}
                  page={safeTablePage}
                  perPage={tablePerPage}
                  onSetPage={(_e, p) => setTablePage(p)}
                  onPerPageSelect={(_e, _pp, p) => { setTablePerPage(p); setTablePage(1); }}
                  perPageOptions={[
                    { title: '15', value: 15 },
                    { title: '18', value: 18 },
                    { title: '20', value: 20 },
                    { title: '50', value: 50 },
                  ]}
                  variant="top"
                  isCompact
                  titles={{ items: 'Workshop groups', itemsPerPage: 'Groups per page' }}
                />
              )}
              {workshopView === 'calendar' && (
                <p className="ops-calendar-hint">
                  Same filters as the table. Click an event to open the workshop. Uses start from{' '}
                  <code>actionSchedule.start</code> or <code>lifespan.start</code> (shared with Scheduled Workshops).
                </p>
              )}
              {workshopView === 'calendar' && (
                <div className="ops-calendar-panel">
                  {opsCalendarEvents.length === 0 ? (
                    <EmptyState titleText="Nothing to show on the calendar" headingLevel="h5">
                      <EmptyStateBody>
                        No workshops in the current scope have a start time set, or filters exclude them.
                        Adjust filters or switch to the table view.
                      </EmptyStateBody>
                    </EmptyState>
                  ) : (
                    <Calendar
                      localizer={workshopCalendarLocalizer}
                      events={opsCalendarEvents}
                      startAccessor="start"
                      endAccessor="end"
                      style={{ height: 640 }}
                      onSelectEvent={ev => navigate(ev.url)}
                      eventPropGetter={workshopCalendarEventStyleGetter}
                      showAllEvents
                      showMultiDayTimes
                    />
                  )}
                </div>
              )}
              {workshopView === 'table' && (
              <div className="ops-table-wrap">
                <table className="pf-v6-c-table pf-m-compact pf-m-grid-md" role="grid">
                  <thead>
                    <tr>
                      <th style={{ width: 32 }}>
                        <Checkbox id="select-all-ws" isChecked={allSelected} onChange={toggleSelectAll}
                          aria-label={maxTablePage > 1 ? 'Select all workshops on this page' : 'Select all workshops'} />
                      </th>
                      <th></th>
                      <th>Name</th>
                      <th>Status</th>
                      <th>Lock</th>
                      <th>Assets</th>
                      <th>Instances</th>
                      <th>Concurrency</th>
                      <th>Seats</th>
                      <th>Registration</th>
                      <th>Password</th>
                      <th>Auto-Stop</th>
                      <th>Auto-Destroy</th>
                      <th>Workshop URL</th>
                      <th className="ops-col-white-glove">White glove</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedWorkshopGroups.map(group => {
                      const expanded = expandedGroups.has(group.name);
                      const isSingle = group.items.length === 1 && !group.multiWorkshop;
                      const isMultiAsset = !!group.multiWorkshop;
                      const firstWs = group.items[0];
                      const firstStage = getStageFromK8sObject(firstWs);
                      const mw = group.multiWorkshop;
                      const mwAssetCount = mw?.spec?.assets?.length ?? group.items.length;
                      const mwNumberSeats = mw?.spec?.numberSeats;

                      // Aggregate stats for the group header
                      let grpInstances = 0;
                      let grpSeatsAssigned = 0;
                      let grpSeatsTotal = 0;
                      let grpLocked = 0;
                      let grpActive = 0;
                      let grpStopped = 0;
                      let grpFailed = 0;
                      let grpDesired = 0;
                      let grpClaimed = 0;
                      let grpFailedCount = 0;
                      let grpConcurrency = 0;
                      let grpAttention = false;
                      const grpPasswords = new Map<string, string>();
                      const grpNamespaces = new Set<string>();
                      const grpUrls: { id: string; url: string }[] = [];
                      let grpWhiteGlove = 0;

                      for (const ws of group.items) {
                        const c = getCurrentCount(ws);
                        grpInstances += c ?? 1;
                        const s = getSeats(ws);
                        if (s) { grpSeatsAssigned += s.assigned; grpSeatsTotal += s.total; }
                        if (isWorkshopLocked(ws)) grpLocked++;
                        if (s && s.assigned > 0) grpActive++;
                        if (ws.spec?.provisionDisabled) grpStopped++;
                        const prog = getProvisionProgress(ws);
                        if (prog) {
                          if (prog.failed > 0) grpFailed++;
                          grpDesired += prog.desired;
                          grpClaimed += prog.claimed;
                          grpFailedCount += prog.failed;
                          grpConcurrency += prog.concurrency;
                        }
                        if (dateUrgency(ws.spec?.actionSchedule?.stop) === 'critical' || dateUrgency(ws.spec?.lifespan?.end) === 'critical') grpAttention = true;
                        if (ws.spec?.accessPassword) {
                          const assetKey = ws.metadata.labels?.[`${BABYLON_DOMAIN}/asset-key`] || displayName(ws);
                          grpPasswords.set(assetKey, ws.spec.accessPassword);
                        }
                        grpNamespaces.add(ws.metadata.namespace);
                        const wid = ws.metadata.labels?.[`${BABYLON_DOMAIN}/workshop-id`];
                        if (wid) grpUrls.push({ id: wid, url: `${window.location.origin}/workshop/${wid}` });
                        if (getWhiteGloved(ws)) grpWhiteGlove++;
                      }

                      const stageColor = firstStage === 'dev' ? 'green' as const : firstStage === 'event' ? 'purple' as const : firstStage === 'test' ? 'blue' as const : firstStage === 'prod' ? 'orange' as const : 'grey' as const;
                      const mwDetailPath = mw ? `/multi-workshop/${mw.metadata.namespace}/${mw.metadata.name}` : null;

                      const groupKeys = group.items.map(ws => wsKey(ws));
                      const grpAllSelected = groupKeys.every(k => selectedWs.has(k));
                      const grpSomeSelected = !grpAllSelected && groupKeys.some(k => selectedWs.has(k));

                      const headerRow = (
                        <tr key={`grp-${group.name}`}
                          className={`ops-group-header ${isMultiAsset ? 'ops-multi-asset-header' : ''} ${grpAttention ? 'ops-row-attention' : ''} ${grpStopped === group.items.length ? 'ops-row-stopped' : ''}`}
                          onClick={group.items.length > 1 || isMultiAsset ? () => toggleGroup(group.name) : undefined}
                          style={group.items.length > 1 || isMultiAsset ? { cursor: 'pointer' } : undefined}
                        >
                          <td onClick={e => e.stopPropagation()}>
                            <Checkbox id={`select-grp-${group.name}`}
                              isChecked={grpAllSelected ? true : grpSomeSelected ? null : false}
                              onChange={() => toggleSelectGroup(group)}
                              aria-label={`Select ${group.name}`} />
                          </td>
                          <td className="ops-expand-cell">
                            {(group.items.length > 1 || isMultiAsset) && (
                              expanded ? <AngleDownIcon className="ops-expand-icon" /> : <AngleRightIcon className="ops-expand-icon" />
                            )}
                          </td>
                          <td>
                            {isMultiAsset && mwDetailPath ? (
                              <Link to={mwDetailPath} className="ops-ws-name-link" onClick={e => e.stopPropagation()}>
                                <strong>{group.name}</strong>
                              </Link>
                            ) : isSingle ? (
                              <Link to={wsDetailPath(firstWs)} className="ops-ws-name-link"><strong>{group.name}</strong></Link>
                            ) : (
                              <strong>{group.name}</strong>
                            )}
                            {!isSingle && !isMultiAsset && <Badge isRead style={{ marginLeft: 6 }}>{group.items.length}</Badge>}
                            {isSingle && <Link to={wsDetailPath(firstWs)} className="ops-ws-meta">{firstWs.metadata.name}</Link>}
                            <span className="ops-ws-labels">
                              {firstStage && <Label isCompact color={stageColor}>{firstStage}</Label>}
                              {isMultiNs && Array.from(grpNamespaces).map(ns => (
                                <Label key={ns} isCompact color={
                                  ns.includes('.prod') ? 'orange' : ns.includes('.event') ? 'purple' : ns.includes('.dev') ? 'green' : 'blue'
                                }>{ns}</Label>
                              ))}
                              {isMultiAsset && (
                                <Label isCompact color="teal">Multi-Asset</Label>
                              )}
                            </span>
                          </td>
                          <td className="ops-status-cell">
                            {grpStopped === group.items.length ? (
                              <><Icon status="danger"><PauseCircleIcon /></Icon><span style={{ marginLeft: 6, fontSize: '0.85rem' }}>Stopped</span></>
                            ) : (() => {
                              const grpClaims = group.items.flatMap(ws => resourceClaimsByWorkshop.get(wsKey(ws)) ?? []);
                              return grpClaims.length > 0
                                ? <WorkshopStatus resourceClaims={grpClaims} />
                                : grpDesired > 0
                                  ? <><Icon status="info"><InProgressIcon /></Icon><span style={{ marginLeft: 6, fontSize: '0.85rem' }}>Provisioning {grpClaimed}/{grpDesired}</span></>
                                  : <><Icon status="info"><InProgressIcon /></Icon><span style={{ marginLeft: 6, fontSize: '0.85rem' }}>Pending</span></>;
                            })()}
                          </td>
                          <td>
                            {grpLocked > 0 ? (
                              <Tooltip content={isMultiAsset
                                ? `${grpLocked}/${group.items.length} locked — dates sync with parent when locked`
                                : `${grpLocked} of ${group.items.length} locked`}>
                                <Icon status="warning"><LockIcon /></Icon>
                              </Tooltip>
                            ) : (
                              <Icon status="success"><LockOpenIcon /></Icon>
                            )}
                          </td>
                          <td>
                            {isMultiAsset ? (
                              <Tooltip content={`${mwAssetCount} assets, ${group.items.length} provisioned`}>
                                <strong>{mwAssetCount}</strong>
                              </Tooltip>
                            ) : <span className="ops-muted">&mdash;</span>}
                          </td>
                          <td><strong>{grpInstances}</strong></td>
                          <td>{grpConcurrency > 0 ? grpConcurrency : <span className="ops-muted">&mdash;</span>}</td>
                          <td>
                            {isMultiAsset && mwNumberSeats ? (
                              <Tooltip content="MultiWorkshop numberSeats">
                                <strong>{mwNumberSeats}</strong>
                              </Tooltip>
                            ) : grpSeatsTotal > 0 ? (
                              <span>
                                <strong className={seatColorClass(grpSeatsAssigned, grpSeatsTotal)}>{grpSeatsAssigned}</strong>
                                {' '}/ {grpSeatsTotal}
                              </span>
                            ) : <span className="ops-muted">&mdash;</span>}
                          </td>
                          <td>
                            {firstWs.spec?.openRegistration !== false ? (
                              <Label color="green" isCompact>Open</Label>
                            ) : (
                              <Label color="blue" isCompact>Pre-registration</Label>
                            )}
                          </td>
                          <td>
                            {isMultiAsset && grpPasswords.size > 1 ? (
                              showPasswords
                                ? <span className="ops-password-multi">{Array.from(grpPasswords.entries()).map(([k, v]) =>
                                    <span key={k}><code className="ops-password">{k}: {v}</code></span>
                                  )}</span>
                                : <span className="ops-password-hidden">••• ({grpPasswords.size} passwords)</span>
                            ) : grpPasswords.size === 1 ? (
                              showPasswords
                                ? <code className="ops-password">{Array.from(grpPasswords.values())[0]}</code>
                                : <span className="ops-password-hidden">••••••••</span>
                            ) : <span className="ops-muted">None</span>}
                          </td>
                          <td>{renderDateCell(firstWs.spec?.actionSchedule?.stop, 'No auto-stop', firstWs.spec?.lifespan?.end)}</td>
                          <td>{renderDateCell(firstWs.spec?.lifespan?.end)}</td>
                          <td>
                            {isMultiAsset && mw ? (
                              <a href={`${window.location.origin}/event/${mw.metadata.namespace}/${mw.metadata.name}`}
                                target="_blank" rel="noopener noreferrer" className="ops-ws-link"
                                onClick={e => e.stopPropagation()}>
                                <ExternalLinkAltIcon style={{ marginRight: 4 }} />Event page
                              </a>
                            ) : grpUrls.length > 0 ? (
                              <a href={grpUrls[0].url} target="_blank" rel="noopener noreferrer" className="ops-ws-link">
                                <ExternalLinkAltIcon style={{ marginRight: 4 }} />
                                {grpUrls[0].id}
                              </a>
                            ) : <span className="ops-muted">&mdash;</span>}
                          </td>
                          <td className="ops-wg-cell">
                            {grpWhiteGlove === 0 ? (
                              <span className="ops-muted">&mdash;</span>
                            ) : grpWhiteGlove === group.items.length ? (
                              <Label isCompact color="yellow">Yes</Label>
                            ) : (
                              <Tooltip content={`${grpWhiteGlove} of ${group.items.length} assets`}>
                                <span><Label isCompact color="orange">{grpWhiteGlove}/{group.items.length}</Label></span>
                              </Tooltip>
                            )}
                          </td>
                        </tr>
                      );

                      if ((isSingle && !isMultiAsset) || !expanded) return headerRow;

                      const childRows = group.items.map(ws => {
                        const locked = isWorkshopLocked(ws);
                        const currentCount = getCurrentCount(ws);
                        const seats = getSeats(ws);
                        const password = ws.spec?.accessPassword;
                        const workshopId = ws.metadata.labels?.[`${BABYLON_DOMAIN}/workshop-id`];
                        const workshopUrl = workshopId ? `${window.location.origin}/workshop/${workshopId}` : null;
                        const provDisabled = ws.spec?.provisionDisabled === true;
                        const wsClaims = resourceClaimsByWorkshop.get(wsKey(ws)) ?? [];
                        const progress = getProvisionProgress(ws);
                        const assetKey = ws.metadata.labels?.[`${BABYLON_DOMAIN}/asset-key`];

                        return (
                          <tr key={wsKey(ws)} className={`ops-child-row ${isMultiAsset ? 'ops-asset-row' : ''}`}>
                            <td>
                              <Checkbox id={`select-ws-${ws.metadata.name}`}
                                isChecked={selectedWs.has(wsKey(ws))}
                                onChange={() => setSelectedWs(prev => {
                                  const next = new Set(prev);
                                  const k = wsKey(ws);
                                  next.has(k) ? next.delete(k) : next.add(k);
                                  return next;
                                })}
                                aria-label={`Select ${ws.metadata.name}`} />
                            </td>
                            <td></td>
                            <td>
                              {isMultiAsset && assetKey && (
                                <Label isCompact color="teal" style={{ marginRight: 6 }}>{assetKey}</Label>
                              )}
                              <Link to={wsDetailPath(ws)} className="ops-ws-meta">{displayName(ws)}</Link>
                              <span className="ops-ws-meta" style={{ marginLeft: 4, opacity: 0.5, fontSize: '0.75rem' }}>{ws.metadata.name}</span>
                              {isMultiNs && (
                                <span className="ops-ws-labels" style={{ marginLeft: 8 }}>
                                  <Label isCompact color={
                                    ws.metadata.namespace.includes('.prod') ? 'orange' :
                                    ws.metadata.namespace.includes('.event') ? 'purple' :
                                    ws.metadata.namespace.includes('.dev') ? 'green' : 'blue'
                                  }>{ws.metadata.namespace}</Label>
                                </span>
                              )}
                            </td>
                            <td className="ops-status-cell">
                              {provDisabled ? (
                                <><Icon status="danger"><PauseCircleIcon /></Icon><span style={{ marginLeft: 6, fontSize: '0.85rem' }}>Stopped</span></>
                              ) : wsClaims.length > 0 ? (
                                <WorkshopStatus resourceClaims={wsClaims} />
                              ) : progress && progress.desired > 0 ? (
                                <><Icon status="info"><InProgressIcon /></Icon><span style={{ marginLeft: 6, fontSize: '0.85rem' }}>Provisioning {progress.claimed}/{progress.desired}</span></>
                              ) : (
                                <><Icon status="warning"><ExclamationCircleIcon /></Icon><span style={{ marginLeft: 6, fontSize: '0.85rem' }}>No provisions</span></>
                              )}
                            </td>
                            <td>
                              {locked ? (
                                <Tooltip content={isMultiAsset ? 'Locked — dates sync with parent schedule' : 'Locked'}>
                                  <Icon status="warning"><LockIcon /></Icon>
                                </Tooltip>
                              ) : (
                                <Tooltip content={isMultiAsset ? 'Unlocked — date sync with parent is OFF' : 'Unlocked'}>
                                  <Icon status={isMultiAsset ? 'danger' : 'success'}>{isMultiAsset ? <ExclamationTriangleIcon /> : <LockOpenIcon />}</Icon>
                                </Tooltip>
                              )}
                            </td>
                            <td><span className="ops-muted">&mdash;</span></td>
                            <td>{currentCount !== null ? <strong>{currentCount}</strong> : <span className="ops-muted">&mdash;</span>}</td>
                            <td>{progress?.concurrency ?? <span className="ops-muted">&mdash;</span>}</td>
                            <td>
                              {seats ? (
                                <span>
                                  <strong className={seatColorClass(seats.assigned, seats.total)}>{seats.assigned}</strong>
                                  {' '}/ {seats.total}
                                </span>
                              ) : <span className="ops-muted">&mdash;</span>}
                            </td>
                            <td></td>
                            <td>
                              {password ? (
                                showPasswords
                                  ? <code className="ops-password">{password}</code>
                                  : <span className="ops-password-hidden">••••••••</span>
                              ) : <span className="ops-muted">None</span>}
                            </td>
                            <td>{renderDateCell(ws.spec?.actionSchedule?.stop, 'No auto-stop', ws.spec?.lifespan?.end)}</td>
                            <td>{renderDateCell(ws.spec?.lifespan?.end)}</td>
                            <td>
                              {workshopUrl ? (
                                <a href={workshopUrl} target="_blank" rel="noopener noreferrer" className="ops-ws-link">
                                  <ExternalLinkAltIcon style={{ marginRight: 4 }} />
                                  {workshopId}
                                </a>
                              ) : <span className="ops-muted">&mdash;</span>}
                            </td>
                            <td className="ops-wg-cell">
                              {getWhiteGloved(ws) ? (
                                <Label isCompact color="yellow">Yes</Label>
                              ) : (
                                <span className="ops-muted">&mdash;</span>
                              )}
                            </td>
                          </tr>
                        );
                      });

                      return <React.Fragment key={`grp-f-${group.name}`}>{headerRow}{childRows}</React.Fragment>;
                    })}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          </>
        )}
      </PageSection>

      {/* ---------- Multi-namespace acknowledgement ---------- */}

      <Modal variant="small" isOpen={showMultiNsConfirm} onClose={() => setShowMultiNsConfirm(false)} aria-labelledby="multi-ns-confirm">
        <ModalHeader title="Enable Multi-Namespace Mode" labelId="multi-ns-confirm" titleIconVariant="warning" />
        <ModalBody>
          <Alert variant="warning" isInline title="Cross-namespace operations" style={{ marginBottom: 12 }}>
            <p>This mode allows you to select <strong>multiple namespaces</strong> and run operations across all of them simultaneously.</p>
          </Alert>
          <p>This is intended for large-scale events (e.g., Summit) where workshops span multiple projects. Mistakes in this mode can affect production workshops across many namespaces.</p>
          <p style={{ marginTop: 12, fontWeight: 600 }}>Please confirm you understand the risks:</p>
          <ul style={{ marginTop: 8, paddingLeft: 20 }}>
            <li>All operations (lock, extend, scale, etc.) apply across <strong>every</strong> selected namespace</li>
            <li>Confirmation modals will show namespace breakdowns before execution</li>
            <li>You can disable this mode at any time to return to single-namespace</li>
          </ul>
        </ModalBody>
        <ModalFooter>
          <Button variant="warning" onClick={enableMultiNs}>I understand, enable multi-namespace</Button>
          <Button variant="link" onClick={() => setShowMultiNsConfirm(false)}>Cancel</Button>
        </ModalFooter>
      </Modal>

      {/* ---------- Platform-wide mode acknowledgement ---------- */}

      <Modal variant="small" isOpen={showPlatformConfirm} onClose={() => setShowPlatformConfirm(false)} aria-labelledby="platform-confirm">
        <ModalHeader title="Enable Platform-Wide Mode" labelId="platform-confirm" titleIconVariant="danger" />
        <ModalBody>
          <Alert variant="danger" isInline title="All namespaces on the platform" style={{ marginBottom: 12 }}>
            <p>This will load <strong>every workshop across every namespace</strong> on the platform. This can be slow and resource-intensive.</p>
          </Alert>
          <p>Operations (lock, extend, scale, etc.) will apply to workshops from <strong>all namespaces</strong> unless you filter or select specific ones first.</p>
          <p style={{ marginTop: 12, fontWeight: 600 }}>Please confirm you understand the risks:</p>
          <ul style={{ marginTop: 8, paddingLeft: 20 }}>
            <li>All workshops across the entire platform will be loaded</li>
            <li>Operations apply globally unless filtered</li>
            <li>You can disable this mode at any time to return to project-scoped view</li>
          </ul>
        </ModalBody>
        <ModalFooter>
          <Button variant="danger" onClick={enablePlatformMode}>I understand, show all workshops</Button>
          <Button variant="link" onClick={() => setShowPlatformConfirm(false)}>Cancel</Button>
        </ModalFooter>
      </Modal>

      {/* ---------- Confirmation modals ---------- */}

      <Modal variant="small" isOpen={showLockConfirm} onClose={() => setShowLockConfirm(false)} aria-labelledby="lock-confirm">
        <ModalHeader title="Confirm Lock" labelId="lock-confirm" titleIconVariant="warning" />
        <ModalBody>
          {isMultiNs && <Alert variant="warning" isInline title="Multi-namespace operation" style={{ marginBottom: 12 }} />}
          {!hasSelection && isUnfiltered && operationTargets.length > 5 && (
            <Alert variant="info" isInline title={`Applies to all ${operationTargets.length} workshops in scope`} style={{ marginBottom: 12 }}>
              No workshop or stage filter is set. Consider filtering or selecting specific workshops.
            </Alert>
          )}
          <p className="ops-modal-scope">
            Set <code>lock-enabled=true</code> on <strong>{operationTargets.length}</strong> workshop{operationTargets.length !== 1 ? 's' : ''}
            {hasSelection ? ' (selected)' : !isMultiNs && namespace ? <> in <code>{namespace}</code></> : modalScopeDescription}.
          </p>
          <p style={{ marginTop: 8, color: 'var(--pf-t--global--text--color--subtle)', fontSize: '0.88rem' }}>
            Non-admin users will not be able to modify these resources.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="warning" onClick={handleLock}>Lock {operationTargets.length} workshop{operationTargets.length !== 1 ? 's' : ''}</Button>
          <Button variant="link" onClick={() => setShowLockConfirm(false)}>Cancel</Button>
        </ModalFooter>
      </Modal>

      <Modal variant="small" isOpen={showUnlockConfirm} onClose={() => setShowUnlockConfirm(false)} aria-labelledby="unlock-confirm">
        <ModalHeader title="Confirm Unlock" labelId="unlock-confirm" titleIconVariant="warning" />
        <ModalBody>
          {isMultiNs && <Alert variant="warning" isInline title="Multi-namespace operation" style={{ marginBottom: 12 }} />}
          {!hasSelection && isUnfiltered && operationTargets.length > 5 && (
            <Alert variant="info" isInline title={`Applies to all ${operationTargets.length} workshops in scope`} style={{ marginBottom: 12 }}>
              No workshop or stage filter is set.
            </Alert>
          )}
          <p className="ops-modal-scope">
            Set <code>lock-enabled=false</code> on <strong>{operationTargets.length}</strong> workshop{operationTargets.length !== 1 ? 's' : ''}
            {hasSelection ? ' (selected)' : !isMultiNs && namespace ? <> in <code>{namespace}</code></> : modalScopeDescription}.
          </p>
          <p style={{ marginTop: 8, color: 'var(--pf-t--global--text--color--subtle)', fontSize: '0.88rem' }}>
            Users will be able to modify these resources.
          </p>
          {(() => {
            const multiAssetChildren = operationTargets.filter(ws => ws.metadata.annotations?.[`${BABYLON_DOMAIN}/multiworkshop-source`]);
            return multiAssetChildren.length > 0 ? (
              <Alert variant="danger" isInline title={`${multiAssetChildren.length} workshop(s) belong to a multi-asset parent`} style={{ marginTop: 12 }}>
                Unlocking will <strong>stop date sync</strong> with the parent &mdash; stop and destroy
                times will no longer update when the parent schedule changes.
                Re-lock to restore sync.
              </Alert>
            ) : null;
          })()}
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={handleUnlock}>Unlock {operationTargets.length} workshop{operationTargets.length !== 1 ? 's' : ''}</Button>
          <Button variant="link" onClick={() => setShowUnlockConfirm(false)}>Cancel</Button>
        </ModalFooter>
      </Modal>

      <Modal variant="small" isOpen={showExtStopConfirm} onClose={() => setShowExtStopConfirm(false)} aria-labelledby="ext-stop-confirm">
        <ModalHeader title="Confirm Extend Stop Time" labelId="ext-stop-confirm" />
        <ModalBody>
          {isMultiNs && <Alert variant="warning" isInline title="Multi-namespace operation" style={{ marginBottom: 12 }} />}
          <p className="ops-modal-scope">
            Extend auto-stop by <strong>{extStopDays}d {extStopHours}h</strong> on{' '}
            <strong>{operationTargets.length}</strong> workshop{operationTargets.length !== 1 ? 's' : ''}
            {hasSelection ? ' (selected)' : !isMultiNs && namespace ? <> in <code>{namespace}</code></> : modalScopeDescription}.
          </p>
          {operationTargets.some(ws => !ws.spec?.actionSchedule?.stop) && (
            <Alert variant="info" isInline title="Note" style={{ marginTop: 12 }}>
              {operationTargets.filter(ws => !ws.spec?.actionSchedule?.stop).length} workshop(s) have no auto-stop and will be skipped.
              Only workshops with an existing stop schedule will be extended.
            </Alert>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={handleExtendStop}>Extend Stop</Button>
          <Button variant="link" onClick={() => setShowExtStopConfirm(false)}>Cancel</Button>
        </ModalFooter>
      </Modal>

      <Modal variant="small" isOpen={showExtDestroyConfirm} onClose={() => setShowExtDestroyConfirm(false)} aria-labelledby="ext-destroy-confirm">
        <ModalHeader title="Confirm Extend Destroy Time" labelId="ext-destroy-confirm" titleIconVariant="warning" />
        <ModalBody>
          {isMultiNs && <Alert variant="warning" isInline title="Multi-namespace operation" style={{ marginBottom: 12 }} />}
          {!hasSelection && isUnfiltered && operationTargets.length > 5 && (
            <Alert variant="info" isInline title={`Applies to all ${operationTargets.length} workshops in scope`} style={{ marginBottom: 12 }}>
              No workshop or stage filter is set.
            </Alert>
          )}
          <p className="ops-modal-scope">
            Extend auto-destroy by <strong>{extDestroyDays}d {extDestroyHours}h</strong> on{' '}
            <strong>{operationTargets.length}</strong> workshop{operationTargets.length !== 1 ? 's' : ''}
            {hasSelection ? ' (selected)' : !isMultiNs && namespace ? <> in <code>{namespace}</code></> : modalScopeDescription}.
          </p>
          <p style={{ marginTop: 8, color: 'var(--pf-t--global--text--color--subtle)', fontSize: '0.88rem' }}>
            This pushes back the permanent destruction deadline. Resources will continue running and incurring costs for the extended period.
          </p>
          {operationTargets.some(ws => !ws.spec?.lifespan?.end) && (
            <Alert variant="info" isInline title="Note" style={{ marginTop: 12 }}>
              {operationTargets.filter(ws => !ws.spec?.lifespan?.end).length} workshop(s) have no auto-destroy and will be skipped.
              Only workshops with an existing destroy schedule will be extended.
            </Alert>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={handleExtendDestroy}>Extend Destroy</Button>
          <Button variant="link" onClick={() => setShowExtDestroyConfirm(false)}>Cancel</Button>
        </ModalFooter>
      </Modal>

      <Modal variant="small" isOpen={showNoAutostopConfirm} onClose={() => setShowNoAutostopConfirm(false)} aria-labelledby="no-autostop-confirm">
        <ModalHeader title="Confirm Disable Auto-Stop" labelId="no-autostop-confirm" titleIconVariant="warning" />
        <ModalBody>
          {isMultiNs && <Alert variant="warning" isInline title="Multi-namespace operation" style={{ marginBottom: 12 }} />}
          {!hasSelection && isUnfiltered && operationTargets.length > 5 && (
            <Alert variant="info" isInline title={`Applies to all ${operationTargets.length} workshops in scope`} style={{ marginBottom: 12 }}>
              No workshop or stage filter is set.
            </Alert>
          )}
          <p className="ops-modal-scope">
            Remove <code>actionSchedule.stop</code> from{' '}
            <strong>{operationTargets.length}</strong> workshop{operationTargets.length !== 1 ? 's' : ''}
            {hasSelection ? ' (selected)' : !isMultiNs && namespace ? <> in <code>{namespace}</code></> : modalScopeDescription}.
          </p>
          <Alert variant="warning" isInline title="Cloud cost impact" style={{ marginTop: 12 }}>
            Workshops will remain running until their destroy deadline or manual stop.
            This may incur additional cloud costs for the duration.
          </Alert>
        </ModalBody>
        <ModalFooter>
          <Button variant="warning" onClick={handleDisableAutostop}>Disable Auto-Stop</Button>
          <Button variant="link" onClick={() => setShowNoAutostopConfirm(false)}>Cancel</Button>
        </ModalFooter>
      </Modal>

      <Modal variant="small" isOpen={showScaleConfirm} onClose={() => { setShowScaleConfirm(false); setScaleConfirmText(''); }} aria-labelledby="scale-confirm">
        <ModalHeader title={isScaleDown ? 'Confirm Scale Down' : 'Confirm Scale'} labelId="scale-confirm" titleIconVariant={isScaleDown ? 'warning' : undefined} />
        <ModalBody>
          {isMultiNs && <Alert variant="warning" isInline title="Multi-namespace operation" style={{ marginBottom: 12 }} />}
          <p className="ops-modal-scope">
            Set instance count to <strong>{scaleCount}</strong> on{' '}
            <strong>{operationTargets.length}</strong> workshop{operationTargets.length !== 1 ? 's' : ''}
            {hasSelection ? ' (selected)' : !isMultiNs && namespace ? <> in <code>{namespace}</code></> : modalScopeDescription}.
          </p>
          {operationTargets.length > 0 && (
            <table className="ops-modal-table">
              <thead>
                <tr>
                  {isMultiNs && <th>Namespace</th>}
                  <th>Workshop</th>
                  <th style={{ textAlign: 'center' }}>Current</th>
                  <th></th>
                  <th style={{ textAlign: 'center' }}>New</th>
                </tr>
              </thead>
              <tbody>
                {operationTargets.map(ws => {
                  const cur = getCurrentCount(ws);
                  const isDown = cur !== null && scaleCount < cur;
                  const isUp = cur !== null && scaleCount > cur;
                  const label = cur === null ? '' : isUp ? 'scale up' : isDown ? 'scale down' : 'no change';
                  const color = isDown ? 'var(--pf-t--global--color--status--danger--default)' : isUp ? 'var(--pf-t--global--color--status--info--default)' : 'var(--pf-t--global--text--color--subtle)';
                  return (
                    <tr key={wsKey(ws)}>
                      {isMultiNs && <td className="ops-modal-ns-cell">{ws.metadata.namespace}</td>}
                      <td className="ops-modal-ws-name">{displayName(ws)}</td>
                      <td className="ops-modal-count">{cur ?? '?'}</td>
                      <td className="ops-modal-arrow">&rarr;</td>
                      <td className="ops-modal-count"><strong>{scaleCount}</strong> <span className="ops-modal-direction" style={{ color }}>{label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {isScaleDown && (
            <>
              <Alert variant={scaleDownPreference === 'used' ? 'danger' : 'warning'} isInline
                title={scaleDownPreference === 'used'
                  ? 'DANGEROUS: Removing USED instances first — students lose access immediately'
                  : 'Scaling down will reduce running instances'}
                style={{ marginTop: 12 }}>
                {scaleDownPreference === 'used'
                  ? 'Active student sessions will be terminated. Only choose this if you are certain.'
                  : 'Unused instances are removed first. Students on remaining instances are not affected.'}
              </Alert>
              <p style={{ marginTop: 12, fontWeight: 600 }}>Type <code>{scaleConfirmWord}</code> to confirm:</p>
              <TextInput value={scaleConfirmText} onChange={(_e, val) => setScaleConfirmText(val)} aria-label="Confirm scale down" />
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant={isScaleDown ? (scaleDownPreference === 'used' ? 'danger' : 'warning') : 'primary'} onClick={handleScale} isDisabled={!scaleConfirmValid}>
            {isScaleDown ? 'Scale Down' : 'Scale'}
          </Button>
          <Button variant="link" onClick={() => { setShowScaleConfirm(false); setScaleConfirmText(''); }}>Cancel</Button>
        </ModalFooter>
      </Modal>

      <Modal variant="small" isOpen={showScaleZeroConfirm} onClose={() => { setShowScaleZeroConfirm(false); setScaleConfirmText(''); }} aria-labelledby="scale-zero-confirm">
        <ModalHeader title="Confirm Scale to Zero" labelId="scale-zero-confirm" titleIconVariant="danger" />
        <ModalBody>
          {isMultiNs && <Alert variant="danger" isInline title="Multi-namespace destructive operation" style={{ marginBottom: 12 }} />}
          {!hasSelection && isUnfiltered && operationTargets.length > 5 && (
            <Alert variant="danger" isInline title={`This will affect ALL ${operationTargets.length} workshops`} style={{ marginBottom: 12 }}>
              No filter is set. Every workshop in scope will be scaled to zero.
            </Alert>
          )}
          <p className="ops-modal-scope">
            Scaling to <strong>0</strong> will remove all instances on{' '}
            <strong>{operationTargets.length}</strong> workshop{operationTargets.length !== 1 ? 's' : ''}
            {hasSelection ? ' (selected)' : !isMultiNs && namespace ? <> in <code>{namespace}</code></> : modalScopeDescription}.
          </p>
          <Alert variant="danger" isInline title="Destructive operation" style={{ marginTop: 12 }}>
            All running resources will be destroyed. Students will lose access immediately. This cannot be undone.
          </Alert>
          <p style={{ marginTop: 12, fontWeight: 600 }}>Type <code>{scaleConfirmWord}</code> to confirm:</p>
          <TextInput value={scaleConfirmText} onChange={(_e, val) => setScaleConfirmText(val)} aria-label="Confirm scale to zero" />
        </ModalBody>
        <ModalFooter>
          <Button variant="danger" onClick={handleScale} isDisabled={!scaleConfirmValid}>Scale to Zero</Button>
          <Button variant="link" onClick={() => { setShowScaleZeroConfirm(false); setScaleConfirmText(''); }}>Cancel</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};

export default Ops;
