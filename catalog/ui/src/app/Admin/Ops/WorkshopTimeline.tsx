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
    const deploying = emptyRegionRecord(); // Scheduled workshops per deploy region
    const running = emptyRegionRecord();   // Running workshops per deploy region
    const delivering = emptyRegionRecord();// Workshops whose delivery is active during this region's hours

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

      const active = getWorkshopActiveRegions(ws);
      for (const rk of active) {
        delivering[rk]++;
      }
    }

    // Daily peak: for each region, find the busiest single day (support load)
    const dailyPeak: Record<string, { count: number; day: string }> = {};
    const days: Date[] = [];
    const cur = new Date(dateRange.start);
    while (cur <= dateRange.end) {
      days.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }

    for (const r of REGIONS) {
      let peak = 0;
      let peakDay = '';
      for (const day of days) {
        const dayStart = new Date(day);
        dayStart.setUTCHours(0, 0, 0, 0);
        const bizStartMs = dayStart.getTime() + r.startUtcH * 3600000;
        const bizEndMs = r.endUtcH > 24
          ? dayStart.getTime() + (r.endUtcH - 24) * 3600000 + 86400000
          : dayStart.getTime() + r.endUtcH * 3600000;

        let dayCount = 0;
        for (const ws of allVisible) {
          const startIso = ws.spec?.actionSchedule?.start || ws.spec?.lifespan?.start;
          const stopIso = ws.spec?.actionSchedule?.stop || ws.spec?.lifespan?.end;
          if (!startIso) continue;
          const wsStart = new Date(startIso).getTime();
          const wsEnd = stopIso ? new Date(stopIso).getTime() : wsStart + 8 * 3600000;
          if (wsStart < bizEndMs && wsEnd > bizStartMs) dayCount++;
        }
        if (dayCount > peak) {
          peak = dayCount;
          peakDay = day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        }
      }
      dailyPeak[r.key] = { count: peak, day: peakDay };
    }

    // Per-region overlap breakdown
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

    const spanning: Record<string, number> = {};
    for (const r of REGIONS) {
      spanning[r.key] = new Set(
        allVisible.filter(ws => {
          const active = getWorkshopActiveRegions(ws);
          return active.includes(r.key) && active.length > 1;
        }).map(ws => `${ws.metadata.namespace}/${ws.metadata.name}`)
      ).size;
    }

    return { counts, instances, deploying, running, delivering, spanning, overlapDetail, dailyPeak };
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
          onClick={() => setRegionFilter('all')}
          className="timeline-region-filter__btn"
        >
          All — {regionStats.counts.all} workshops · {regionStats.instances.all} instances
        </Label>
        {REGIONS.map(r => {
          const count = regionStats.counts[r.key];
          const inst = regionStats.instances[r.key];
          const deploy = regionStats.deploying[r.key];
          const run = regionStats.running[r.key];
          const spanning = regionStats.spanning[r.key];
          const overlaps = regionStats.overlapDetail[r.key] || {};
          const peak = regionStats.dailyPeak[r.key] || { count: 0, day: '' };
          const tzCity = r.tz.split('/').pop()?.replace(/_/g, ' ') || r.tz;
          const DAILY_SUPPORT_LIMIT = 5;
          // Support capacity = peak workshops active during biz hours on any single day
          const peakColor = peak.count >= DAILY_SUPPORT_LIMIT ? 'red' : peak.count >= DAILY_SUPPORT_LIMIT - 1 ? 'orange' : 'grey';
          // How many are from other regions on the peak day
          const fromOtherRegions = peak.count > count ? peak.count - count : 0;

          const regionLabelMap: Record<string, string> = {};
          REGIONS.forEach(rr => { regionLabelMap[rr.key] = rr.label; });

          const tooltipContent = (
            <div style={{ lineHeight: 1.5, minWidth: 240 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{r.label}</div>
              <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 10 }}>Business hours: 9am – 5pm {tzCity}</div>

              <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{count}</div>
                  <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>deploy</div>
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{inst}</div>
                  <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>instances</div>
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: peak.count >= DAILY_SUPPORT_LIMIT ? '#e53e3e' : peak.count >= DAILY_SUPPORT_LIMIT - 1 ? '#dd6b20' : 'inherit' }}>{peak.count}</div>
                  <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>peak/day</div>
                </div>
              </div>

              {(deploy > 0 || run > 0) && (
                <div style={{ marginBottom: 8 }}>
                  {deploy > 0 && <span style={{ fontSize: 11 }}>{deploy} scheduled · </span>}
                  {run > 0 && <span style={{ fontSize: 11 }}>{run} running</span>}
                </div>
              )}

              {peak.count > 0 && (
                <div style={{ fontSize: 12, padding: '6px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.08)', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600 }}>Busiest day:</span> {peak.day} — {peak.count} workshops active during biz hours
                  {fromOtherRegions > 0 && <span style={{ opacity: 0.8 }}> ({count} deploy here + {fromOtherRegions} from other regions)</span>}
                  {peak.count >= DAILY_SUPPORT_LIMIT && <div style={{ marginTop: 4, color: '#e53e3e', fontWeight: 600, fontSize: 11 }}>Soft limit: {DAILY_SUPPORT_LIMIT} workshops/day</div>}
                </div>
              )}

              {spanning > 0 && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', opacity: 0.5, marginBottom: 4, letterSpacing: '0.04em' }}>Cross-region</div>
                  {Object.entries(overlaps).map(([otherKey, n]) => (
                    <div key={otherKey} style={{ fontSize: 11, lineHeight: 1.7, paddingLeft: 2 }}>
                      ↔ {n} also active during {regionLabelMap[otherKey] || otherKey}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );

          // Label: lead with deploy count, show peak for support awareness
          const labelParts: string[] = [];
          if (count > 0) labelParts.push(`${count} deploy`);
          if (inst > 0) labelParts.push(`${inst} inst`);
          const labelMain = labelParts.length > 0 ? labelParts.join(' · ') : 'no deploys';

          return (
            <Tooltip key={r.key} content={tooltipContent} maxWidth="380px">
              <Label
                color={regionFilter === r.key ? 'blue' : peakColor === 'red' ? 'red' : peakColor === 'orange' ? 'orange' : 'grey'}
                onClick={() => setRegionFilter(regionFilter === r.key ? 'all' : r.key)}
                className="timeline-region-filter__btn"
              >
                {r.label} — {labelMain}
                {peak.count > 0 && <span className="timeline-region-peak"> · {peak.count}/day</span>}
                {spanning > 0 && <span className="timeline-region-overlap"> ↔{spanning}</span>}
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
