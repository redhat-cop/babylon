import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import useSWR from 'swr';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardTitle,
  EmptyState,
  EmptyStateBody,
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
import ProjectSelector from '@app/components/ProjectSelector';

import './admin.css';
import './ops.css';

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

const Ops: React.FC = () => {
  const navigate = useNavigate();
  const { namespace } = useParams();

  // Fetch workshops for this namespace
  const { data: workshopsData, mutate: mutateWorkshops } = useSWR<WorkshopList>(
    namespace ? apiPaths.WORKSHOPS({ namespace, limit: FETCH_LIMIT }) : null,
    fetcher,
    { refreshInterval: 30000 },
  );
  const workshops = workshopsData?.items ?? [];

  // Build CI filter options from workshop display names
  const workshopOptions = useMemo(() => {
    const names = new Set(workshops.map(w => displayName(w)));
    return Array.from(names).sort();
  }, [workshops]);

  // Helper: filter workshops by display name
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

  // Lock: set demo.redhat.com/lock-enabled = true
  const handleLock = async () => {
    setShowLockConfirm(false);
    setLockLoading(true);
    const targets = filterWorkshops(lockFilter);
    try {
      for (const ws of targets) {
        await lockWorkshop(ws);
      }
    } catch (e) {
      console.error('Lock failed', e);
    } finally {
      setLockLoading(false);
      mutateWorkshops();
    }
  };

  // Unlock: set demo.redhat.com/lock-enabled = false
  const handleUnlock = async () => {
    setShowUnlockConfirm(false);
    setUnlockLoading(true);
    const targets = filterWorkshops(lockFilter);
    try {
      for (const ws of targets) {
        await patchWorkshop({
          name: ws.metadata.name,
          namespace: ws.metadata.namespace,
          patch: { metadata: { labels: { [`${DEMO_DOMAIN}/lock-enabled`]: 'false' } } },
        });
      }
    } catch (e) {
      console.error('Unlock failed', e);
    } finally {
      setUnlockLoading(false);
      mutateWorkshops();
    }
  };

  // Extend Stop: push actionSchedule.stop forward by days/hours
  const handleExtendStop = async () => {
    if (extStopDays === 0 && extStopHours === 0) return;
    if (!showExtStopConfirm) { setShowExtStopConfirm(true); return; }
    setShowExtStopConfirm(false);
    setExtStopLoading(true);
    const targets = filterWorkshops(extStopFilter);
    const addMs = (extStopDays * 24 + extStopHours) * 3600_000;
    try {
      for (const ws of targets) {
        const currentStop = ws.spec?.actionSchedule?.stop;
        const base = currentStop ? new Date(currentStop) : new Date();
        const newDate = new Date(base.getTime() + addMs);
        await patchWorkshop({
          name: ws.metadata.name,
          namespace: ws.metadata.namespace,
          patch: { spec: { actionSchedule: { stop: dateToApiString(newDate) } } },
        });
      }
    } catch (e) {
      console.error('Extend stop failed', e);
    } finally {
      setExtStopLoading(false);
      mutateWorkshops();
    }
  };

  // Extend Destroy: push lifespan.end forward by days/hours
  const handleExtendDestroy = async () => {
    if (extDestroyDays === 0 && extDestroyHours === 0) return;
    if (!showExtDestroyConfirm) { setShowExtDestroyConfirm(true); return; }
    setShowExtDestroyConfirm(false);
    setExtDestroyLoading(true);
    const targets = filterWorkshops(extDestroyFilter);
    const addMs = (extDestroyDays * 24 + extDestroyHours) * 3600_000;
    try {
      for (const ws of targets) {
        const currentEnd = ws.spec?.lifespan?.end;
        const base = currentEnd ? new Date(currentEnd) : new Date();
        const newDate = new Date(base.getTime() + addMs);
        await patchWorkshop({
          name: ws.metadata.name,
          namespace: ws.metadata.namespace,
          patch: { spec: { lifespan: { end: dateToApiString(newDate) } } },
        });
      }
    } catch (e) {
      console.error('Extend destroy failed', e);
    } finally {
      setExtDestroyLoading(false);
      mutateWorkshops();
    }
  };

  // Disable Auto-Stop: remove actionSchedule.stop
  const handleDisableAutostop = async () => {
    if (!showNoAutostopConfirm) { setShowNoAutostopConfirm(true); return; }
    setShowNoAutostopConfirm(false);
    setNoAutostopLoading(true);
    const targets = filterWorkshops(noAutostopFilter);
    try {
      for (const ws of targets) {
        await patchWorkshop({
          name: ws.metadata.name,
          namespace: ws.metadata.namespace,
          jsonPatch: [{ op: 'remove', path: '/spec/actionSchedule/stop' }],
        });
      }
    } catch (e) {
      console.error('Disable auto-stop failed', e);
    } finally {
      setNoAutostopLoading(false);
      mutateWorkshops();
    }
  };

  // Scale: patch WorkshopProvision spec.count
  const handleScale = async () => {
    if (scaleCount === 0 && !showScaleZeroConfirm) { setShowScaleZeroConfirm(true); return; }
    if (scaleCount > 0 && !showScaleConfirm) { setShowScaleConfirm(true); return; }
    setShowScaleZeroConfirm(false);
    setShowScaleConfirm(false);
    setScaleLoading(true);
    const targets = filterWorkshops(scaleFilter);
    try {
      for (const ws of targets) {
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
      }
    } catch (e) {
      console.error('Scale failed', e);
    } finally {
      setScaleLoading(false);
    }
  };

  const lockAffectedCount = useMemo(() => filterWorkshops(lockFilter).length, [filterWorkshops, lockFilter]);
  const extStopAffectedCount = useMemo(() => filterWorkshops(extStopFilter).length, [filterWorkshops, extStopFilter]);
  const extDestroyAffectedCount = useMemo(() => filterWorkshops(extDestroyFilter).length, [filterWorkshops, extDestroyFilter]);
  const noAutostopAffectedCount = useMemo(() => filterWorkshops(noAutostopFilter).length, [filterWorkshops, noAutostopFilter]);
  const scaleAffectedCount = useMemo(() => filterWorkshops(scaleFilter).length, [filterWorkshops, scaleFilter]);

  if (!namespace) {
    return (
      <div className="admin-container">
        <PageSection key="header" className="admin-header" variant="light">
          <Split hasGutter>
            <SplitItem isFilled>
              <Title headingLevel="h4" style={{ display: 'inline-block' }}>Ops</Title>
            </SplitItem>
            <SplitItem>
              <ProjectSelector
                currentNamespaceName={namespace}
                onSelect={(n) => navigate(`/admin/ops/${n.name}`)}
              />
            </SplitItem>
          </Split>
        </PageSection>
        <PageSection key="body" className="admin-body" variant="light">
          <EmptyState titleText="Select a namespace" headingLevel="h4">
            <EmptyStateBody>
              Use the namespace selector above to choose a project, then perform bulk operations
              on all workshops in that namespace.
            </EmptyStateBody>
          </EmptyState>
        </PageSection>
      </div>
    );
  }

  return (
    <div className="admin-container">
      <PageSection key="header" className="admin-header" variant="light">
        <Split hasGutter>
          <SplitItem isFilled>
            <Title headingLevel="h4" style={{ display: 'inline-block' }}>
              Ops — <code>{namespace}</code>
              {workshops.length > 0 && <Label isCompact color="blue" style={{ marginLeft: 8 }}>{workshops.length} workshops</Label>}
            </Title>
          </SplitItem>
          <SplitItem>
            <ProjectSelector
              currentNamespaceName={namespace}
              onSelect={(n) => navigate(`/admin/ops/${n.name}`)}
            />
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
                  <Tooltip content="Change the number of workshop seat instances via WorkshopProvision spec.count.">
                    <span>Scale Workshops</span>
                  </Tooltip>
                </CardTitle>
                <CardBody>
                  <CIFilter options={workshopOptions} value={scaleFilter} onChange={setScaleFilter} id="scale-filter" />
                  <div className="ops-number-row">
                    <NumberInput value={scaleCount} min={0}
                      onMinus={() => setScaleCount(Math.max(0, scaleCount - 1))}
                      onPlus={() => setScaleCount(scaleCount + 1)}
                      onChange={(e) => setScaleCount(Math.max(0, Number((e.target as HTMLInputElement).value)))}
                      widthChars={4} aria-label="Target count" />
                    <Tooltip content="Number of workshop seat instances to provision"><span>target count</span></Tooltip>
                  </div>
                  <Button variant="primary" onClick={handleScale}
                    isLoading={scaleLoading} isDisabled={scaleLoading}>
                    Scale
                  </Button>
                </CardBody>
              </Card>
            </div>

          </>
        )}
      </PageSection>

      {/* Lock confirmation */}
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

      {/* Unlock confirmation */}
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

      {/* Extend stop confirmation */}
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

      {/* Extend destroy confirmation */}
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

      {/* Disable auto-stop confirmation */}
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

      {/* Scale confirmation */}
      <Modal variant="small" isOpen={showScaleConfirm} onClose={() => setShowScaleConfirm(false)} aria-labelledby="scale-confirm">
        <ModalHeader title="Confirm Scale" labelId="scale-confirm" />
        <ModalBody>
          <p>
            Scale to <strong>{scaleCount}</strong> seat instances on{' '}
            <strong>{scaleAffectedCount} workshop(s)</strong>
            {scaleFilter ? <> matching &ldquo;{scaleFilter}&rdquo;</> : <> in {namespace}</>}.
          </p>
          <p style={{ marginTop: 8 }}>This will modify the WorkshopProvision <code>spec.count</code> for each affected workshop.</p>
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={handleScale}>Scale</Button>
          <Button variant="link" onClick={() => setShowScaleConfirm(false)}>Cancel</Button>
        </ModalFooter>
      </Modal>

      {/* Scale-to-zero confirmation */}
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
