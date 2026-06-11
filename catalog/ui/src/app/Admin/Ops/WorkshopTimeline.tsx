import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Badge, EmptyState, EmptyStateBody, Label, Tooltip } from '@patternfly/react-core';
import { Workshop, WorkshopWithResourceClaims, MultiWorkshop } from '@app/types';
import TimelineControls from './TimelineControls';
import TimelineSwimlane from './TimelineSwimlane';

interface ProvisionProgress {
  desired: number;
  claimed: number;
  failed: number;
  concurrency: number;
}

export interface WorkshopTimelineProps {
  workshops: WorkshopWithResourceClaims[];
  selectedWorkshops: Set<string>;
  onSelectWorkshop: (id: string, selected: boolean) => void;
  onBatchSelect: (keys: string[]) => void;
  onDeselectAll: () => void;
  onClickWorkshop: (id: string) => void;
  getSeats: (ws: Workshop) => { assigned: number; total: number } | null;
  getProvisionProgress: (ws: Workshop) => ProvisionProgress | null;
  getCurrentCount: (ws: Workshop) => number | null;
  multiWorkshopsByName: Map<string, MultiWorkshop>;
  isMultiNs: boolean;
  timezone: string;
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

function getSunday(d: Date): Date {
  const monday = getMonday(d);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sunday;
}

function getStartOfDay(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getEndOfDay(d: Date): Date {
  const date = new Date(d);
  date.setHours(23, 59, 59, 999);
  return date;
}

function wsKey(ws: WorkshopWithResourceClaims): string {
  return `${ws.metadata.namespace}/${ws.metadata.name}`;
}

export function getWorkshopStatus(workshop: WorkshopWithResourceClaims): 'Running' | 'Failed' | 'Scheduled' | 'Stopped' {
  const now = Date.now();
  const resourceClaims = workshop.resourceClaims || [];

  const hasFailed = resourceClaims.some(rc => {
    const state = rc.status?.resources?.[0]?.state;
    if (!state || state.kind !== 'AnarchySubject') return false;
    const provisionState = state.spec?.vars?.current_state;
    return provisionState === 'provision-failed' || provisionState === 'provision-error';
  });
  if (hasFailed) return 'Failed';

  if (workshop.spec?.provisionDisabled) return 'Stopped';

  const hasStarted = resourceClaims.some(rc =>
    rc.status?.resources?.[0]?.state?.spec?.vars?.current_state === 'started' ||
    rc.status?.resources?.[0]?.state?.spec?.vars?.current_state === 'provision-complete'
  );

  const startDate = workshop.spec?.actionSchedule?.start || workshop.spec?.lifespan?.start;
  const stopDate = workshop.spec?.actionSchedule?.stop;

  if (startDate && new Date(startDate).getTime() > now) return 'Scheduled';
  if (stopDate && new Date(stopDate).getTime() < now && !hasStarted) return 'Stopped';
  if (hasStarted) return 'Running';
  return 'Scheduled';
}

function getWorkshopDates(workshop: WorkshopWithResourceClaims): { start: Date; end: Date } | null {
  const lifespan = workshop.spec?.lifespan;
  if (!lifespan?.start && !lifespan?.end) return null;
  let start = new Date();
  let end = new Date();
  end.setDate(end.getDate() + 7);
  if (lifespan?.start) start = new Date(lifespan.start);
  if (lifespan?.end) end = new Date(lifespan.end);
  return { start, end };
}

function workshopInDateRange(workshop: WorkshopWithResourceClaims, viewStart: Date, viewEnd: Date): boolean {
  const dates = getWorkshopDates(workshop);
  if (!dates) return true;
  return dates.start < viewEnd && dates.end > viewStart;
}

const STORAGE_KEY = 'opsTimelineDateRange';

type StatusKey = 'Running' | 'Failed' | 'Scheduled' | 'Stopped';

type RegionKey = 'all' | 'emea' | 'na-east' | 'na-west' | 'apac-india' | 'apac-aus';

const REGIONS: { key: RegionKey; label: string; tz: string; startUtcH: number; endUtcH: number }[] = [
  { key: 'apac-aus',   label: 'APAC Aus',     tz: 'Australia/Sydney',  startUtcH: 23,   endUtcH: 31 },  // wraps midnight
  { key: 'apac-india', label: 'APAC India',   tz: 'Asia/Kolkata',      startUtcH: 3.5,  endUtcH: 11.5 },
  { key: 'emea',       label: 'EMEA',         tz: 'Europe/Berlin',     startUtcH: 7,    endUtcH: 15 },
  { key: 'na-east',    label: 'NA East',      tz: 'America/New_York',  startUtcH: 13,   endUtcH: 21 },
  { key: 'na-west',    label: 'NA West',      tz: 'America/Los_Angeles', startUtcH: 16, endUtcH: 24 },
];

/** Primary region = classified by workshop start time (which region's 9-5 it kicks off in) */
function getWorkshopPrimaryRegion(ws: WorkshopWithResourceClaims): RegionKey | null {
  const startIso = ws.spec?.actionSchedule?.start || ws.spec?.lifespan?.start;
  if (!startIso) return null;
  const d = new Date(startIso);
  const utcH = d.getUTCHours() + d.getUTCMinutes() / 60;
  for (const r of REGIONS) {
    if (r.endUtcH > 24) {
      if (utcH >= r.startUtcH || utcH < (r.endUtcH - 24)) return r.key;
    } else {
      if (utcH >= r.startUtcH && utcH < r.endUtcH) return r.key;
    }
  }
  return null;
}

/**
 * All regions a workshop is active during (based on which 9-5 windows
 * the DELIVERY window overlaps — using actionSchedule start/stop, not full lifespan).
 * A workshop might deploy in APAC India (9am IST) and still be running during
 * EMEA business hours, so it spans both regions.
 */
function getWorkshopActiveRegions(ws: WorkshopWithResourceClaims): RegionKey[] {
  // Use actionSchedule (actual delivery window) for overlap detection
  const startIso = ws.spec?.actionSchedule?.start || ws.spec?.lifespan?.start;
  const stopIso = ws.spec?.actionSchedule?.stop || ws.spec?.lifespan?.end;
  if (!startIso) {
    const primary = getWorkshopPrimaryRegion(ws);
    return primary ? [primary] : [];
  }

  const deliveryStart = new Date(startIso);
  const deliveryEnd = stopIso ? new Date(stopIso) : new Date(deliveryStart.getTime() + 8 * 3600000); // default 8h

  const durationH = (deliveryEnd.getTime() - deliveryStart.getTime()) / 3600000;
  // If delivery window is > 24h (e.g., multi-day event), classify by primary only
  if (durationH >= 24) {
    const primary = getWorkshopPrimaryRegion(ws);
    return primary ? [primary] : [];
  }

  // Check which regions' business hours the delivery window overlaps
  const regions: RegionKey[] = [];
  const startDay = new Date(deliveryStart);
  startDay.setUTCHours(0, 0, 0, 0);

  for (const r of REGIONS) {
    const bizStartMs = startDay.getTime() + r.startUtcH * 3600000;
    const bizEndMs = r.endUtcH > 24
      ? startDay.getTime() + (r.endUtcH - 24) * 3600000 + 86400000
      : startDay.getTime() + r.endUtcH * 3600000;
    if (deliveryStart.getTime() < bizEndMs && deliveryEnd.getTime() > bizStartMs) {
      regions.push(r.key);
    }
  }
  return regions.length > 0 ? regions : (() => {
    const primary = getWorkshopPrimaryRegion(ws);
    return primary ? [primary] : [];
  })();
}

const SELECT_BUTTONS: { label: string; status: StatusKey | 'all' | 'none'; color: 'green' | 'red' | 'blue' | 'orange' | 'grey' }[] = [
  { label: 'Select All', status: 'all', color: 'grey' },
  { label: 'Running', status: 'Running', color: 'green' },
  { label: 'Failed', status: 'Failed', color: 'red' },
  { label: 'Scheduled', status: 'Scheduled', color: 'blue' },
  { label: 'Stopped', status: 'Stopped', color: 'orange' },
  { label: 'Deselect', status: 'none', color: 'grey' },
];

export const WorkshopTimeline: React.FC<WorkshopTimelineProps> = ({
  workshops,
  selectedWorkshops,
  onSelectWorkshop,
  onBatchSelect,
  onDeselectAll,
  onClickWorkshop,
  getSeats,
  getProvisionProgress,
  getCurrentCount,
  multiWorkshopsByName,
  isMultiNs,
  timezone,
}) => {
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { start: new Date(parsed.start), end: new Date(parsed.end) };
      }
    } catch (e) { /* ignore */ }
    const today = new Date();
    return { start: getStartOfDay(getMonday(today)), end: getEndOfDay(getSunday(today)) };
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString(),
      }));
    } catch (e) { /* ignore */ }
  }, [dateRange]);

  const handleDateChange = useCallback((start: Date, end: Date) => {
    setDateRange({ start, end });
  }, []);

  const [regionFilter, setRegionFilter] = useState<RegionKey>('all');

  const visibleWorkshops = useMemo(() => {
    let visible = workshops.filter(w => workshopInDateRange(w, dateRange.start, dateRange.end));
    if (regionFilter !== 'all') {
      visible = visible.filter(w => {
        const primary = getWorkshopPrimaryRegion(w);
        const active = getWorkshopActiveRegions(w);
        return primary === regionFilter || active.includes(regionFilter);
      });
    }
    return visible;
  }, [workshops, dateRange, regionFilter]);

  const groupedWorkshops = useMemo(() => {
    const grouped: Record<StatusKey, WorkshopWithResourceClaims[]> = {
      Running: [], Failed: [], Scheduled: [], Stopped: [],
    };
    visibleWorkshops.forEach(ws => {
      grouped[getWorkshopStatus(ws)].push(ws);
    });
    return grouped;
  }, [visibleWorkshops]);

  const regionStats = useMemo(() => {
    const allVisible = workshops.filter(w => workshopInDateRange(w, dateRange.start, dateRange.end));
    const emptyRegionRecord = (): Record<RegionKey, number> => ({ 'all': 0, 'emea': 0, 'na-east': 0, 'na-west': 0, 'apac-india': 0, 'apac-aus': 0 });

    const counts = emptyRegionRecord();   // Workshops by deploy region (primary)
    const instances = emptyRegionRecord(); // Instances by deploy region
    const deploying = emptyRegionRecord(); // Scheduled (deploying) workshops per region
    const running = emptyRegionRecord();   // Running workshops per region
    const delivering = emptyRegionRecord();// Workshops whose delivery spans INTO this region

    counts.all = allVisible.length;

    for (const ws of allVisible) {
      const primary = getWorkshopPrimaryRegion(ws);
      const count = getCurrentCount(ws) ?? 1;
      const status = getWorkshopStatus(ws);
      instances.all += count;

      if (primary) {
        counts[primary]++;
        instances[primary] += count;
        if (status === 'Scheduled') deploying[primary]++;
        if (status === 'Running') running[primary]++;
      }

      // Track which regions this workshop's delivery spans into
      const active = getWorkshopActiveRegions(ws);
      for (const rk of active) {
        delivering[rk]++;
      }
    }

    // Per-region overlap breakdown: how many workshops span from region X into region Y
    const overlapDetail: Record<string, Record<string, number>> = {};
    for (const r of REGIONS) {
      overlapDetail[r.key] = {};
      for (const ws of allVisible) {
        const active = getWorkshopActiveRegions(ws);
        if (!active.includes(r.key) || active.length <= 1) continue;
        for (const other of active) {
          if (other === r.key) continue;
          overlapDetail[r.key][other] = (overlapDetail[r.key][other] || 0) + 1;
        }
      }
    }

    // Total spanning count per region
    const spanning: Record<string, number> = {};
    for (const r of REGIONS) {
      spanning[r.key] = new Set(
        allVisible.filter(ws => {
          const active = getWorkshopActiveRegions(ws);
          return active.includes(r.key) && active.length > 1;
        }).map(ws => `${ws.metadata.namespace}/${ws.metadata.name}`)
      ).size;
    }

    return { counts, instances, deploying, running, delivering, spanning, overlapDetail };
  }, [workshops, dateRange, getCurrentCount]);

  const dateGrid = useMemo(() => {
    const days: Date[] = [];
    const current = new Date(dateRange.start);
    while (current <= dateRange.end) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return days;
  }, [dateRange]);

  const totalWorkshops = Object.values(groupedWorkshops).reduce((s, arr) => s + arr.length, 0);
  const todayStr = new Date().toDateString();

  const handleQuickSelect = useCallback((status: StatusKey | 'all' | 'none') => {
    if (status === 'none') {
      onDeselectAll();
      return;
    }
    if (status === 'all') {
      const allKeys: string[] = [];
      for (const arr of Object.values(groupedWorkshops)) {
        arr.forEach(ws => allKeys.push(wsKey(ws)));
      }
      onBatchSelect(allKeys);
      return;
    }
    const keys = (groupedWorkshops[status] || []).map(ws => wsKey(ws));
    onBatchSelect(keys);
  }, [groupedWorkshops, onBatchSelect, onDeselectAll]);

  const nowPercent = useMemo(() => {
    const now = Date.now();
    const start = dateRange.start.getTime();
    const end = dateRange.end.getTime();
    if (now < start || now > end) return null;
    return ((now - start) / (end - start)) * 100;
  }, [dateRange]);

  const formatDateCell = useCallback((day: Date, opts: Intl.DateTimeFormatOptions) => {
    if (timezone !== 'local') {
      return day.toLocaleDateString('en-US', { ...opts, timeZone: timezone });
    }
    return day.toLocaleDateString('en-US', opts);
  }, [timezone]);

  const swimlaneProps = {
    viewStart: dateRange.start,
    viewEnd: dateRange.end,
    selectedWorkshops,
    onSelectWorkshop,
    onClickWorkshop,
    getSeats,
    getProvisionProgress,
    getCurrentCount,
    multiWorkshopsByName,
    isMultiNs,
    timezone,
    nowPercent,
  };

  return (
    <div className="timeline-container">
      <TimelineControls startDate={dateRange.start} endDate={dateRange.end} onDateChange={handleDateChange} timezone={timezone} />

      <div className="timeline-quick-select">
        {SELECT_BUTTONS.map(btn => {
          const count = btn.status === 'all'
            ? totalWorkshops
            : btn.status === 'none'
              ? selectedWorkshops.size
              : (groupedWorkshops[btn.status] || []).length;
          if (btn.status !== 'all' && btn.status !== 'none' && count === 0) return null;
          return (
            <Label
              key={btn.label}
              color={btn.color as any}
              isCompact
              onClick={() => handleQuickSelect(btn.status)}
              className="timeline-quick-select__btn"
            >
              {btn.label}{count > 0 ? ` (${count})` : ''}
            </Label>
          );
        })}
        {selectedWorkshops.size > 0 && (
          <Badge isRead className="timeline-quick-select__count">{selectedWorkshops.size} selected</Badge>
        )}
      </div>

      <div className="timeline-region-filter">
        <span className="timeline-region-filter__label">Region:</span>
        <Label
          color={regionFilter === 'all' ? 'blue' : 'grey'}
          isCompact
          onClick={() => setRegionFilter('all')}
          className="timeline-region-filter__btn"
        >
          All: {regionStats.counts.all} workshops · {regionStats.instances.all} instances
        </Label>
        {REGIONS.map(r => {
          const count = regionStats.counts[r.key];
          const inst = regionStats.instances[r.key];
          const deploy = regionStats.deploying[r.key];
          const run = regionStats.running[r.key];
          const deliver = regionStats.delivering[r.key];
          const spanning = regionStats.spanning[r.key];
          const overlaps = regionStats.overlapDetail[r.key] || {};
          const tzCity = r.tz.split('/').pop()?.replace(/_/g, ' ') || r.tz;
          const REGION_LIMIT = 5;
          const atCapacity = count >= REGION_LIMIT;

          const regionLabelMap: Record<string, string> = {};
          REGIONS.forEach(rr => { regionLabelMap[rr.key] = rr.label; });

          const tooltipContent = (
            <div style={{ lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{r.label} — 9am-5pm {tzCity}</div>
              <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
                <tbody>
                  <tr><td style={{ paddingRight: 10, opacity: 0.8 }}>Deploy from</td><td style={{ fontWeight: 600 }}>{count} workshops · {inst} instances</td></tr>
                  {deploy > 0 && <tr><td style={{ paddingRight: 10, opacity: 0.8 }}>Deploying</td><td>{deploy} scheduled</td></tr>}
                  {run > 0 && <tr><td style={{ paddingRight: 10, opacity: 0.8 }}>Running</td><td>{run} active</td></tr>}
                  {deliver > count && <tr><td style={{ paddingRight: 10, opacity: 0.8 }}>Delivery active</td><td>{deliver} total (incl. from other regions)</td></tr>}
                  <tr>
                    <td style={{ paddingRight: 10, opacity: 0.8 }}>Capacity</td>
                    <td style={{ fontWeight: atCapacity ? 700 : 400, color: atCapacity ? '#ff6b6b' : 'inherit' }}>
                      {count}/{REGION_LIMIT}{atCapacity ? ' ⚠ at limit' : ''}
                    </td>
                  </tr>
                </tbody>
              </table>
              {spanning > 0 && (
                <div style={{ marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 4 }}>
                  <div style={{ fontWeight: 500, marginBottom: 2 }}>{spanning} span into other regions:</div>
                  {Object.entries(overlaps).map(([otherKey, n]) => (
                    <div key={otherKey} style={{ paddingLeft: 8, fontSize: 11 }}>↔ {n} with {regionLabelMap[otherKey] || otherKey}</div>
                  ))}
                </div>
              )}
            </div>
          );

          return (
            <Tooltip key={r.key} content={tooltipContent} maxWidth="320px">
              <Label
                color={regionFilter === r.key ? 'blue' : atCapacity ? 'red' : 'grey'}
                isCompact
                onClick={() => setRegionFilter(regionFilter === r.key ? 'all' : r.key)}
                className="timeline-region-filter__btn"
              >
                {r.label}: {count} ws · {inst} inst
                {spanning > 0 && <span className="timeline-region-overlap"> ↔{spanning}</span>}
                {atCapacity && <span className="timeline-region-overlap"> ⚠</span>}
              </Label>
            </Tooltip>
          );
        })}
      </div>

      {totalWorkshops === 0 ? (
        <EmptyState>
          <EmptyStateBody>No workshops match the selected filters</EmptyStateBody>
        </EmptyState>
      ) : (
        <>
          <div className="timeline-date-grid">
            {nowPercent !== null && (
              <div className="timeline-now-marker" style={{ left: `${nowPercent}%` }} title="Now" />
            )}
            {dateGrid.map((day, i) => {
              const isToday = day.toDateString() === todayStr;
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
              return (
                <div
                  key={i}
                  className={`timeline-date-cell${isToday ? ' timeline-date-cell--today' : ''}${isWeekend ? ' timeline-date-cell--weekend' : ''}`}
                >
                  <span className="timeline-date-cell__dow">{formatDateCell(day, { weekday: 'short' })}</span>
                  <span className="timeline-date-cell__day">{formatDateCell(day, { month: 'short', day: 'numeric' })}</span>
                  <div className="timeline-date-cell__hours">
                    {[9, 12, 17].map(h => (
                      <span key={h} className="timeline-date-cell__hour-mark" style={{ left: `${(h / 24) * 100}%` }}>
                        {h <= 12 ? `${h}${h === 12 ? 'pm' : 'am'}` : `${h - 12}pm`}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="timeline-timezone-label">
            Times shown in {timezone === 'local' ? `local time (${Intl.DateTimeFormat().resolvedOptions().timeZone})` : timezone} — change via timezone selector above
          </div>

          {(['Running', 'Failed', 'Scheduled', 'Stopped'] as const).map(status => (
            <TimelineSwimlane
              key={status}
              status={status}
              workshops={groupedWorkshops[status]}
              {...swimlaneProps}
            />
          ))}
        </>
      )}
    </div>
  );
};

export default WorkshopTimeline;
