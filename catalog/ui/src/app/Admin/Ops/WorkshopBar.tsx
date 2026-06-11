import React, { useCallback, useMemo } from 'react';
import { Checkbox, Tooltip } from '@patternfly/react-core';
import { Workshop, WorkshopWithResourceClaims, MultiWorkshop } from '@app/types';
import { displayName, BABYLON_DOMAIN, getStageFromK8sObject } from '@app/util';
import { dateUrgency, relativeTime } from '../Ops';

interface ProvisionProgress {
  desired: number;
  claimed: number;
  failed: number;
  concurrency: number;
}

export interface WorkshopBarProps {
  workshop: WorkshopWithResourceClaims;
  viewStart: Date;
  viewEnd: Date;
  isSelected: boolean;
  onSelect: (id: string, selected: boolean) => void;
  onClick: (id: string) => void;
  getSeats: (ws: Workshop) => { assigned: number; total: number } | null;
  getProvisionProgress: (ws: Workshop) => ProvisionProgress | null;
  getCurrentCount: (ws: Workshop) => number | null;
  multiWorkshopsByName: Map<string, MultiWorkshop>;
  isMultiNs: boolean;
  timezone: string;
}

function getWorkshopStatus(workshop: WorkshopWithResourceClaims): 'running' | 'failed' | 'scheduled' | 'stopped' {
  const now = Date.now();
  const resourceClaims = workshop.resourceClaims || [];

  const hasFailed = resourceClaims.some(rc => {
    const state = rc.status?.resources?.[0]?.state;
    if (!state || state.kind !== 'AnarchySubject') return false;
    const provisionState = state.spec?.vars?.current_state;
    return provisionState === 'provision-failed' || provisionState === 'provision-error';
  });

  if (hasFailed) return 'failed';

  if (workshop.spec?.provisionDisabled) return 'stopped';

  const hasStarted = resourceClaims.some(rc =>
    rc.status?.resources?.[0]?.state?.spec?.vars?.current_state === 'started' ||
    rc.status?.resources?.[0]?.state?.spec?.vars?.current_state === 'provision-complete'
  );

  const startDate = workshop.spec?.actionSchedule?.start || workshop.spec?.lifespan?.start;
  const stopDate = workshop.spec?.actionSchedule?.stop;

  if (startDate && new Date(startDate).getTime() > now) return 'scheduled';
  if (stopDate && new Date(stopDate).getTime() < now && !hasStarted) return 'stopped';
  if (hasStarted) return 'running';

  return 'scheduled';
}

function getWorkshopDates(workshop: WorkshopWithResourceClaims): { start: Date; end: Date } {
  const lifespan = workshop.spec?.lifespan;
  let start = new Date();
  let end = new Date();
  end.setDate(end.getDate() + 7);
  if (lifespan?.start) start = new Date(lifespan.start);
  if (lifespan?.end) end = new Date(lifespan.end);
  return { start, end };
}

