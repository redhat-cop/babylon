import React, { useCallback } from 'react';
import {
  Button,
  DatePicker,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core';

export interface TimelineControlsProps {
  startDate: Date;
  endDate: Date;
  onDateChange: (start: Date, end: Date) => void;
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

export const TimelineControls: React.FC<TimelineControlsProps> = ({
  startDate,
  endDate,
  onDateChange,
  timezone,
}) => {
  const handleToday = useCallback(() => {
    const today = new Date();
    onDateChange(getStartOfDay(today), getEndOfDay(today));
  }, [onDateChange]);

  const handleThisWeek = useCallback(() => {
    const today = new Date();
    const monday = getMonday(today);
    const sunday = getSunday(today);
    onDateChange(getStartOfDay(monday), getEndOfDay(sunday));
  }, [onDateChange]);

  const handleNextWeek = useCallback(() => {
    const today = new Date();
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + (7 - today.getDay() + 1));
    const nextSunday = new Date(nextMonday);
    nextSunday.setDate(nextMonday.getDate() + 6);
    onDateChange(getStartOfDay(nextMonday), getEndOfDay(nextSunday));
  }, [onDateChange]);

  const handleThisMonth = useCallback(() => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    onDateChange(getStartOfDay(firstDay), getEndOfDay(lastDay));
  }, [onDateChange]);

  const handleStartDateChange = useCallback(
    (_event: React.FormEvent<HTMLInputElement>, value: string) => {
      if (value) {
        const newStart = new Date(value);
        if (!isNaN(newStart.getTime())) {
          onDateChange(getStartOfDay(newStart), endDate);
        }
      }
    },
    [endDate, onDateChange]
  );

  const handleEndDateChange = useCallback(
    (_event: React.FormEvent<HTMLInputElement>, value: string) => {
      if (value) {
        const newEnd = new Date(value);
        if (!isNaN(newEnd.getTime())) {
          onDateChange(startDate, getEndOfDay(newEnd));
        }
      }
    },
    [startDate, onDateChange]
  );

  const formatDate = (date: Date): string => {
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    if (timezone !== 'local') opts.timeZone = timezone;
    return date.toLocaleDateString('en-US', opts);
  };

  return (
    <Toolbar>
      <ToolbarContent>
        <ToolbarGroup>
          <ToolbarItem>
            <Button variant="secondary" onClick={handleToday}>
              Today
            </Button>
          </ToolbarItem>
          <ToolbarItem>
            <Button variant="secondary" onClick={handleThisWeek}>
              This Week
            </Button>
          </ToolbarItem>
          <ToolbarItem>
            <Button variant="secondary" onClick={handleNextWeek}>
              Next Week
            </Button>
          </ToolbarItem>
          <ToolbarItem>
            <Button variant="secondary" onClick={handleThisMonth}>
              This Month
            </Button>
          </ToolbarItem>
        </ToolbarGroup>
        <ToolbarGroup>
          <ToolbarItem>
            <DatePicker
              value={startDate.toISOString().split('T')[0]}
              onChange={handleStartDateChange}
              aria-label="Start date"
              placeholder="Start date"
            />
          </ToolbarItem>
          <ToolbarItem>
            <DatePicker
              value={endDate.toISOString().split('T')[0]}
              onChange={handleEndDateChange}
              aria-label="End date"
              placeholder="End date"
            />
          </ToolbarItem>
        </ToolbarGroup>
        <ToolbarItem>
          <span style={{ whiteSpace: 'nowrap' }}>
            {formatDate(startDate)} - {formatDate(endDate)}
          </span>
        </ToolbarItem>
      </ToolbarContent>
    </Toolbar>
  );
};

export default TimelineControls;
