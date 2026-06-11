import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Badge, EmptyState, EmptyStateBody, Label } from '@patternfly/react-core';
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

export type StatusKey = 'Running' | 'Failed' | 'Scheduled' | 'Stopped';

export type RegionKey = 'all' | 'emea' | 'na-east' | 'na-west' | 'apac-india' | 'apac-aus';

export const REGIONS: { key: RegionKey; label: string; tz: string; startUtcH: number; endUtcH: number }[] = [
  { key: 'apac-aus',   label: 'APAC Aus',     tz: 'Australia/Sydney',  startUtcH: 23,   endUtcH: 31 },  // wraps midnight
  { key: 'apac-india', label: 'APAC India',   tz: 'Asia/Kolkata',      startUtcH: 3.5,  endUtcH: 11.5 },
  { key: 'emea',       label: 'EMEA',         tz: 'Europe/Berlin',     startUtcH: 7,    endUtcH: 15 },
  { key: 'na-east',    label: 'NA East',      tz: 'America/New_York',  startUtcH: 13,   endUtcH: 21 },
  { key: 'na-west',    label: 'NA West',      tz: 'America/Los_Angeles', startUtcH: 16, endUtcH: 24 },
];

/** Primary region = classified by workshop start time (which region's 9-5 it kicks off in) */
export function getWorkshopPrimaryRegion(ws: WorkshopWithResourceClaims): RegionKey | null {
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
 * All regions a workshop is active during.
 * For running workshops: includes regions whose biz hours include "now"
 * (a running workshop needs support in whichever region is currently working).
 * For scheduled: uses actionSchedule delivery window overlap.
 * For stopped/failed: primary only.
 */
export function getWorkshopActiveRegions(ws: WorkshopWithResourceClaims): RegionKey[] {
  const status = getWorkshopStatus(ws);
  const primary = getWorkshopPrimaryRegion(ws);

  // Running workshops are active in every region whose biz hours include "now"
  if (status === 'Running') {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    const nowMs = now.getTime();
    const regions: RegionKey[] = primary ? [primary] : [];
    for (const r of REGIONS) {
      if (primary === r.key) continue; // already included
      const bizStartMs = todayStart.getTime() + r.startUtcH * 3600000;
      const bizEndMs = r.endUtcH > 24
        ? todayStart.getTime() + (r.endUtcH - 24) * 3600000 + 86400000
        : todayStart.getTime() + r.endUtcH * 3600000;
      if (nowMs >= bizStartMs && nowMs < bizEndMs) {
        regions.push(r.key);
      }
    }
    return regions.length > 0 ? regions : (primary ? [primary] : []);
  }

  // Stopped/failed: primary region only
  if (status === 'Stopped' || status === 'Failed') {
    return primary ? [primary] : [];
  }

  // Scheduled: use actionSchedule delivery window for overlap detection
  const startIso = ws.spec?.actionSchedule?.start || ws.spec?.lifespan?.start;
  const stopIso = ws.spec?.actionSchedule?.stop || ws.spec?.lifespan?.end;
  if (!startIso) {
    return primary ? [primary] : [];
  }

  const deliveryStart = new Date(startIso);
  const deliveryEnd = stopIso ? new Date(stopIso) : new Date(deliveryStart.getTime() + 8 * 3600000);

  const durationH = (deliveryEnd.getTime() - deliveryStart.getTime()) / 3600000;
  if (durationH >= 24) {
    return primary ? [primary] : [];
  }

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
  return regions.length > 0 ? regions : (primary ? [primary] : []);
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

  // Region and status filtering is done globally in Ops.tsx — timeline only filters by date range
  const visibleWorkshops = useMemo(() => {
    return workshops.filter(w => workshopInDateRange(w, dateRange.start, dateRange.end));
  }, [workshops, dateRange]);

  const groupedWorkshops = useMemo(() => {
    const grouped: Record<StatusKey, WorkshopWithResourceClaims[]> = {
      Running: [], Failed: [], Scheduled: [], Stopped: [],
    };
    visibleWorkshops.forEach(ws => {
      grouped[getWorkshopStatus(ws)].push(ws);
    });
    return grouped;
  }, [visibleWorkshops]);

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

      {totalWorkshops === 0 ? (
        <EmptyState>
          <EmptyStateBody>No workshops match the selected filters</EmptyStateBody>
        </EmptyState>
      ) : (
        <>
          {dateGrid.length === 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Label
                color="blue"
                isCompact
                onClick={() => {
                  const day = dateGrid[0];
                  handleDateChange(getStartOfDay(getMonday(day)), getEndOfDay(getSunday(day)));
                }}
                style={{ cursor: 'pointer' }}
              >
                ← Back to week
              </Label>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {formatDateCell(dateGrid[0], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
          )}
          <div className="timeline-date-grid">
            {nowPercent !== null && (
              <div className="timeline-now-marker" style={{ left: `${nowPercent}%` }} title="Now" />
            )}
            {dateGrid.map((day, i) => {
              const isToday = day.toDateString() === todayStr;
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
              const isSingleDay = dateGrid.length === 1;
              return (
                <div
                  key={i}
                  className={`timeline-date-cell${isToday ? ' timeline-date-cell--today' : ''}${isWeekend ? ' timeline-date-cell--weekend' : ''}${!isSingleDay ? ' timeline-date-cell--clickable' : ''}`}
                  onClick={!isSingleDay ? () => handleDateChange(getStartOfDay(day), getEndOfDay(day)) : undefined}
                  title={!isSingleDay ? `Click to zoom into ${formatDateCell(day, { weekday: 'long', month: 'long', day: 'numeric' })}` : undefined}
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
            Times in {timezone === 'local' ? `local time (${Intl.DateTimeFormat().resolvedOptions().timeZone})` : timezone} · change at timezone selector at top of screen
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
