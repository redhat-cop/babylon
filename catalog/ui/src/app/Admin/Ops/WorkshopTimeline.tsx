import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, CardBody, EmptyState, EmptyStateBody } from '@patternfly/react-core';
import { Workshop } from '@app/types';
import TimelineControls from './TimelineControls';
import TimelineSwimlane from './TimelineSwimlane';

export interface WorkshopTimelineProps {
  workshops: Workshop[];
  selectedWorkshops: Set<string>;
  onSelectWorkshop: (id: string, selected: boolean) => void;
  onClickWorkshop: (id: string) => void;
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

function getWorkshopStatus(workshop: Workshop): 'Running' | 'Failed' | 'Upcoming' | 'Stopped' {
  const status = workshop.status;
  if (!status) return 'Upcoming';

  if (status.phase === 'Failed' || status.conditions?.some((c: any) => c.type === 'Failed' && c.status === 'True')) {
    return 'Failed';
  }

  if (status.phase === 'Running' || status.phase === 'Active') {
    return 'Running';
  }

  if (status.phase === 'Stopped' || status.phase === 'Terminated') {
    return 'Stopped';
  }

  return 'Upcoming';
}

function getWorkshopDates(workshop: Workshop): { start: Date; end: Date } | null {
  const spec = workshop.spec;
  const lifespan = spec?.lifespan;

  if (!lifespan?.start && !lifespan?.end) {
    return null;
  }

  let start = new Date();
  let end = new Date();
  end.setDate(end.getDate() + 7);

  if (lifespan?.start) {
    start = new Date(lifespan.start);
  }

  if (lifespan?.end) {
    end = new Date(lifespan.end);
  }

  return { start, end };
}

function workshopInDateRange(workshop: Workshop, viewStart: Date, viewEnd: Date): boolean {
  const dates = getWorkshopDates(workshop);
  if (!dates) return true; // Show workshops without dates

  return dates.start < viewEnd && dates.end > viewStart;
}

const STORAGE_KEY = 'opsTimelineDateRange';

export const WorkshopTimeline: React.FC<WorkshopTimelineProps> = ({
  workshops,
  selectedWorkshops,
  onSelectWorkshop,
  onClickWorkshop,
}) => {
  // Initialize date range from localStorage or default to "This Week"
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          start: new Date(parsed.start),
          end: new Date(parsed.end),
        };
      }
    } catch (e) {
      // Ignore parse errors
    }

    // Default to "This Week"
    const today = new Date();
    const monday = getMonday(today);
    const sunday = getSunday(today);
    return {
      start: getStartOfDay(monday),
      end: getEndOfDay(sunday),
    };
  });

  // Save date range to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          start: dateRange.start.toISOString(),
          end: dateRange.end.toISOString(),
        })
      );
    } catch (e) {
      // Ignore storage errors
    }
  }, [dateRange]);

  const handleDateChange = useCallback((start: Date, end: Date) => {
    setDateRange({ start, end });
  }, []);

  // Filter workshops to those visible in date range and group by status
  const groupedWorkshops = useMemo(() => {
    const visibleWorkshops = workshops.filter((w) => workshopInDateRange(w, dateRange.start, dateRange.end));

    const grouped = {
      Running: [] as Workshop[],
      Failed: [] as Workshop[],
      Upcoming: [] as Workshop[],
      Stopped: [] as Workshop[],
    };

    visibleWorkshops.forEach((workshop) => {
      const status = getWorkshopStatus(workshop);
      grouped[status].push(workshop);
    });

    return grouped;
  }, [workshops, dateRange]);

  // Generate date grid
  const dateGrid = useMemo(() => {
    const days: Date[] = [];
    const current = new Date(dateRange.start);

    while (current <= dateRange.end) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    return days;
  }, [dateRange]);

  const totalWorkshops =
    groupedWorkshops.Running.length +
    groupedWorkshops.Failed.length +
    groupedWorkshops.Upcoming.length +
    groupedWorkshops.Stopped.length;

  return (
    <div className="timeline-container">
      <TimelineControls
        startDate={dateRange.start}
        endDate={dateRange.end}
        onDateChange={handleDateChange}
      />

      {totalWorkshops === 0 ? (
        <EmptyState>
          <EmptyStateBody>No workshops match the selected date range</EmptyStateBody>
        </EmptyState>
      ) : (
        <>
          <div className="timeline-grid" style={{ display: 'flex', borderBottom: '1px solid #d2d2d2', padding: '8px 0' }}>
            {dateGrid.map((day, index) => {
              const isToday =
                day.toDateString() === new Date().toDateString();
              return (
                <div
                  key={index}
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    fontSize: '11px',
                    fontWeight: isToday ? 'bold' : 'normal',
                    color: isToday ? 'var(--pf-v5-global--primary-color--100)' : undefined,
                    borderRight: index < dateGrid.length - 1 ? '1px solid #f0f0f0' : 'none',
                  }}
                >
                  {day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
              );
            })}
          </div>

          <TimelineSwimlane
            status="Running"
            workshops={groupedWorkshops.Running}
            viewStart={dateRange.start}
            viewEnd={dateRange.end}
            selectedWorkshops={selectedWorkshops}
            onSelectWorkshop={onSelectWorkshop}
            onClickWorkshop={onClickWorkshop}
          />

          <TimelineSwimlane
            status="Failed"
            workshops={groupedWorkshops.Failed}
            viewStart={dateRange.start}
            viewEnd={dateRange.end}
            selectedWorkshops={selectedWorkshops}
            onSelectWorkshop={onSelectWorkshop}
            onClickWorkshop={onClickWorkshop}
          />

          <TimelineSwimlane
            status="Upcoming"
            workshops={groupedWorkshops.Upcoming}
            viewStart={dateRange.start}
            viewEnd={dateRange.end}
            selectedWorkshops={selectedWorkshops}
            onSelectWorkshop={onSelectWorkshop}
            onClickWorkshop={onClickWorkshop}
          />

          <TimelineSwimlane
            status="Stopped"
            workshops={groupedWorkshops.Stopped}
            viewStart={dateRange.start}
            viewEnd={dateRange.end}
            selectedWorkshops={selectedWorkshops}
            onSelectWorkshop={onSelectWorkshop}
            onClickWorkshop={onClickWorkshop}
          />
        </>
      )}
    </div>
  );
};

export default WorkshopTimeline;
