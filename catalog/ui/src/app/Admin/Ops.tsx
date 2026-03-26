import React, { useCallback, useMemo, useState } from 'react';
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
  Tooltip,
  Title,
} from '@patternfly/react-core';
import LockIcon from '@patternfly/react-icons/dist/js/icons/lock-icon';
import LockOpenIcon from '@patternfly/react-icons/dist/js/icons/lock-open-icon';
import UsersIcon from '@patternfly/react-icons/dist/js/icons/users-icon';

import {
  apiPaths,
  dateToApiString,
  fetcher,
  lockWorkshop,
  patchWorkshop,
  patchWorkshopProvision,
} from '@app/api';
import { Workshop, WorkshopList, WorkshopProvision, WorkshopProvisionList } from '@app/types';
import { displayName, BABYLON_DOMAIN, DEMO_DOMAIN } from '@app/util';
import { isWorkshopLocked } from '@app/Workshops/workshops-utils';
import ProjectSelector from '@app/components/ProjectSelector';

import './admin.css';
import './ops.css';

interface OpsAlert {
  key: number;
  title: string;
  variant: AlertVariant;
  description?: string;
}

const FETCH_LIMIT = 500;
let alertKeyCounter = 0;

const Ops: React.FC = () => {
  const navigate = useNavigate();
  const { namespace } = useParams();

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

  // ---------- Data fetching ----------

  const { data: workshopsData, mutate: mutateWorkshops } = useSWR<WorkshopList>(
    namespace ? apiPaths.WORKSHOPS({ namespace, limit: FETCH_LIMIT }) : null,
    fetcher,
    { refreshInterval: 30000 },
  );
  const workshops = workshopsData?.items ?? [];

  const provisionKeys = useMemo(
    () => workshops.map(w => apiPaths.WORKSHOP_PROVISIONS({ workshopName: w.metadata.name, namespace: w.metadata.namespace })),
    [workshops],
  );
  const { data: allProvData, mutate: mutateProvisions } = useSWR<WorkshopProvisionList[]>(
    provisionKeys.length > 0 ? provisionKeys : null,
    (urls: string[]) => Promise.all(urls.map(u => fetcher(u) as Promise<WorkshopProvisionList>)),
    { refreshInterval: 30000 },
  );
  const provisionsByWorkshop = useMemo(() => {
    const map = new Map<string, WorkshopProvision[]>();
    if (allProvData) {
      workshops.forEach((ws, i) => {
        map.set(ws.metadata.name, allProvData[i]?.items ?? []);
      });
    }
    return map;
  }, [workshops, allProvData]);

  const getCurrentCount = useCallback((wsName: string): number | null => {
    const provs = provisionsByWorkshop.get(wsName);
    if (!provs || provs.length === 0) return null;
    return provs.reduce((sum, p) => sum + (p.spec?.count ?? 0), 0);
  }, [provisionsByWorkshop]);

  // ---------- Single global workshop filter ----------

  const workshopOptions = useMemo(() => {
    const names = new Set(workshops.map(w => displayName(w)));
    return Array.from(names).sort();
  }, [workshops]);

  const [workshopFilter, setWorkshopFilter] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);

  const targets = useMemo(
    () => workshopFilter ? workshops.filter(w => displayName(w) === workshopFilter) : workshops,
    [workshops, workshopFilter],
  );

  const scopeLabel = workshopFilter
    ? <>&ldquo;{workshopFilter}&rdquo; ({targets.length})</>
    : <>all {targets.length} workshop{targets.length !== 1 ? 's' : ''}</>;

  // ---------- Operation parameters ----------

  const [extStopDays, setExtStopDays] = useState(0);
  const [extStopHours, setExtStopHours] = useState(0);
  const [extDestroyDays, setExtDestroyDays] = useState(0);
  const [extDestroyHours, setExtDestroyHours] = useState(0);
  const [scaleCount, setScaleCount] = useState(5);

  // Loading states
  const [lockLoading, setLockLoading] = useState(false);
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [extStopLoading, setExtStopLoading] = useState(false);
  const [extDestroyLoading, setExtDestroyLoading] = useState(false);
  const [noAutostopLoading, setNoAutostopLoading] = useState(false);
  const [scaleLoading, setScaleLoading] = useState(false);

  // Confirmation modals
  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [showUnlockConfirm, setShowUnlockConfirm] = useState(false);
  const [showExtStopConfirm, setShowExtStopConfirm] = useState(false);
  const [showExtDestroyConfirm, setShowExtDestroyConfirm] = useState(false);
  const [showNoAutostopConfirm, setShowNoAutostopConfirm] = useState(false);
  const [showScaleZeroConfirm, setShowScaleZeroConfirm] = useState(false);
  const [showScaleConfirm, setShowScaleConfirm] = useState(false);

  const anyLoading = lockLoading || unlockLoading || extStopLoading || extDestroyLoading || noAutostopLoading || scaleLoading;

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

  const handleScale = async () => {
    if (scaleCount === 0 && !showScaleZeroConfirm) { setShowScaleZeroConfirm(true); return; }
    if (scaleCount > 0 && !showScaleConfirm) { setShowScaleConfirm(true); return; }
    setShowScaleZeroConfirm(false);
    setShowScaleConfirm(false);
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

  // ---------- Helpers ----------

  const fmtDate = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
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

  return (
    <div className="admin-container">
      {/* Toast alerts */}
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
            </Title>
          </SplitItem>
          <SplitItem>
            {workshops.length > 0 && (
              <Label isCompact color="blue" style={{ lineHeight: '36px' }}>
                {workshops.length} workshop{workshops.length !== 1 ? 's' : ''} in namespace
              </Label>
            )}
          </SplitItem>
        </Split>
      </PageSection>

      <PageSection key="body" className="admin-body" variant="light">
        {workshops.length === 0 ? (
          <EmptyState titleText="No workshops found" headingLevel="h4">
            <EmptyStateBody>
              No workshops exist in namespace <strong>{namespace}</strong>.
              Deploy workshops first, then return here for bulk operations.
            </EmptyStateBody>
          </EmptyState>
        ) : (
          <>
            {/* Global workshop scope selector */}
            <div className="ops-scope-bar">
              <label htmlFor="ops-scope" style={{ fontWeight: 600, marginRight: 8, whiteSpace: 'nowrap' }}>
                Scope
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
              <span className="ops-scope-summary">
                All operations below apply to {scopeLabel}
              </span>
            </div>

            <div className="ops-grid">
              {/* Resource Lock */}
              <Card isFullHeight>
                <CardTitle>Resource Lock</CardTitle>
                <CardBody>
                  <p className="ops-desc">
                    Toggle <code>demo.redhat.com/lock-enabled</code> on workshops.
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
              <Card isFullHeight>
                <CardTitle>
                  <Tooltip content="Sets the WorkshopProvision spec.count — replaces the current instance count.">
                    <span>Scale Workshops</span>
                  </Tooltip>
                </CardTitle>
                <CardBody>
                  <p className="ops-desc">
                    Sets <code>spec.count</code> to a new value.
                    This <strong>replaces</strong> the current instance count &mdash; lower = scale down, higher = scale up.
                  </p>
                  <div className="ops-number-row">
                    <NumberInput value={scaleCount} min={0}
                      onMinus={() => setScaleCount(Math.max(0, scaleCount - 1))}
                      onPlus={() => setScaleCount(scaleCount + 1)}
                      onChange={(e) => setScaleCount(Math.max(0, Number((e.target as HTMLInputElement).value)))}
                      widthChars={4} aria-label="New instance count" />
                    <span>new instance count</span>
                  </div>
                  <Button variant="primary" onClick={handleScale}
                    isLoading={scaleLoading} isDisabled={anyLoading}>
                    Scale
                  </Button>
                </CardBody>
              </Card>
            </div>

            {/* Workshop detail table */}
            <div className="ops-workshops-section">
              <Title headingLevel="h5" style={{ marginBottom: 12 }}>
                Workshops in scope
                <Badge isRead style={{ marginLeft: 8 }}>{targets.length}</Badge>
              </Title>
              <div className="ops-table-wrap">
                <table className="pf-v6-c-table pf-m-compact pf-m-grid-md" role="grid">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Lock</th>
                      <th>Type</th>
                      <th>Instances</th>
                      <th>Auto-Stop</th>
                      <th>Auto-Destroy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {targets.map(ws => {
                      const locked = isWorkshopLocked(ws);
                      const shared = ws.spec?.multiuserServices === true;
                      const currentCount = getCurrentCount(ws.metadata.name);
                      return (
                        <tr key={ws.metadata.uid || ws.metadata.name}>
                          <td>
                            <strong>{displayName(ws)}</strong>
                            <span className="ops-ws-meta">{ws.metadata.name}</span>
                          </td>
                          <td>
                            {locked ? (
                              <Tooltip content="Locked — non-admin users cannot modify">
                                <Icon status="warning"><LockIcon /></Icon>
                              </Tooltip>
                            ) : (
                              <Tooltip content="Unlocked">
                                <Icon status="success"><LockOpenIcon /></Icon>
                              </Tooltip>
                            )}
                          </td>
                          <td>
                            {shared ? (
                              <Label color="purple" isCompact icon={<UsersIcon />}>Shared</Label>
                            ) : (
                              <Label color="blue" isCompact>Standard</Label>
                            )}
                          </td>
                          <td>
                            {currentCount !== null ? (
                              <strong>{currentCount}</strong>
                            ) : (
                              <span style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>—</span>
                            )}
                          </td>
                          <td>{fmtDate(ws.spec?.actionSchedule?.stop)}</td>
                          <td>{fmtDate(ws.spec?.lifespan?.end)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </PageSection>

      {/* ---------- Confirmation modals ---------- */}

      <Modal variant="small" isOpen={showLockConfirm} onClose={() => setShowLockConfirm(false)} aria-labelledby="lock-confirm">
        <ModalHeader title="Confirm Lock" labelId="lock-confirm" titleIconVariant="warning" />
        <ModalBody>
          <p>
            Set <code>lock-enabled=true</code> on <strong>{targets.length} workshop(s)</strong>
            {workshopFilter ? <> matching &ldquo;{workshopFilter}&rdquo;</> : <> (all in {namespace})</>}.
          </p>
          <p style={{ marginTop: 8 }}>Non-admin users will not be able to modify these resources.</p>
        </ModalBody>
        <ModalFooter>
          <Button variant="warning" onClick={handleLock}>Lock</Button>
          <Button variant="link" onClick={() => setShowLockConfirm(false)}>Cancel</Button>
        </ModalFooter>
      </Modal>

      <Modal variant="small" isOpen={showUnlockConfirm} onClose={() => setShowUnlockConfirm(false)} aria-labelledby="unlock-confirm">
        <ModalHeader title="Confirm Unlock" labelId="unlock-confirm" />
        <ModalBody>
          <p>
            Set <code>lock-enabled=false</code> on <strong>{targets.length} workshop(s)</strong>
            {workshopFilter ? <> matching &ldquo;{workshopFilter}&rdquo;</> : <> (all in {namespace})</>}.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={handleUnlock}>Unlock</Button>
          <Button variant="link" onClick={() => setShowUnlockConfirm(false)}>Cancel</Button>
        </ModalFooter>
      </Modal>

      <Modal variant="small" isOpen={showExtStopConfirm} onClose={() => setShowExtStopConfirm(false)} aria-labelledby="ext-stop-confirm">
        <ModalHeader title="Confirm Extend Stop Time" labelId="ext-stop-confirm" />
        <ModalBody>
          <p>
            Extend auto-stop by <strong>{extStopDays}d {extStopHours}h</strong> on{' '}
            <strong>{targets.length} workshop(s)</strong>
            {workshopFilter ? <> matching &ldquo;{workshopFilter}&rdquo;</> : <> in {namespace}</>}.
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
          <p>
            Extend auto-destroy by <strong>{extDestroyDays}d {extDestroyHours}h</strong> on{' '}
            <strong>{targets.length} workshop(s)</strong>
            {workshopFilter ? <> matching &ldquo;{workshopFilter}&rdquo;</> : <> in {namespace}</>}.
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
          <p>
            Remove <code>actionSchedule.stop</code> from{' '}
            <strong>{targets.length} workshop(s)</strong>
            {workshopFilter ? <> matching &ldquo;{workshopFilter}&rdquo;</> : <> in {namespace}</>}.
          </p>
          <p style={{ marginTop: 8 }}>Workshops will remain running until their destroy deadline or manual stop. May incur additional cloud costs.</p>
        </ModalBody>
        <ModalFooter>
          <Button variant="warning" onClick={handleDisableAutostop}>Disable Auto-Stop</Button>
          <Button variant="link" onClick={() => setShowNoAutostopConfirm(false)}>Cancel</Button>
        </ModalFooter>
      </Modal>

      <Modal variant="small" isOpen={showScaleConfirm} onClose={() => setShowScaleConfirm(false)} aria-labelledby="scale-confirm">
        <ModalHeader title="Confirm Scale" labelId="scale-confirm" />
        <ModalBody>
          <p>
            Set instance count to <strong>{scaleCount}</strong> on{' '}
            <strong>{targets.length} workshop(s)</strong>
            {workshopFilter ? <> matching &ldquo;{workshopFilter}&rdquo;</> : <> in {namespace}</>}.
          </p>
          {targets.length > 0 && (
            <table className="pf-v6-c-table pf-m-compact" style={{ marginTop: 12 }}>
              <thead><tr><th>Workshop</th><th>Current</th><th></th><th>New</th></tr></thead>
              <tbody>
                {targets.map(ws => {
                  const cur = getCurrentCount(ws.metadata.name);
                  const direction = cur === null ? '' : scaleCount > cur ? '(scale up)' : scaleCount < cur ? '(scale down)' : '(no change)';
                  return (
                    <tr key={ws.metadata.name}>
                      <td>{displayName(ws)}</td>
                      <td><strong>{cur ?? '?'}</strong></td>
                      <td>&rarr;</td>
                      <td><strong>{scaleCount}</strong> <span style={{ fontSize: '0.85em', color: 'var(--pf-t--global--text--color--subtle)' }}>{direction}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--pf-t--global--text--color--subtle)' }}>
            This replaces the current <code>spec.count</code>. Each instance serves the workshop&rsquo;s configured number of users.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={handleScale}>Scale</Button>
          <Button variant="link" onClick={() => setShowScaleConfirm(false)}>Cancel</Button>
        </ModalFooter>
      </Modal>

      <Modal variant="small" isOpen={showScaleZeroConfirm} onClose={() => setShowScaleZeroConfirm(false)} aria-labelledby="scale-zero-confirm">
        <ModalHeader title="Confirm Scale to Zero" labelId="scale-zero-confirm" titleIconVariant="danger" />
        <ModalBody>
          <p>
            Scaling to <strong>0</strong> will remove all instances on{' '}
            <strong>{targets.length} workshop(s)</strong>
            {workshopFilter ? <> matching &ldquo;{workshopFilter}&rdquo;</> : <> in {namespace}</>}.
          </p>
          <p style={{ marginTop: 8 }}>All running resources will be destroyed. Students will lose access immediately.</p>
        </ModalBody>
        <ModalFooter>
          <Button variant="danger" onClick={handleScale}>Scale to Zero</Button>
          <Button variant="link" onClick={() => setShowScaleZeroConfirm(false)}>Cancel</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};

export default Ops;