export const WorkshopBar: React.FC<WorkshopBarProps> = ({
  workshop,
  viewStart,
  viewEnd,
  isSelected,
  onSelect,
  onClick,
  getSeats,
  getProvisionProgress,
  getCurrentCount,
  multiWorkshopsByName,
  isMultiNs,
  timezone,
}) => {
  const { start: workshopStart, end: workshopEnd } = getWorkshopDates(workshop);
  const status = getWorkshopStatus(workshop);

  const totalViewMs = viewEnd.getTime() - viewStart.getTime();
  const clippedStart = new Date(Math.max(workshopStart.getTime(), viewStart.getTime()));
  const clippedEnd = new Date(Math.min(workshopEnd.getTime(), viewEnd.getTime()));
  const leftPercent = ((clippedStart.getTime() - viewStart.getTime()) / totalViewMs) * 100;
  const widthPercent = Math.max(((clippedEnd.getTime() - clippedStart.getTime()) / totalViewMs) * 100, 3);

  const workshopKey = `${workshop.metadata.namespace}/${workshop.metadata.name}`;
  const name = displayName(workshop);
  const ns = workshop.metadata.namespace;
  const stage = getStageFromK8sObject(workshop);

  const mwSource = workshop.metadata.annotations?.[`${BABYLON_DOMAIN}/multiworkshop-source`];
  const isMultiAsset = !!mwSource;

  const seats = useMemo(() => getSeats(workshop), [getSeats, workshop]);
  const progress = useMemo(() => getProvisionProgress(workshop), [getProvisionProgress, workshop]);
  const instanceCount = useMemo(() => getCurrentCount(workshop), [getCurrentCount, workshop]);

  const stopIso = workshop.spec?.actionSchedule?.stop;
  const destroyIso = workshop.spec?.lifespan?.end;
  const stopUrgency = dateUrgency(stopIso);
  const destroyUrgency = dateUrgency(destroyIso);

  const worstUrgency = stopUrgency === 'critical' || destroyUrgency === 'critical'
    ? 'critical'
    : stopUrgency === 'warning' || destroyUrgency === 'warning'
      ? 'warning'
      : null;

  const urgencyTag = useMemo(() => {
    if (status === 'stopped' || status === 'scheduled') return null;
    if (stopUrgency === 'critical' && stopIso) return `stop ${relativeTime(stopIso)}`;
    if (destroyUrgency === 'critical' && destroyIso) return `destroy ${relativeTime(destroyIso)}`;
    if (stopUrgency === 'warning' && stopIso) return `stop ${relativeTime(stopIso)}`;
    if (destroyUrgency === 'warning' && destroyIso) return `destroy ${relativeTime(destroyIso)}`;
    return null;
  }, [status, stopUrgency, destroyUrgency, stopIso, destroyIso]);

  const handleCheckboxChange = useCallback(
    (checked: boolean) => onSelect(workshopKey, checked),
    [onSelect, workshopKey]
  );

  const handleBarClick = useCallback(() => onClick(workshopKey), [onClick, workshopKey]);

  const seatText = seats ? `${seats.assigned}/${seats.total}` : null;
  const instanceText = instanceCount !== null ? `${instanceCount}` : progress ? `${progress.claimed}/${progress.desired}` : null;

  const formatShortDate = useCallback((d: Date): string => {
    return d.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: timezone,
    });
  }, [timezone]);

  const formatFullDate = useCallback((iso: string): string => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
      timeZone: timezone,
    });
  }, [timezone]);

  const barUrgencyClass = worstUrgency && status !== 'stopped' && status !== 'scheduled'
    ? ` timeline-bar--urgency-${worstUrgency}`
    : '';


  const tooltipContent = (
    <div className="timeline-bar-tooltip">
      <div className="timeline-bar-tooltip-name">{name}</div>
      <div className="timeline-bar-tooltip-meta">{workshop.metadata.name}</div>
      <table className="timeline-bar-tooltip-table">
        <tbody>
          <tr><td>Namespace</td><td>{ns}</td></tr>
          <tr><td>Status</td><td style={{ textTransform: 'capitalize' }}>{status}</td></tr>
          {stage && <tr><td>Stage</td><td>{stage}</td></tr>}
          {isMultiAsset && <tr><td>Type</td><td>Multi-Asset</td></tr>}
          {seats && <tr><td>Seats</td><td>{seats.assigned} / {seats.total} assigned</td></tr>}
          {progress && <tr><td>Instances</td><td>{progress.claimed} / {progress.desired}{progress.failed > 0 ? ` (${progress.failed} failed)` : ''}</td></tr>}
          {progress && progress.concurrency > 0 && <tr><td>Concurrency</td><td>{progress.concurrency}</td></tr>}
          <tr><td>Start</td><td>{formatShortDate(workshopStart)}</td></tr>
          <tr><td>End</td><td>{formatShortDate(workshopEnd)}</td></tr>
          {stopIso && (
            <tr>
              <td>Auto-Stop</td>
              <td className={stopUrgency === 'critical' ? 'timeline-tooltip-critical' : stopUrgency === 'warning' ? 'timeline-tooltip-warning' : ''}>
                {formatFullDate(stopIso)} ({relativeTime(stopIso)})
              </td>
            </tr>
          )}
          {destroyIso && (
            <tr>
              <td>Auto-Destroy</td>
              <td className={destroyUrgency === 'critical' ? 'timeline-tooltip-critical' : destroyUrgency === 'warning' ? 'timeline-tooltip-warning' : ''}>
                {formatFullDate(destroyIso)} ({relativeTime(destroyIso)})
              </td>
            </tr>
          )}
          {workshop.spec?.accessPassword && (
            <tr><td>Password</td><td><code className="timeline-tooltip-password">{workshop.spec.accessPassword}</code></td></tr>
          )}
          {workshop.spec?.openRegistration !== false
            ? <tr><td>Registration</td><td>Open</td></tr>
            : <tr><td>Registration</td><td>Pre-registration</td></tr>}
        </tbody>
      </table>
    </div>
  );

  return (
    <Tooltip content={tooltipContent} maxWidth="400px">
      <div
        className={`timeline-bar timeline-bar--${status}${isSelected ? ' timeline-bar--selected' : ''}${barUrgencyClass}`}
        style={{
          left: `${leftPercent}%`,
          width: `${widthPercent}%`,
        }}
        onClick={handleBarClick}
      >
        <Checkbox
          id={`timeline-cb-${workshop.metadata.name}`}
          isChecked={isSelected}
          onChange={(_event, checked) => handleCheckboxChange(checked)}
          onClick={(e) => e.stopPropagation()}
          className="timeline-bar__checkbox"
          aria-label={`Select ${name}`}
        />

        <span className="timeline-bar__name">{name}</span>

        <span className="timeline-bar__details">
          {urgencyTag && (
            <span className={`timeline-bar__badge timeline-bar__badge--urgency timeline-bar__badge--urgency-${worstUrgency}`}>
              {urgencyTag}
            </span>
          )}
          {isMultiNs && (
            <span className="timeline-bar__badge timeline-bar__badge--ns">{ns.replace(/^user-|-redhat-com.*$/g, '').slice(0, 20)}</span>
          )}
          {isMultiAsset && (
            <span className="timeline-bar__badge timeline-bar__badge--multi">MA</span>
          )}
          {seatText && (
            <span className={`timeline-bar__badge timeline-bar__badge--seats${seats && seats.assigned >= seats.total ? ' timeline-bar__badge--seats-full' : ''}`}>
              {seatText}
            </span>
          )}
          {instanceText && (
            <span className="timeline-bar__badge timeline-bar__badge--inst">
              {instanceText}
            </span>
          )}
          {progress && progress.failed > 0 && (
            <span className="timeline-bar__badge timeline-bar__badge--fail">
              {progress.failed}
            </span>
          )}
        </span>
      </div>
    </Tooltip>
  );
};

export default WorkshopBar;
