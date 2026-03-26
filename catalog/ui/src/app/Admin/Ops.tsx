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
import CheckCircleIcon from '@patternfly/react-icons/dist/js/icons/check-circle-icon';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
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

const CIFilter: React.FC<{
  options: string[];
  value: string;
  onChange: (val: string) => void;
  id: string;
}> = ({ options, value, onChange, id }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div style={{ marginBottom: 12 }}>
      <label htmlFor={id} style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem', fontWeight: 600 }}>
        Target Workshop
      </label>
      <Select
        id={id}
        isOpen={isOpen}
        selected={value}
        onSelect={(_e, val) => { onChange(val as string); setIsOpen(false); }}
        onOpenChange={setIsOpen}
        toggle={(toggleRef) => (
          <MenuToggle ref={toggleRef} onClick={() => setIsOpen(p => !p)} isExpanded={isOpen} isFullWidth>
            {value || 'All Workshops'}
          </MenuToggle>
        )}
        shouldFocusToggleOnSelect
      >
        <SelectList>
          <SelectOption value="">All Workshops</SelectOption>
          {options.map(ci => <SelectOption key={ci} value={ci}>{ci}</SelectOption>)}
        </SelectList>
      </Select>
    </div>
  );
};

const FETCH_LIMIT = 500;
let alertKeyCounter = 0;

