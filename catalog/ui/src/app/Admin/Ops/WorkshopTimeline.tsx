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

/** Check if a workshop is active during a region's business hours on any day of its lifespan */
function getWorkshopRegions(ws: WorkshopWithResourceClaims): RegionKey[] {
  const dates = getWorkshopDates(ws);
  if (!dates) return [];

  const regions: RegionKey[] = [];
  const durationMs = dates.end.getTime() - dates.start.getTime();
  const durationH = durationMs / (1000 * 60 * 60);

  // If workshop spans 24+ hours it covers all regions
  if (durationH >= 24) return REGIONS.map(r => r.key);

  // Check each day the workshop is active
  const startDay = new Date(dates.start);
  startDay.setUTCHours(0, 0, 0, 0);
  const endDay = new Date(dates.end);
  endDay.setUTCHours(23, 59, 59, 999);

  for (const r of REGIONS) {
    let matched = false;
    const cursor = new Date(startDay);
    while (cursor <= endDay && !matched) {
      // Region business hours for this day (UTC)
      let bizStartMs = cursor.getTime() + r.startUtcH * 3600000;
      let bizEndMs = cursor.getTime() + r.endUtcH * 3600000;
      // Handle wrap-around for APAC Aus
      if (r.endUtcH > 24) {
        bizEndMs = cursor.getTime() + (r.endUtcH - 24) * 3600000 + 86400000;
      }
      // Workshop active during [dates.start, dates.end], biz hours [bizStart, bizEnd]
      if (dates.start.getTime() < bizEndMs && dates.end.getTime() > bizStartMs) {
        matched = true;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    if (matched) regions.push(r.key);
  }
  return regions;
}

/** Primary region = first region whose business hours the workshop starts in */
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
      visible = visible.filter(w => getWorkshopRegions(w).includes(regionFilter));
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
    const counts: Record<RegionKey, number> = { 'all': allVisible.length, 'emea': 0, 'na-east': 0, 'na-west': 0, 'apac-india': 0, 'apac-aus': 0 };

    // A workshop can span multiple regions, so count it in each region it's active during
    for (const ws of allVisible) {
      const regions = getWorkshopRegions(ws);
      for (const r of regions) counts[r]++;
    }

    // Count workshops that span multiple regions (overlap = active during 2+ regions' business hours)
    const spanning: Record<string, number> = {};
    for (const r of REGIONS) {
      let multiRegionCount = 0;
      for (const ws of allVisible) {
        const regions = getWorkshopRegions(ws);
        if (regions.includes(r.key) && regions.length > 1) multiRegionCount++;
      }
      spanning[r.key] = multiRegionCount;
    }

    return { counts, spanning };
  }, [workshops, dateRange]);

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
          All ({regionStats.counts.all})
        </Label>
        {REGIONS.map(r => {
          const count = regionStats.counts[r.key];
          const spanning = regionStats.spanning[r.key];
          const tzCity = r.tz.split('/').pop()?.replace(/_/g, ' ') || r.tz;
          const tooltipLines = [`${count} workshops active during 9-5 ${tzCity}`];
          if (spanning > 0) tooltipLines.push(`${spanning} also span other regions`);
          return (
            <Tooltip key={r.key} content={<span>{tooltipLines.join(' · ')}</span>}>
              <Label
                color={regionFilter === r.key ? 'blue' : 'grey'}
                isCompact
                onClick={() => setRegionFilter(regionFilter === r.key ? 'all' : r.key)}
                className="timeline-region-filter__btn"
              >
                {r.label} ({count}){spanning > 0 && <span className="timeline-region-overlap"> ↔{spanning}</span>}
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
                    {[6, 12, 18].map(h => (
                      <span key={h} className="timeline-date-cell__hour-mark" style={{ left: `${(h / 24) * 100}%` }}>
                        {`${String(h).padStart(2, '0')}:00`}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="timeline-timezone-label">
            Times shown in {timezone === 'local' ? `local time (${Intl.DateTimeFormat().resolvedOptions().timeZone})` : timezone}
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
