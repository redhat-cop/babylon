import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  Split,
  SplitItem,
  Switch,
  TextInput,
  Tooltip,
  Title,
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

import {
  apiPaths,
  dateToApiString,
  fetcher,
  lockWorkshop,
  patchWorkshop,
  patchWorkshopProvision,
} from '@app/api';
import {
  Workshop, WorkshopList, WorkshopProvision, WorkshopProvisionList,
  WorkshopUserAssignment, WorkshopUserAssignmentList,
  ServiceNamespace,
} from '@app/types';
import { displayName, BABYLON_DOMAIN, DEMO_DOMAIN, getStageFromK8sObject, namespaceToServiceNamespaceMapper } from '@app/util';
import { isWorkshopLocked } from '@app/Workshops/workshops-utils';
import ProjectSelector from '@app/components/ProjectSelector';
import useSession from '@app/utils/useSession';

import './admin.css';
import './ops.css';

interface OpsAlert {
  key: number;
  title: string;
  variant: AlertVariant;
  description?: string;
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

const STAGE_FILTERS: { label: string; value: string; color: 'blue' | 'orange' | 'green' | 'purple' }[] = [
  { label: 'prod', value: 'prod', color: 'orange' },
  { label: 'event', value: 'event', color: 'purple' },
  { label: 'dev', value: 'dev', color: 'green' },
  { label: 'test', value: 'test', color: 'blue' },
];

const FETCH_LIMIT = 500;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

let alertKeyCounter = 0;

function dateUrgency(iso?: string): 'critical' | 'warning' | 'ok' | null {
  if (!iso) return null;
  const remaining = new Date(iso).getTime() - Date.now();
  if (remaining < 0) return 'critical';
  if (remaining < TWO_HOURS_MS) return 'critical';
  if (remaining < TWENTY_FOUR_HOURS_MS) return 'warning';
  return 'ok';
}

function wsKey(ws: Workshop): string {
  return `${ws.metadata.namespace}/${ws.metadata.name}`;
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
    return allNamespaces.filter(ns => ns.name !== namespace && !extraNamespaces.includes(ns.name)).sort((a, b) => a.name.localeCompare(b.name));
  }, [allNamespaces, namespace, extraNamespaces]);

  const activeNamespaces = useMemo(() => {
    const nsList = namespace ? [namespace] : [];
    if (multiNsMode) nsList.push(...extraNamespaces);
    return nsList;
  }, [namespace, multiNsMode, extraNamespaces]);

  const isMultiNs = activeNamespaces.length > 1;

  const enableMultiNs = useCallback(() => {
    setMultiNsMode(true);
    setMultiNsAck(true);
    setShowMultiNsConfirm(false);
  }, []);

  const disableMultiNs = useCallback(() => {
    setMultiNsMode(false);
    setMultiNsAck(false);
    setExtraNamespaces([]);
  }, []);

  // ---------- Timezone ----------

  const [timezone, setTimezone] = useState('local');

  const fmtDate = useCallback((iso?: string) => {
    if (!iso) return null;
    const d = new Date(iso);
    const opts: Intl.DateTimeFormatOptions = {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    };
    if (timezone !== 'local') opts.timeZone = timezone;
    return d.toLocaleString(undefined, opts);
  }, [timezone]);

  // ---------- Data fetching (multi-namespace aware) ----------

  const workshopUrls = useMemo(
    () => activeNamespaces.map(ns => apiPaths.WORKSHOPS({ namespace: ns, limit: FETCH_LIMIT })),
    [activeNamespaces],
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

  const assignmentKeys = useMemo(
    () => workshops.map(w => apiPaths.WORKSHOP_USER_ASSIGNMENTS({ workshopName: w.metadata.name, namespace: w.metadata.namespace })),
    [workshops],
  );
  const { data: allAssignData, isValidating: assignValidating } = useSWR<WorkshopUserAssignmentList[]>(
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

  const [showPasswords, setShowPasswords] = useState(false);

  const isRefreshing = wsValidating || provValidating || assignValidating;
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const handleRefresh = useCallback(() => {
    mutateWorkshops();
    mutateProvisions();
    setLastRefresh(new Date());
  }, [mutateWorkshops, mutateProvisions]);

  // ---------- Workshop filter ----------

  const workshopOptions = useMemo(() => {
    const names = new Set(workshops.map(w => displayName(w)));
    return Array.from(names).sort();
  }, [workshops]);

  const [workshopFilter, setWorkshopFilter] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [stageFilter, setStageFilter] = useState<string | null>(null);

  const targets = useMemo(() => {
    let list = workshops;
    if (workshopFilter) list = list.filter(w => displayName(w) === workshopFilter);
    if (stageFilter) list = list.filter(w => getStageFromK8sObject(w) === stageFilter);
    return list;
  }, [workshops, workshopFilter, stageFilter]);

  // Group workshops by display name for cleaner table
  const workshopGroups = useMemo(() => {
    const groups = new Map<string, Workshop[]>();
    for (const ws of targets) {
      const name = displayName(ws);
      const list = groups.get(name) ?? [];
      list.push(ws);
      groups.set(name, list);
    }
    return Array.from(groups.entries()).map(([name, items]) => ({ name, items }));
  }, [targets]);

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
    const nsLabel = isMultiNs ? `${activeNamespaces.length} namespaces` : namespace;
    if (workshopFilter) {
      return <>&ldquo;{workshopFilter}&rdquo; ({targets.length}) in {nsLabel}</>;
    }
    return <>all {targets.length} workshop{targets.length !== 1 ? 's' : ''} in {nsLabel}</>;
  }, [workshopFilter, targets.length, isMultiNs, activeNamespaces.length, namespace]);

  // Namespace breakdown for modals
  const namespaceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ws of targets) {
      const ns = ws.metadata.namespace;
      counts.set(ns, (counts.get(ns) ?? 0) + 1);
    }
    return counts;
  }, [targets]);

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

  const summary = useMemo(() => {
    let totalInstances = 0;
    let seatsAssigned = 0;
    let seatsTotal = 0;
    let lockedCount = 0;
    let activeCount = 0;
    let attentionCount = 0;

    for (const ws of targets) {
      const count = getCurrentCount(ws);
      if (count !== null) totalInstances += count;

      const seats = getSeats(ws);
      if (seats) {
        seatsAssigned += seats.assigned;
        seatsTotal += seats.total;
      }

      if (isWorkshopLocked(ws)) lockedCount++;
      if (seats && seats.assigned > 0) activeCount++;

      const stopUrg = dateUrgency(ws.spec?.actionSchedule?.stop);
      const destroyUrg = dateUrgency(ws.spec?.lifespan?.end);
      if (stopUrg === 'critical' || destroyUrg === 'critical') attentionCount++;
    }

    return { totalInstances, seatsAssigned, seatsTotal, lockedCount, activeCount, attentionCount };
  }, [targets, getCurrentCount, getSeats]);

  // ---------- Operation parameters ----------

  const [extStopDays, setExtStopDays] = useState(0);
  const [extStopHours, setExtStopHours] = useState(0);
  const [extDestroyDays, setExtDestroyDays] = useState(0);
  const [extDestroyHours, setExtDestroyHours] = useState(0);
  const [scaleCount, setScaleCount] = useState(5);

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
    for (const ws of targets) {
      const cur = getCurrentCount(ws);
      if (cur === null) { unknown++; continue; }
      if (scaleCount > cur) up++;
      else if (scaleCount < cur) down++;
      else same++;
    }
    return { up, down, same, unknown };
  }, [targets, getCurrentCount, scaleCount]);

  const isScaleDown = scaleAnalysis.down > 0;
  const isScaleZero = scaleCount === 0;
  const scaleNeedsConfirmText = isScaleZero || isScaleDown;
  const scaleConfirmWord = isScaleZero ? 'SCALE-TO-ZERO' : 'SCALE-DOWN';
  const scaleConfirmValid = !scaleNeedsConfirmText || scaleConfirmText === scaleConfirmWord;

  // ---------- Handlers ----------

  const handleLock = async () => {
    setShowLockConfirm(false);
    setLockLoading(true);
    let ok = 0, fail = 0;
    for (const ws of targets) {
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
    for (const ws of targets) {
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
    let ok = 0, fail = 0;
    for (const ws of targets) {
      try {
        const currentStop = ws.spec?.actionSchedule?.stop;
        const base = currentStop ? new Date(currentStop) : new Date();
        const newDate = new Date(base.getTime() + addMs);
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
    if (fail === 0) addAlert(AlertVariant.success, `Extended stop on ${ok} workshop(s) by ${extStopDays}d ${extStopHours}h`);
    else addAlert(AlertVariant.danger, `Extend stop: ${ok} succeeded, ${fail} failed`);
  };

  const handleExtendDestroy = async () => {
    if (extDestroyDays === 0 && extDestroyHours === 0) return;
    if (!showExtDestroyConfirm) { setShowExtDestroyConfirm(true); return; }
    setShowExtDestroyConfirm(false);
    setExtDestroyLoading(true);
    const addMs = (extDestroyDays * 24 + extDestroyHours) * 3600_000;
    let ok = 0, fail = 0;
    for (const ws of targets) {
      try {
        const currentEnd = ws.spec?.lifespan?.end;
        const base = currentEnd ? new Date(currentEnd) : new Date();
        const newDate = new Date(base.getTime() + addMs);
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
    if (fail === 0) addAlert(AlertVariant.success, `Extended destroy on ${ok} workshop(s) by ${extDestroyDays}d ${extDestroyHours}h`);
    else addAlert(AlertVariant.danger, `Extend destroy: ${ok} succeeded, ${fail} failed`);
  };

  const handleDisableAutostop = async () => {
    if (!showNoAutostopConfirm) { setShowNoAutostopConfirm(true); return; }
    setShowNoAutostopConfirm(false);
    setNoAutostopLoading(true);
    let ok = 0, fail = 0;
    for (const ws of targets) {
      try {
        await patchWorkshop({
          name: ws.metadata.name,
          namespace: ws.metadata.namespace,
          jsonPatch: [{ op: 'remove', path: '/spec/actionSchedule/stop' }],
        });
        ok++;
      } catch { fail++; }
    }
    setNoAutostopLoading(false);
    mutateWorkshops();
    if (fail === 0) addAlert(AlertVariant.success, `Disabled auto-stop on ${ok} workshop(s)`);
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
    for (const ws of targets) {
      try {
        const provResp = await fetcher(apiPaths.WORKSHOP_PROVISIONS({
          workshopName: ws.metadata.name,
          namespace: ws.metadata.namespace,
        })) as WorkshopProvisionList;
        for (const prov of provResp.items) {
          await patchWorkshopProvision({
            name: prov.metadata.name,
            namespace: prov.metadata.namespace,
            patch: { spec: { count: scaleCount } },
          });
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
        <PageSection key="header" className="admin-header" variant="light">
          <Split hasGutter>
            <SplitItem>
              <ProjectSelector
                currentNamespaceName={namespace}
                onSelect={(n) => navigate(`/admin/ops/${n.name}`)}
              />
            </SplitItem>
            <SplitItem isFilled>
              <Title headingLevel="h4" style={{ display: 'inline-block', lineHeight: '36px' }}>Ops</Title>
            </SplitItem>
          </Split>
        </PageSection>
        <PageSection key="body" className="admin-body" variant="light">
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

  const renderDateCell = (iso?: string, label?: string) => {
    if (!iso) {
      return <Label color="grey" isCompact>{label || 'Not set'}</Label>;
    }
    const urgency = dateUrgency(iso);
    const formatted = fmtDate(iso);
    if (urgency === 'critical') {
      return <span className="ops-date-critical">{formatted}</span>;
    }
    if (urgency === 'warning') {
      return <span className="ops-date-warning">{formatted}</span>;
    }
    return <span>{formatted}</span>;
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

      <PageSection key="header" className="admin-header" variant="light">
        <Split hasGutter>
          <SplitItem>
            <ProjectSelector
              currentNamespaceName={namespace}
              onSelect={(n) => { setWorkshopFilter(''); navigate(`/admin/ops/${n.name}`); }}
            />
          </SplitItem>
          <SplitItem isFilled>
            <Title headingLevel="h4" style={{ display: 'inline-block', lineHeight: '36px' }}>
              Ops &mdash; <code>{namespace}</code>
              {isMultiNs && <Label color="orange" isCompact style={{ marginLeft: 8, verticalAlign: 'middle' }}>+{extraNamespaces.length} NS</Label>}
            </Title>
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
              <Label isCompact color="blue" style={{ lineHeight: '36px' }}>
                {workshops.length} workshop{workshops.length !== 1 ? 's' : ''}
                {isMultiNs ? ` across ${activeNamespaces.length} namespaces` : ' in namespace'}
              </Label>
            )}
          </SplitItem>
        </Split>
      </PageSection>

      <PageSection key="body" className="admin-body" variant="light">
        {/* Multi-namespace toggle */}
        {isAdmin && (
          <div className={`ops-multi-ns-bar ${multiNsMode ? 'ops-multi-ns-bar--active' : ''}`}>
            <Split hasGutter>
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
              {multiNsMode && (
                <>
                  <SplitItem isFilled>
                    <Select
                      isOpen={nsSearchOpen}
                      onSelect={(_e, val) => {
                        const ns = val as string;
                        if (ns && !extraNamespaces.includes(ns)) {
                          setExtraNamespaces(prev => [...prev, ns]);
                        }
                        setNsSearchOpen(false);
                      }}
                      onOpenChange={setNsSearchOpen}
                      toggle={(toggleRef) => (
                        <MenuToggle ref={toggleRef} onClick={() => setNsSearchOpen(p => !p)} isExpanded={nsSearchOpen} style={{ minWidth: 320 }}>
                          Add namespace...
                        </MenuToggle>
                      )}
                      shouldFocusToggleOnSelect
                    >
                      <SelectList>
                        {filteredNsOptions.length === 0 ? (
                          <SelectOption isDisabled value="">No matching namespaces</SelectOption>
                        ) : filteredNsOptions.slice(0, 50).map(ns => (
                          <SelectOption key={ns.name} value={ns.name}>
                            {ns.displayName !== ns.name ? `${ns.displayName} (${ns.name})` : ns.name}
                          </SelectOption>
                        ))}
                      </SelectList>
                    </Select>
                  </SplitItem>
                </>
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
          </div>
        )}

        {multiNsBanner}

        {workshops.length === 0 ? (
          <EmptyState titleText="No workshops found" headingLevel="h4">
            <EmptyStateBody>
              No workshops exist in {isMultiNs ? 'the selected namespaces' : <><strong>{namespace}</strong></>}.
              Deploy workshops first, then return here for bulk operations.
            </EmptyStateBody>
          </EmptyState>
        ) : (
          <>
            {/* Scope + timezone bar */}
            <div className="ops-scope-bar">
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
                <span className="ops-stat-value">{targets.length}</span>
                <span className="ops-stat-label">Workshops</span>
              </div>
              <div className="ops-stat-divider" />
              <div className="ops-stat">
                <span className="ops-stat-value">{summary.totalInstances}</span>
                <span className="ops-stat-label">Instances</span>
              </div>
              <div className="ops-stat-divider" />
              <div className="ops-stat">
                <span className="ops-stat-value">{summary.seatsAssigned} <span className="ops-stat-of">/ {summary.seatsTotal}</span></span>
                <span className="ops-stat-label">Seats filled</span>
              </div>
              <div className="ops-stat-divider" />
              <div className="ops-stat">
                <span className="ops-stat-value">{summary.activeCount}</span>
                <span className="ops-stat-label">Active</span>
              </div>
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

            <div className="ops-grid">
              {/* Resource Lock */}
              <Card isFullHeight>
                <CardTitle>Resource Lock</CardTitle>
                <CardBody>
                  <p className="ops-desc">
                    Toggle <code>lock-enabled</code> on workshops.
                    Locked resources cannot be modified by non-admin users.
                  </p>
                  <div className="ops-button-row">
                    <Button variant="warning" onClick={() => setShowLockConfirm(true)}
                      isLoading={lockLoading} isDisabled={anyLoading}>Lock</Button>
                    <Button variant="secondary" onClick={() => setShowUnlockConfirm(true)}
                      isLoading={unlockLoading} isDisabled={anyLoading}>Unlock</Button>
                  </div>
                </CardBody>
              </Card>

              {/* Extend Stop */}
              <Card isFullHeight>
                <CardTitle>
                  <Tooltip content="Push back the auto-stop time. Workshops can be restarted after stop.">
                    <span>Extend Stop Time</span>
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
                    <span>Extend Destroy Time</span>
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
                    <span>Disable Auto-Stop</span>
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
                <CardTitle>Scale Workshops</CardTitle>
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
                    Workshops in scope
                    <Badge isRead style={{ marginLeft: 8 }}>{workshopGroups.length}</Badge>
                    {workshopGroups.length !== targets.length && (
                      <span style={{ marginLeft: 6, fontSize: '0.78rem', color: 'var(--pf-t--global--text--color--subtle)' }}>
                        ({targets.length} instances)
                      </span>
                    )}
                  </Title>
                </SplitItem>
                <SplitItem>
                  <Button variant="plain" onClick={() => setShowPasswords(p => !p)}
                    aria-label={showPasswords ? 'Hide passwords' : 'Show passwords'}>
                    {showPasswords ? <EyeSlashIcon /> : <EyeIcon />}
                    <span style={{ marginLeft: 6, fontSize: '0.85rem' }}>{showPasswords ? 'Hide passwords' : 'Show passwords'}</span>
                  </Button>
                </SplitItem>
              </Split>
              <div className="ops-table-wrap">
                <table className="pf-v6-c-table pf-m-compact pf-m-grid-md" role="grid">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Name</th>
                      <th>Status</th>
                      <th>Lock</th>
                      <th>Instances</th>
                      <th>Seats</th>
                      <th>Registration</th>
                      <th>Password</th>
                      <th>Auto-Stop</th>
                      <th>Auto-Destroy</th>
                      <th>Workshop URL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workshopGroups.map(group => {
                      const expanded = expandedGroups.has(group.name);
                      const isSingle = group.items.length === 1;
                      const firstWs = group.items[0];
                      const firstStage = getStageFromK8sObject(firstWs);
                      const firstMultiWs = firstWs.metadata.annotations?.[`${BABYLON_DOMAIN}/multiworkshop-source`];

                      // Aggregate stats for the group header
                      let grpInstances = 0;
                      let grpSeatsAssigned = 0;
                      let grpSeatsTotal = 0;
                      let grpLocked = 0;
                      let grpActive = 0;
                      let grpStopped = 0;
                      let grpAttention = false;
                      const grpPasswords = new Set<string>();
                      const grpNamespaces = new Set<string>();
                      const grpUrls: { id: string; url: string }[] = [];

                      for (const ws of group.items) {
                        const c = getCurrentCount(ws);
                        if (c !== null) grpInstances += c;
                        const s = getSeats(ws);
                        if (s) { grpSeatsAssigned += s.assigned; grpSeatsTotal += s.total; }
                        if (isWorkshopLocked(ws)) grpLocked++;
                        if (s && s.assigned > 0) grpActive++;
                        if (ws.spec?.provisionDisabled) grpStopped++;
                        if (dateUrgency(ws.spec?.actionSchedule?.stop) === 'critical' || dateUrgency(ws.spec?.lifespan?.end) === 'critical') grpAttention = true;
                        if (ws.spec?.accessPassword) grpPasswords.add(ws.spec.accessPassword);
                        grpNamespaces.add(ws.metadata.namespace);
                        const wid = ws.metadata.labels?.[`${BABYLON_DOMAIN}/workshop-id`];
                        if (wid) grpUrls.push({ id: wid, url: `${window.location.origin}/workshop/${wid}` });
                      }

                      const stageColor = firstStage === 'dev' ? 'green' as const : firstStage === 'event' ? 'purple' as const : firstStage === 'test' ? 'blue' as const : firstStage === 'prod' ? 'orange' as const : 'grey' as const;

                      const headerRow = (
                        <tr key={`grp-${group.name}`}
                          className={`ops-group-header ${grpAttention ? 'ops-row-attention' : ''} ${grpStopped === group.items.length ? 'ops-row-stopped' : ''}`}
                          onClick={!isSingle ? () => toggleGroup(group.name) : undefined}
                          style={!isSingle ? { cursor: 'pointer' } : undefined}
                        >
                          <td className="ops-expand-cell">
                            {!isSingle && (
                              expanded ? <AngleDownIcon className="ops-expand-icon" /> : <AngleRightIcon className="ops-expand-icon" />
                            )}
                          </td>
                          <td>
                            <strong>{group.name}</strong>
                            {!isSingle && <Badge isRead style={{ marginLeft: 6 }}>{group.items.length}</Badge>}
                            {isSingle && <span className="ops-ws-meta">{firstWs.metadata.name}</span>}
                            <span className="ops-ws-labels">
                              {firstStage && <Label isCompact color={stageColor}>{firstStage}</Label>}
                              {isMultiNs && Array.from(grpNamespaces).map(ns => (
                                <Label key={ns} isCompact color={
                                  ns.includes('.prod') ? 'orange' : ns.includes('.event') ? 'purple' : ns.includes('.dev') ? 'green' : 'blue'
                                }>{ns}</Label>
                              ))}
                              {firstMultiWs && (
                                <Tooltip content={`Part of Multi-Asset Workshop: ${firstMultiWs}`}>
                                  <Label isCompact color="cyan">Multi-Asset: {firstMultiWs}</Label>
                                </Tooltip>
                              )}
                            </span>
                          </td>
                          <td>
                            {grpActive > 0 ? (
                              <><Icon status="success"><CheckCircleIcon /></Icon><span style={{ marginLeft: 6, fontSize: '0.85rem' }}>Active</span></>
                            ) : grpStopped > 0 ? (
                              <><Icon status="danger"><PauseCircleIcon /></Icon><span style={{ marginLeft: 6, fontSize: '0.85rem' }}>Stopped</span></>
                            ) : (
                              <><Icon status="info"><InProgressIcon /></Icon><span style={{ marginLeft: 6, fontSize: '0.85rem' }}>Provisioning</span></>
                            )}
                          </td>
                          <td>
                            {grpLocked > 0 ? (
                              <Tooltip content={`${grpLocked} of ${group.items.length} locked`}>
                                <Icon status="warning"><LockIcon /></Icon>
                              </Tooltip>
                            ) : (
                              <Icon status="success"><LockOpenIcon /></Icon>
                            )}
                          </td>
                          <td><strong>{grpInstances}</strong></td>
                          <td>
                            {grpSeatsTotal > 0 ? (
                              <span><strong>{grpSeatsAssigned}</strong> / {grpSeatsTotal}</span>
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
                            {grpPasswords.size > 0 ? (
                              showPasswords
                                ? <code className="ops-password">{Array.from(grpPasswords).join(', ')}</code>
                                : <span className="ops-password-hidden">••••••••</span>
                            ) : <span className="ops-muted">None</span>}
                          </td>
                          <td>{renderDateCell(firstWs.spec?.actionSchedule?.stop, 'No auto-stop')}</td>
                          <td>{renderDateCell(firstWs.spec?.lifespan?.end, 'No auto-destroy')}</td>
                          <td>
                            {grpUrls.length > 0 ? (
                              <a href={grpUrls[0].url} target="_blank" rel="noopener noreferrer" className="ops-ws-link">
                                <ExternalLinkAltIcon style={{ marginRight: 4 }} />
                                {grpUrls[0].id}
                              </a>
                            ) : <span className="ops-muted">&mdash;</span>}
                          </td>
                        </tr>
                      );

                      if (isSingle || !expanded) return headerRow;

                      const childRows = group.items.map(ws => {
                        const locked = isWorkshopLocked(ws);
                        const currentCount = getCurrentCount(ws);
                        const seats = getSeats(ws);
                        const password = ws.spec?.accessPassword;
                        const workshopId = ws.metadata.labels?.[`${BABYLON_DOMAIN}/workshop-id`];
                        const workshopUrl = workshopId ? `${window.location.origin}/workshop/${workshopId}` : null;
                        const provs = provisionsByWorkshop.get(wsKey(ws)) ?? [];
                        const hasProvisions = provs.length > 0;
                        const provDisabled = ws.spec?.provisionDisabled === true;

                        let statusIcon: React.ReactNode;
                        let statusLabel: string;
                        if (provDisabled) {
                          statusLabel = 'Stopped';
                          statusIcon = <Icon status="danger"><PauseCircleIcon /></Icon>;
                        } else if (!hasProvisions) {
                          statusLabel = 'No provisions';
                          statusIcon = <Icon status="warning"><ExclamationCircleIcon /></Icon>;
                        } else if (seats && seats.assigned > 0) {
                          statusLabel = 'Active';
                          statusIcon = <Icon status="success"><CheckCircleIcon /></Icon>;
                        } else {
                          statusLabel = 'Provisioning';
                          statusIcon = <Icon status="info"><InProgressIcon /></Icon>;
                        }

                        return (
                          <tr key={wsKey(ws)} className="ops-child-row">
                            <td></td>
                            <td>
                              <span className="ops-ws-meta" style={{ marginLeft: 8 }}>{ws.metadata.name}</span>
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
                            <td>
                              <Tooltip content={statusLabel}>{statusIcon}</Tooltip>
                              <span style={{ marginLeft: 6, fontSize: '0.85rem' }}>{statusLabel}</span>
                            </td>
                            <td>
                              {locked ? <Icon status="warning"><LockIcon /></Icon> : <Icon status="success"><LockOpenIcon /></Icon>}
                            </td>
                            <td>{currentCount !== null ? <strong>{currentCount}</strong> : <span className="ops-muted">&mdash;</span>}</td>
                            <td>
                              {seats ? (
                                <span><strong>{seats.assigned}</strong> / {seats.total}</span>
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
                            <td>{renderDateCell(ws.spec?.actionSchedule?.stop, 'No auto-stop')}</td>
                            <td>{renderDateCell(ws.spec?.lifespan?.end, 'No auto-destroy')}</td>
                            <td>
                              {workshopUrl ? (
                                <a href={workshopUrl} target="_blank" rel="noopener noreferrer" className="ops-ws-link">
                                  <ExternalLinkAltIcon style={{ marginRight: 4 }} />
                                  {workshopId}
                                </a>
                              ) : <span className="ops-muted">&mdash;</span>}
                            </td>
                          </tr>
                        );
                      });

                      return <React.Fragment key={`grp-f-${group.name}`}>{headerRow}{childRows}</React.Fragment>;
                    })}
                  </tbody>
                </table>
              </div>
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

      {/* ---------- Confirmation modals ---------- */}

      <Modal variant="small" isOpen={showLockConfirm} onClose={() => setShowLockConfirm(false)} aria-labelledby="lock-confirm">
        <ModalHeader title="Confirm Lock" labelId="lock-confirm" titleIconVariant="warning" />
        <ModalBody>
          {isMultiNs && <Alert variant="warning" isInline title="Multi-namespace operation" style={{ marginBottom: 12 }} />}
          <p>
            Set <code>lock-enabled=true</code> on <strong>{targets.length} workshop(s)</strong>
            {modalScopeDescription}.
          </p>
          <p style={{ marginTop: 8 }}>Non-admin users will not be able to modify these resources.</p>
        </ModalBody>
        <ModalFooter>
          <Button variant="warning" onClick={handleLock}>Lock {targets.length} workshop{targets.length !== 1 ? 's' : ''}</Button>
          <Button variant="link" onClick={() => setShowLockConfirm(false)}>Cancel</Button>
        </ModalFooter>
      </Modal>

      <Modal variant="small" isOpen={showUnlockConfirm} onClose={() => setShowUnlockConfirm(false)} aria-labelledby="unlock-confirm">
        <ModalHeader title="Confirm Unlock" labelId="unlock-confirm" />
        <ModalBody>
          {isMultiNs && <Alert variant="warning" isInline title="Multi-namespace operation" style={{ marginBottom: 12 }} />}
          <p>
            Set <code>lock-enabled=false</code> on <strong>{targets.length} workshop(s)</strong>
            {modalScopeDescription}.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={handleUnlock}>Unlock {targets.length} workshop{targets.length !== 1 ? 's' : ''}</Button>
          <Button variant="link" onClick={() => setShowUnlockConfirm(false)}>Cancel</Button>
        </ModalFooter>
      </Modal>

      <Modal variant="small" isOpen={showExtStopConfirm} onClose={() => setShowExtStopConfirm(false)} aria-labelledby="ext-stop-confirm">
        <ModalHeader title="Confirm Extend Stop Time" labelId="ext-stop-confirm" />
        <ModalBody>
          {isMultiNs && <Alert variant="warning" isInline title="Multi-namespace operation" style={{ marginBottom: 12 }} />}
          <p>
            Extend auto-stop by <strong>{extStopDays}d {extStopHours}h</strong> on{' '}
            <strong>{targets.length} workshop(s)</strong>
            {modalScopeDescription}.
          </p>
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
          <p>
            Extend auto-destroy by <strong>{extDestroyDays}d {extDestroyHours}h</strong> on{' '}
            <strong>{targets.length} workshop(s)</strong>
            {modalScopeDescription}.
          </p>
          <p style={{ marginTop: 8 }}>This pushes back the permanent destruction deadline.</p>
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
          <p>
            Remove <code>actionSchedule.stop</code> from{' '}
            <strong>{targets.length} workshop(s)</strong>
            {modalScopeDescription}.
          </p>
          <p style={{ marginTop: 8 }}>Workshops will remain running until their destroy deadline or manual stop. May incur additional cloud costs.</p>
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
          <p>
            Set instance count to <strong>{scaleCount}</strong> on{' '}
            <strong>{targets.length} workshop(s)</strong>
            {modalScopeDescription}.
          </p>
          {targets.length > 0 && (
            <table className="pf-v6-c-table pf-m-compact" style={{ marginTop: 12 }}>
              <thead><tr>{isMultiNs && <th>NS</th>}<th>Workshop</th><th>Current</th><th></th><th>New</th></tr></thead>
              <tbody>
                {targets.map(ws => {
                  const cur = getCurrentCount(ws);
                  const isDown = cur !== null && scaleCount < cur;
                  const isUp = cur !== null && scaleCount > cur;
                  const label = cur === null ? '' : isUp ? 'scale up' : isDown ? 'scale down' : 'no change';
                  const color = isDown ? 'var(--pf-t--global--color--status--danger--default)' : isUp ? 'var(--pf-t--global--color--status--info--default)' : 'var(--pf-t--global--text--color--subtle)';
                  return (
                    <tr key={wsKey(ws)}>
                      {isMultiNs && <td><code style={{ fontSize: '0.78rem' }}>{ws.metadata.namespace}</code></td>}
                      <td>{displayName(ws)}</td>
                      <td><strong>{cur ?? '?'}</strong></td>
                      <td>&rarr;</td>
                      <td><strong>{scaleCount}</strong> <span style={{ fontSize: '0.85em', color }}>{label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {isScaleDown && (
            <>
              <Alert variant="warning" isInline title="Scaling down will reduce running instances" style={{ marginTop: 12 }}>
                Students on removed instances will lose access. This cannot be undone.
              </Alert>
              <p style={{ marginTop: 12, fontWeight: 600 }}>Type <code>{scaleConfirmWord}</code> to confirm:</p>
              <TextInput value={scaleConfirmText} onChange={(_e, val) => setScaleConfirmText(val)} aria-label="Confirm scale down" />
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant={isScaleDown ? 'warning' : 'primary'} onClick={handleScale} isDisabled={!scaleConfirmValid}>
            {isScaleDown ? 'Scale Down' : 'Scale'}
          </Button>
          <Button variant="link" onClick={() => { setShowScaleConfirm(false); setScaleConfirmText(''); }}>Cancel</Button>
        </ModalFooter>
      </Modal>

      <Modal variant="small" isOpen={showScaleZeroConfirm} onClose={() => { setShowScaleZeroConfirm(false); setScaleConfirmText(''); }} aria-labelledby="scale-zero-confirm">
        <ModalHeader title="Confirm Scale to Zero" labelId="scale-zero-confirm" titleIconVariant="danger" />
        <ModalBody>
          {isMultiNs && <Alert variant="danger" isInline title="Multi-namespace destructive operation" style={{ marginBottom: 12 }} />}
          <p>
            Scaling to <strong>0</strong> will remove all instances on{' '}
            <strong>{targets.length} workshop(s)</strong>
            {modalScopeDescription}.
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