const Ops: React.FC = () => {
  const navigate = useNavigate();
  const { namespace } = useParams();

  const [alerts, setAlerts] = useState<OpsAlert[]>([]);

  const addAlert = useCallback((variant: AlertVariant, title: string, description?: string) => {
    const key = ++alertKeyCounter;
    setAlerts(prev => [{ key, variant, title, description }, ...prev]);
    setTimeout(() => setAlerts(prev => prev.filter(a => a.key !== key)), 8000);
  }, []);

  const removeAlert = useCallback((key: number) => {
    setAlerts(prev => prev.filter(a => a.key !== key));
  }, []);

  const { data: workshopsData, mutate: mutateWorkshops } = useSWR<WorkshopList>(
    namespace ? apiPaths.WORKSHOPS({ namespace, limit: FETCH_LIMIT }) : null,
    fetcher,
    { refreshInterval: 30000 },
  );
  const workshops = workshopsData?.items ?? [];

  const workshopOptions = useMemo(() => {
    const names = new Set(workshops.map(w => displayName(w)));
    return Array.from(names).sort();
  }, [workshops]);

  const filterWorkshops = useCallback(
    (filter: string): Workshop[] =>
      filter ? workshops.filter(w => displayName(w) === filter) : workshops,
    [workshops],
  );

  // Operation state
  const [lockFilter, setLockFilter] = useState('');
  const [extStopFilter, setExtStopFilter] = useState('');
  const [extStopDays, setExtStopDays] = useState(0);
  const [extStopHours, setExtStopHours] = useState(0);
  const [extDestroyFilter, setExtDestroyFilter] = useState('');
  const [extDestroyDays, setExtDestroyDays] = useState(0);
  const [extDestroyHours, setExtDestroyHours] = useState(0);
  const [noAutostopFilter, setNoAutostopFilter] = useState('');
  const [scaleFilter, setScaleFilter] = useState('');
  const [scaleCount, setScaleCount] = useState(20);

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

  // ---------- Handlers ----------

  const handleLock = async () => {
    setShowLockConfirm(false);
    setLockLoading(true);
    const targets = filterWorkshops(lockFilter);
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
    const targets = filterWorkshops(lockFilter);
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
    const targets = filterWorkshops(extStopFilter);
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
    const targets = filterWorkshops(extDestroyFilter);
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
    const targets = filterWorkshops(noAutostopFilter);
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
    const targets = filterWorkshops(scaleFilter);
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
    if (fail === 0) addAlert(AlertVariant.success, `Scaled ${ok} workshop(s) to ${scaleCount} instances`);
    else addAlert(AlertVariant.danger, `Scale: ${ok} succeeded, ${fail} failed`);
  };

  // ---------- Computed ----------

  const lockAffectedCount = useMemo(() => filterWorkshops(lockFilter).length, [filterWorkshops, lockFilter]);
  const extStopAffectedCount = useMemo(() => filterWorkshops(extStopFilter).length, [filterWorkshops, extStopFilter]);
  const extDestroyAffectedCount = useMemo(() => filterWorkshops(extDestroyFilter).length, [filterWorkshops, extDestroyFilter]);
  const noAutostopAffectedCount = useMemo(() => filterWorkshops(noAutostopFilter).length, [filterWorkshops, noAutostopFilter]);
  const scaleAffectedCount = useMemo(() => filterWorkshops(scaleFilter).length, [filterWorkshops, scaleFilter]);

  const scaleTargets = useMemo(() => filterWorkshops(scaleFilter), [filterWorkshops, scaleFilter]);
  const sharedScaleTargets = useMemo(
    () => scaleTargets.filter(ws => ws.spec?.multiuserServices === true),
    [scaleTargets],
  );

  // Workshops visible in the detail table (union of all active filters, or all if none set)
  const activeFilters = new Set([lockFilter, extStopFilter, extDestroyFilter, noAutostopFilter, scaleFilter].filter(Boolean));
  const visibleWorkshops = useMemo(() => {
    if (activeFilters.size === 0) return workshops;
    return workshops.filter(w => activeFilters.has(displayName(w)));
  }, [workshops, ...activeFilters]);

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
              onSelect={(n) => navigate(`/admin/ops/${n.name}`)}
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
                {workshops.length} workshop{workshops.length !== 1 ? 's' : ''}
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
            <Alert variant="info" isInline isPlain title="Bulk Operations" style={{ marginBottom: 16 }}>
              Operations apply to all workshops in <strong>{namespace}</strong>.
              Use the &ldquo;Target Workshop&rdquo; dropdown on each card to limit scope to a specific workshop.
            </Alert>

            <div className="ops-grid">
              {/* Resource Lock */}
              <Card isFullHeight>
                <CardTitle>Resource Lock</CardTitle>
                <CardBody>
                  <CIFilter options={workshopOptions} value={lockFilter} onChange={setLockFilter} id="lock-filter" />
                  <p className="ops-desc">
                    Toggle <code>demo.redhat.com/lock-enabled</code> on workshops.
                    Locked resources cannot be modified by non-admin users.
                  </p>
                  <div className="ops-button-row">
                    <Button variant="warning" onClick={() => setShowLockConfirm(true)}
                      isLoading={lockLoading} isDisabled={lockLoading || unlockLoading}>Lock</Button>
                    <Button variant="secondary" onClick={() => setShowUnlockConfirm(true)}
                      isLoading={unlockLoading} isDisabled={lockLoading || unlockLoading}>Unlock</Button>
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
                  <CIFilter options={workshopOptions} value={extStopFilter} onChange={setExtStopFilter} id="ext-stop-filter" />
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
                    isLoading={extStopLoading} isDisabled={extStopLoading || (extStopDays === 0 && extStopHours === 0)}>
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
                  <CIFilter options={workshopOptions} value={extDestroyFilter} onChange={setExtDestroyFilter} id="ext-destroy-filter" />
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
                    isLoading={extDestroyLoading} isDisabled={extDestroyLoading || (extDestroyDays === 0 && extDestroyHours === 0)}>
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
                  <CIFilter options={workshopOptions} value={noAutostopFilter} onChange={setNoAutostopFilter} id="no-autostop-filter" />
                  <p className="ops-desc">
                    Removes <code>actionSchedule.stop</code> so workshops remain running
                    until their destroy deadline or manual stop.
                  </p>
                  <Button variant="warning" onClick={handleDisableAutostop}
                    isLoading={noAutostopLoading} isDisabled={noAutostopLoading}>
                    Disable Auto-Stop
                  </Button>
                </CardBody>
              </Card>

              {/* Scale */}
              <Card isFullHeight>
                <CardTitle>
                  <Tooltip content="Change the WorkshopProvision spec.count (instance count) for workshops.">
                    <span>Scale Workshops</span>
                  </Tooltip>
                </CardTitle>
                <CardBody>
                  <CIFilter options={workshopOptions} value={scaleFilter} onChange={setScaleFilter} id="scale-filter" />
                  <Alert variant="info" isInline isPlain title="Instance count" style={{ marginBottom: 8 }}>
                    This scales the WorkshopProvision <code>spec.count</code> (instance count), not the number of end-users.
                    If a workshop is configured for 20 users per instance, scaling to {scaleCount} means {scaleCount} instances &times; 20 users = {scaleCount * 20} total users.
                  </Alert>
                  <div className="ops-number-row">
                    <NumberInput value={scaleCount} min={0}
                      onMinus={() => setScaleCount(Math.max(0, scaleCount - 1))}
                      onPlus={() => setScaleCount(scaleCount + 1)}
                      onChange={(e) => setScaleCount(Math.max(0, Number((e.target as HTMLInputElement).value)))}
                      widthChars={4} aria-label="Target count" />
                    <Tooltip content="WorkshopProvision spec.count — the number of provisioned instances"><span>instance count</span></Tooltip>
                  </div>
                  <Button variant="primary" onClick={handleScale}
                    isLoading={scaleLoading} isDisabled={scaleLoading}>
                    Scale
                  </Button>
                </CardBody>
              </Card>
            </div>

            {/* Workshop detail table */}
            <div className="ops-workshops-section">
              <Title headingLevel="h5" style={{ marginBottom: 12 }}>
                Workshops in scope
                <Badge isRead style={{ marginLeft: 8 }}>{visibleWorkshops.length}</Badge>
              </Title>
              <div className="ops-table-wrap">
                <table className="pf-v6-c-table pf-m-compact pf-m-grid-md" role="grid">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Lock</th>
                      <th>Type</th>
                      <th>Auto-Stop</th>
                      <th>Auto-Destroy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleWorkshops.map(ws => {
                      const locked = isWorkshopLocked(ws);
                      const shared = ws.spec?.multiuserServices === true;
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
            Set <code>demo.redhat.com/lock-enabled=true</code> on{' '}
            <strong>{lockAffectedCount} workshop(s)</strong>
            {lockFilter ? <> matching &ldquo;{lockFilter}&rdquo;</> : <> (all in {namespace})</>}.
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
            Set <code>demo.redhat.com/lock-enabled=false</code> on{' '}
            <strong>{lockAffectedCount} workshop(s)</strong>
            {lockFilter ? <> matching &ldquo;{lockFilter}&rdquo;</> : <> (all in {namespace})</>}.
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
            <strong>{extStopAffectedCount} workshop(s)</strong>
            {extStopFilter ? <> matching &ldquo;{extStopFilter}&rdquo;</> : <> in {namespace}</>}.
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
            <strong>{extDestroyAffectedCount} workshop(s)</strong>
            {extDestroyFilter ? <> matching &ldquo;{extDestroyFilter}&rdquo;</> : <> in {namespace}</>}.
          </p>
          <p style={{ marginTop: 8 }}>This pushes back the permanent destruction deadline for these resources.</p>
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
            <strong>{noAutostopAffectedCount} workshop(s)</strong>
            {noAutostopFilter ? <> matching &ldquo;{noAutostopFilter}&rdquo;</> : <> in {namespace}</>}.
          </p>
          <p style={{ marginTop: 8 }}>Workshops will remain running until their destroy deadline or manual stop. This may incur additional cloud costs.</p>
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
            Scale to <strong>{scaleCount}</strong> instances on{' '}
            <strong>{scaleAffectedCount} workshop(s)</strong>
            {scaleFilter ? <> matching &ldquo;{scaleFilter}&rdquo;</> : <> in {namespace}</>}.
          </p>
          <p style={{ marginTop: 8 }}>
            This sets the WorkshopProvision <code>spec.count</code> (instance count), not the number of end-users.
            Each instance serves the workshop&rsquo;s configured user count.
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
            Scaling to <strong>0</strong> will remove all workshop instances on{' '}
            <strong>{scaleAffectedCount} workshop(s)</strong>
            {scaleFilter ? <> matching &ldquo;{scaleFilter}&rdquo;</> : <> in {namespace}</>}.
          </p>
          <p style={{ marginTop: 8 }}>This will destroy all running resources. Students will lose access immediately.</p>
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
