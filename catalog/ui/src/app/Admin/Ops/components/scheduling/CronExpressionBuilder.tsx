import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardBody,
  CardTitle,
  Checkbox,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Grid,
  GridItem,
} from '@patternfly/react-core';
import CogIcon from '@patternfly/react-icons/dist/js/icons/cog-icon';

import { CronExpression } from '../../types/operations';

interface CronExpressionBuilderProps {
  value: string;
  onChange: (cron: CronExpression) => void;
}

const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];
const WEEKDAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

const COMMON_PRESETS = [
  { label: 'Every minute', expression: '* * * * *' },
  { label: 'Every 5 minutes', expression: '*/5 * * * *' },
  { label: 'Every 15 minutes', expression: '*/15 * * * *' },
  { label: 'Every 30 minutes', expression: '*/30 * * * *' },
  { label: 'Every hour', expression: '0 * * * *' },
  { label: 'Every 6 hours', expression: '0 */6 * * *' },
  { label: 'Every 12 hours', expression: '0 */12 * * *' },
  { label: 'Daily at midnight', expression: '0 0 * * *' },
  { label: 'Daily at 2 AM', expression: '0 2 * * *' },
  { label: 'Daily at 6 AM', expression: '0 6 * * *' },
  { label: 'Daily at 12 PM', expression: '0 12 * * *' },
  { label: 'Daily at 6 PM', expression: '0 18 * * *' },
  { label: 'Weekly on Sunday', expression: '0 0 * * 0' },
  { label: 'Weekly on Monday', expression: '0 0 * * 1' },
  { label: 'Monthly on 1st', expression: '0 0 1 * *' },
  { label: 'Monthly on 15th', expression: '0 0 15 * *' },
];

