import React from 'react';
import {
  Button,
  Grid,
  GridItem,
  Tooltip,
} from '@patternfly/react-core';
import ClockIcon from '@patternfly/react-icons/dist/js/icons/clock-icon';
import CalendarAltIcon from '@patternfly/react-icons/dist/js/icons/calendar-alt-icon';
import SyncAltIcon from '@patternfly/react-icons/dist/js/icons/sync-alt-icon';

import { SchedulePreset } from '../../types/operations';

interface SchedulePresetsProps {
  onSelect: (preset: SchedulePreset) => void;
}

const QUICK_PRESETS: SchedulePreset[] = [
  {
    id: 'in-1-hour',
    label: 'In 1 hour',
    description: 'Execute 1 hour from now',
    relativeTo: 'now',
    offsetMinutes: 60,
    isRecurring: false,
  },
  {
    id: 'in-4-hours',
    label: 'In 4 hours',
    description: 'Execute 4 hours from now',
    relativeTo: 'now',
    offsetMinutes: 240,
    isRecurring: false,
  },
  {
    id: 'tonight-2am',
    label: 'Tonight at 2 AM',
    description: 'Execute at 2:00 AM tonight/tomorrow',
    relativeTo: 'endOfDay',
    offsetMinutes: 120, // 2 AM = 2 hours from midnight
    isRecurring: false,
  },
  {
    id: 'tomorrow-6am',
    label: 'Tomorrow at 6 AM',
    description: 'Execute at 6:00 AM tomorrow',
    relativeTo: 'startOfDay',
    offsetMinutes: 360, // 6 AM = 6 hours from start of day
    isRecurring: false,
  },
  {
    id: 'tomorrow-noon',
    label: 'Tomorrow at Noon',
    description: 'Execute at 12:00 PM tomorrow',
    relativeTo: 'startOfDay',
    offsetMinutes: 720, // 12 PM = 12 hours from start of day
    isRecurring: false,
  },
  {
    id: 'next-weekend',
    label: 'Next Weekend',
    description: 'Execute Saturday at 8 AM',
    relativeTo: 'startOfDay',
    offsetMinutes: 480, // 8 AM = 8 hours from start of day
    isRecurring: false,
  },
];

const RECURRING_PRESETS: SchedulePreset[] = [
  {
    id: 'daily-2am',
    label: 'Daily at 2 AM',
    description: 'Execute every day at 2:00 AM',
    cronExpression: '0 2 * * *',
    isRecurring: true,
  },
  {
    id: 'daily-6am',
    label: 'Daily at 6 AM',
    description: 'Execute every day at 6:00 AM',
    cronExpression: '0 6 * * *',
    isRecurring: true,
  },
  {
    id: 'daily-6pm',
    label: 'Daily at 6 PM',
    description: 'Execute every day at 6:00 PM',
    cronExpression: '0 18 * * *',
    isRecurring: true,
  },
  {
    id: 'weekly-sunday',
    label: 'Weekly on Sunday',
    description: 'Execute every Sunday at 2:00 AM',
    cronExpression: '0 2 * * 0',
    isRecurring: true,
  },
  {
    id: 'weekly-friday',
    label: 'Weekly on Friday',
    description: 'Execute every Friday at 6:00 PM',
    cronExpression: '0 18 * * 5',
    isRecurring: true,
  },
  {
    id: 'monthly-1st',
    label: 'Monthly on 1st',
    description: 'Execute on the 1st of every month at 2:00 AM',
    cronExpression: '0 2 1 * *',
    isRecurring: true,
  },
];

export const SchedulePresets: React.FC<SchedulePresetsProps> = ({ onSelect }) => {
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h4 style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <ClockIcon style={{ marginRight: 8 }} />
          One-time Execution
        </h4>
        <Grid hasGutter>
          {QUICK_PRESETS.map(preset => (
            <GridItem key={preset.id} span={12} sm={6} lg={4}>
              <Tooltip content={preset.description}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onSelect(preset)}
                  style={{ width: '100%', justifyContent: 'flex-start' }}
                >
                  <CalendarAltIcon style={{ marginRight: 4 }} />
                  {preset.label}
                </Button>
              </Tooltip>
            </GridItem>
          ))}
        </Grid>
      </div>

      <div>
        <h4 style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <SyncAltIcon style={{ marginRight: 8 }} />
          Recurring Execution
        </h4>
        <Grid hasGutter>
          {RECURRING_PRESETS.map(preset => (
            <GridItem key={preset.id} span={12} sm={6} lg={4}>
              <Tooltip content={`${preset.description} (${preset.cronExpression})`}>
                <Button
                  variant="tertiary"
                  size="sm"
                  onClick={() => onSelect(preset)}
                  style={{ width: '100%', justifyContent: 'flex-start' }}
                >
                  <SyncAltIcon style={{ marginRight: 4 }} />
                  {preset.label}
                </Button>
              </Tooltip>
            </GridItem>
          ))}
        </Grid>
      </div>
    </div>
  );
};