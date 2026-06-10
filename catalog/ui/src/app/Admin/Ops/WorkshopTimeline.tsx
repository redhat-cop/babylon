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

export function getWorkshopStatus(workshop: WorkshopWithResourceClaims): 'Running' | 'Failed' | 'Upcoming' | 'Stopped' {
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

  if (startDate && new Date(startDate).getTime() > now) return 'Upcoming';
  if (stopDate && new Date(stopDate).getTime() < now && !hasStarted) return 'Stopped';
  if (hasStarted) return 'Running';
  return 'Upcoming';
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

type StatusKey = 'Running' | 'Failed' | 'Upcoming' | 'Stopped';

const SELECT_BUTTONS: { label: string; status: StatusKey | 'all' | 'none'; color: 'green' | 'red' | 'blue' | 'orange' | 'grey' }[] = [
  { label: 'Select All', status: 'all', color: 'grey' },
  { label: 'Running', status: 'Running', color: 'green' },
  { label: 'Failed', status: 'Failed', color: 'red' },
  { label: 'Upcoming', status: 'Upcoming', color: 'blue' },
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

  const groupedWorkshops = useMemo(() => {
    const visible = workshops.filter(w => workshopInDateRange(w, dateRange.start, dateRange.end));
    const grouped: Record<StatusKey, WorkshopWithResourceClaims[]> = {
      Running: [], Failed: [], Upcoming: [], Stopped: [],
    };
    visible.forEach(ws => {
      grouped[getWorkshopStatus(ws)].push(ws);
    });
    return grouped;
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
    <div className="tl-container">
      <TimelineControls startDate={dateRange.start} endDate={dateRange.end} onDateChange={handleDateChange} timezone={timezone} />

      <div className="tl-quick-select">
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
              className="tl-quick-select__btn"
            >
              {btn.label}{count > 0 ? ` (${count})` : ''}
            </Label>
          );
        })}
        {selectedWorkshops.size > 0 && (
          <Badge isRead className="tl-quick-select__count">{selectedWorkshops.size} selected</Badge>
        )}
      </div>

      {totalWorkshops === 0 ? (
        <EmptyState>
          <EmptyStateBody>No workshops match the selected date range</EmptyStateBody>
        </EmptyState>
      ) : (
        <>
          <div className="tl-date-grid">
            {nowPercent !== null && (
              <div className="tl-now-marker" style={{ left: `${nowPercent}%` }} title="Now" />
            )}
            {dateGrid.map((day, i) => {
              const isToday = day.toDateString() === todayStr;
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
              return (
                <div
                  key={i}
                  className={`tl-date-cell${isToday ? ' tl-date-cell--today' : ''}${isWeekend ? ' tl-date-cell--weekend' : ''}`}
                >
                  <span className="tl-date-cell__dow">{formatDateCell(day, { weekday: 'short' })}</span>
                  <span className="tl-date-cell__day">{formatDateCell(day, { month: 'short', day: 'numeric' })}</span>
                </div>
              );
            })}
          </div>

          {(['Running', 'Failed', 'Upcoming', 'Stopped'] as const).map(status => (
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