export const CronExpressionBuilder: React.FC<CronExpressionBuilderProps> = ({
  value,
  onChange,
}) => {
  const [mode, setMode] = useState<'preset' | 'advanced'>('preset');
  const [selectedPreset, setSelectedPreset] = useState(value || '0 2 * * *');

  // Advanced mode state
  const [minute, setMinute] = useState('0');
  const [hour, setHour] = useState('2');
  const [dayOfMonth, setDayOfMonth] = useState('*');
  const [month, setMonth] = useState('*');
  const [dayOfWeek, setDayOfWeek] = useState('*');

  // Parse existing cron expression
  useEffect(() => {
    if (value && value !== selectedPreset) {
      const parts = value.trim().split(/\s+/);
      if (parts.length === 5) {
        setMinute(parts[0]);
        setHour(parts[1]);
        setDayOfMonth(parts[2]);
        setMonth(parts[3]);
        setDayOfWeek(parts[4]);

        // Check if it matches a preset
        const matchingPreset = COMMON_PRESETS.find(p => p.expression === value);
        if (matchingPreset) {
          setSelectedPreset(value);
          setMode('preset');
        } else {
          setMode('advanced');
        }
      }
    }
  }, [value, selectedPreset]);

  const buildExpression = useCallback((): CronExpression => {
    const expression = mode === 'preset'
      ? selectedPreset
      : `${minute} ${hour} ${dayOfMonth} ${month} ${dayOfWeek}`;

    const description = generateDescription(expression);

    return {
      minute: mode === 'preset' ? selectedPreset.split(' ')[0] : minute,
      hour: mode === 'preset' ? selectedPreset.split(' ')[1] : hour,
      dayOfMonth: mode === 'preset' ? selectedPreset.split(' ')[2] : dayOfMonth,
      month: mode === 'preset' ? selectedPreset.split(' ')[3] : month,
      dayOfWeek: mode === 'preset' ? selectedPreset.split(' ')[4] : dayOfWeek,
      expression,
      description,
    };
  }, [mode, selectedPreset, minute, hour, dayOfMonth, month, dayOfWeek]);

  // Notify parent of changes
  useEffect(() => {
    const cronExpr = buildExpression();
    if (cronExpr.expression !== value) {
      onChange(cronExpr);
    }
  }, [buildExpression, onChange, value]);

  const generateDescription = (expr: string): string => {
    const preset = COMMON_PRESETS.find(p => p.expression === expr);
    if (preset) {
      return preset.label;
    }

    const parts = expr.split(' ');
    const [m, h, dom, mon, dow] = parts;

    let desc = 'At ';

    // Time part
    if (h === '*') {
      if (m === '*') {
        desc += 'every minute';
      } else if (m.startsWith('*/')) {
        desc += `every ${m.slice(2)} minutes`;
      } else {
        desc += `${m} minute(s) past every hour`;
      }
    } else if (h.startsWith('*/')) {
      desc += `${m}:00, every ${h.slice(2)} hours`;
    } else {
      const hour24 = parseInt(h);
      const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
      const ampm = hour24 < 12 ? 'AM' : 'PM';
      desc += `${hour12}:${m.padStart(2, '0')} ${ampm}`;
    }

    // Day part
    if (dow !== '*') {
      if (dow.includes(',')) {
        const days = dow.split(',').map(d => WEEKDAYS[parseInt(d)]?.label).join(', ');
        desc += ` on ${days}`;
      } else {
        desc += ` on ${WEEKDAYS[parseInt(dow)]?.label}`;
      }
    } else if (dom !== '*') {
      if (dom.includes(',')) {
        desc += ` on days ${dom} of the month`;
      } else {
        desc += ` on day ${dom} of the month`;
      }
    } else {
      desc += ' every day';
    }

    // Month part
    if (mon !== '*') {
      if (mon.includes(',')) {
        const months = mon.split(',').map(m => MONTHS[parseInt(m) - 1]?.label).join(', ');
        desc += ` in ${months}`;
      } else {
        desc += ` in ${MONTHS[parseInt(mon) - 1]?.label}`;
      }
    }

    return desc;
  };

  return (
    <Card>
      <CardTitle>
        <CogIcon style={{ marginRight: 8 }} />
        Cron Expression Builder
      </CardTitle>
      <CardBody>
        <FormGroup fieldId="cron-mode">
          <Checkbox
            id="advanced-mode"
            label="Advanced mode (custom cron expression)"
            isChecked={mode === 'advanced'}
            onChange={(event, checked) => setMode(checked ? 'advanced' : 'preset')}
          />
        </FormGroup>

        {mode === 'preset' ? (
          <FormGroup label="Schedule Preset" fieldId="preset-select" isRequired>
            <FormSelect
              id="preset-select"
              value={selectedPreset}
              onChange={(event, value) => setSelectedPreset(value)}
              aria-label="Schedule preset"
            >
              {COMMON_PRESETS.map(preset => (
                <FormSelectOption
                  key={preset.expression}
                  value={preset.expression}
                  label={`${preset.label} (${preset.expression})`}
                />
              ))}
            </FormSelect>
          </FormGroup>
        ) : (
          <Grid hasGutter>
            <GridItem span={12} lg={6}>
              <FormGroup label="Minute" fieldId="cron-minute">
                <FormSelect
                  id="cron-minute"
                  value={minute}
                  onChange={(event, value) => setMinute(value)}
                  aria-label="Minute"
                >
                  <FormSelectOption value="*" label="Every minute (*)" />
                  <FormSelectOption value="*/5" label="Every 5 minutes (*/5)" />
                  <FormSelectOption value="*/10" label="Every 10 minutes (*/10)" />
                  <FormSelectOption value="*/15" label="Every 15 minutes (*/15)" />
                  <FormSelectOption value="*/30" label="Every 30 minutes (*/30)" />
                  {MINUTES.map(m => (
                    <FormSelectOption key={m} value={m.toString()} label={m.toString().padStart(2, '0')} />
                  ))}
                </FormSelect>
              </FormGroup>
            </GridItem>

            <GridItem span={12} lg={6}>
              <FormGroup label="Hour" fieldId="cron-hour">
                <FormSelect
                  id="cron-hour"
                  value={hour}
                  onChange={(event, value) => setHour(value)}
                  aria-label="Hour"
                >
                  <FormSelectOption value="*" label="Every hour (*)" />
                  <FormSelectOption value="*/2" label="Every 2 hours (*/2)" />
                  <FormSelectOption value="*/3" label="Every 3 hours (*/3)" />
                  <FormSelectOption value="*/6" label="Every 6 hours (*/6)" />
                  <FormSelectOption value="*/12" label="Every 12 hours (*/12)" />
                  {HOURS.map(h => (
                    <FormSelectOption
                      key={h}
                      value={h.toString()}
                      label={`${h.toString().padStart(2, '0')}:00 (${h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`})`}
                    />
                  ))}
                </FormSelect>
              </FormGroup>
            </GridItem>

            <GridItem span={12} lg={4}>
              <FormGroup label="Day of Month" fieldId="cron-day">
                <FormSelect
                  id="cron-day"
                  value={dayOfMonth}
                  onChange={(event, value) => setDayOfMonth(value)}
                  aria-label="Day of month"
                >
                  <FormSelectOption value="*" label="Every day (*)" />
                  {DAYS.map(d => (
                    <FormSelectOption key={d} value={d.toString()} label={d.toString()} />
                  ))}
                </FormSelect>
              </FormGroup>
            </GridItem>

            <GridItem span={12} lg={4}>
              <FormGroup label="Month" fieldId="cron-month">
                <FormSelect
                  id="cron-month"
                  value={month}
                  onChange={(event, value) => setMonth(value)}
                  aria-label="Month"
                >
                  <FormSelectOption value="*" label="Every month (*)" />
                  {MONTHS.map(m => (
                    <FormSelectOption key={m.value} value={m.value.toString()} label={m.label} />
                  ))}
                </FormSelect>
              </FormGroup>
            </GridItem>

            <GridItem span={12} lg={4}>
              <FormGroup label="Day of Week" fieldId="cron-weekday">
                <FormSelect
                  id="cron-weekday"
                  value={dayOfWeek}
                  onChange={(event, value) => setDayOfWeek(value)}
                  aria-label="Day of week"
                >
                  <FormSelectOption value="*" label="Every day (*)" />
                  {WEEKDAYS.map(w => (
                    <FormSelectOption key={w.value} value={w.value.toString()} label={w.label} />
                  ))}
                </FormSelect>
              </FormGroup>
            </GridItem>
          </Grid>
        )}

        <div style={{ marginTop: 16 }}>
          <h6>Expression:</h6>
          <code style={{ display: 'block', marginTop: 4, padding: '4px 8px', backgroundColor: 'var(--pf-global--BackgroundColor--200)', borderRadius: '4px' }}>
            {buildExpression().expression}
          </code>
          <p style={{ marginTop: 8 }}>
            <strong>Description:</strong> {buildExpression().description}
          </p>
        </div>
      </CardBody>
    </Card>
  );
};