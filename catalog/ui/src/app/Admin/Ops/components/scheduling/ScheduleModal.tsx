import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Form,
  FormGroup,
  FormSection,
  FormSelect,
  FormSelectOption,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Select,
  SelectList,
  SelectOption,
  MenuToggle,
  NumberInput,
  Radio,
  Split,
  SplitItem,
  TextInput,
  TimePicker,
  Title,
} from '@patternfly/react-core';
import CalendarAltIcon from '@patternfly/react-icons/dist/js/icons/calendar-alt-icon';
import ClockIcon from '@patternfly/react-icons/dist/js/icons/clock-icon';
import SyncAltIcon from '@patternfly/react-icons/dist/js/icons/sync-alt-icon';

import { SchedulePreset, CronExpression } from '../../types/operations';
import { CronExpressionBuilder } from './CronExpressionBuilder';
import { SchedulePresets } from './SchedulePresets';

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSchedule: (scheduleData: {
    scheduledFor?: string;
    cronExpression?: string;
    timezone: string;
    isRecurring: boolean;
    maxExecutions?: number;
  }) => void;
  operationType: string;
  operationLabel: string;
  targetCount: number;
  timezone: string;
  isSubmitting?: boolean;
}

const TIMEZONE_OPTIONS = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern Time' },
  { value: 'America/Chicago', label: 'Central Time' },
  { value: 'America/Denver', label: 'Mountain Time' },
  { value: 'America/Los_Angeles', label: 'Pacific Time' },
  { value: 'Europe/London', label: 'GMT/BST' },
  { value: 'Europe/Berlin', label: 'Central European Time' },
  { value: 'Asia/Tokyo', label: 'Japan Time' },
];

export const ScheduleModal: React.FC<ScheduleModalProps> = ({
  isOpen,
  onClose,
  onSchedule,
  operationType,
  operationLabel,
  targetCount,
  timezone,
  isSubmitting = false,
}) => {
  const [scheduleType, setScheduleType] = useState<'once' | 'recurring'>('once');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [selectedTimezone, setSelectedTimezone] = useState(timezone);
  const [cronExpression, setCronExpression] = useState('');
  const [customCron, setCustomCron] = useState('');
  const [maxExecutions, setMaxExecutions] = useState(0);
  const [useMaxExecutions, setUseMaxExecutions] = useState(false);
  const [isTimezoneOpen, setIsTimezoneOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Get minimum date/time (now + 1 minute)
  const minDateTime = useMemo(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 1);
    return now;
  }, []);

  const minDateStr = useMemo(() => {
    const today = new Date();
    return `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
  }, []);

  const minTimeStr = useMemo(() => {
    if (selectedDate === minDateStr) {
      const now = new Date();
      now.setMinutes(now.getMinutes() + 1);
      return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    }
    return '00:00';
  }, [selectedDate, minDateStr]);

  const handlePresetSelect = useCallback((preset: SchedulePreset) => {
    if (preset.isRecurring && preset.cronExpression) {
      setScheduleType('recurring');
      setCronExpression(preset.cronExpression);
    } else if (preset.relativeTo && preset.offsetMinutes !== undefined) {
      setScheduleType('once');
      const targetDate = new Date();

      if (preset.relativeTo === 'endOfDay') {
        targetDate.setHours(23, 59, 0, 0);
      } else if (preset.relativeTo === 'startOfDay') {
        targetDate.setDate(targetDate.getDate() + 1);
        targetDate.setHours(0, 0, 0, 0);
      }

      targetDate.setMinutes(targetDate.getMinutes() + preset.offsetMinutes);

      const dateStr = `${targetDate.getFullYear()}-${(targetDate.getMonth() + 1).toString().padStart(2, '0')}-${targetDate.getDate().toString().padStart(2, '0')}`;
      const timeStr = `${targetDate.getHours().toString().padStart(2, '0')}:${targetDate.getMinutes().toString().padStart(2, '0')}`;

      setSelectedDate(dateStr);
      setSelectedTime(timeStr);
    }
  }, []);

  const handleCronChange = useCallback((cron: CronExpression) => {
    setCronExpression(cron.expression);
  }, []);

  const validateForm = useCallback((): string[] => {
    const errors: string[] = [];

    if (scheduleType === 'once') {
      if (!selectedDate) {
        errors.push('Date is required for one-time scheduling');
      }
      if (!selectedTime) {
        errors.push('Time is required for one-time scheduling');
      }

      if (selectedDate && selectedTime) {
        const scheduleDateTime = new Date(`${selectedDate}T${selectedTime}`);
        if (scheduleDateTime <= minDateTime) {
          errors.push('Scheduled time must be at least 1 minute in the future');
        }
      }
    } else if (scheduleType === 'recurring') {
      const effectiveCron = customCron || cronExpression;
      if (!effectiveCron) {
        errors.push('Cron expression is required for recurring scheduling');
      } else {
        // Basic cron validation (5 or 6 fields)
        const parts = effectiveCron.trim().split(/\s+/);
        if (parts.length < 5 || parts.length > 6) {
          errors.push('Invalid cron expression format');
        }
      }

      if (useMaxExecutions && maxExecutions <= 0) {
        errors.push('Maximum executions must be greater than 0');
      }
    }

    return errors;
  }, [scheduleType, selectedDate, selectedTime, cronExpression, customCron, minDateTime, useMaxExecutions, maxExecutions]);

  const handleSubmit = useCallback(() => {
    const errors = validateForm();
    setValidationErrors(errors);

    if (errors.length > 0) {
      return;
    }

    let scheduleData: Parameters<typeof onSchedule>[0];

    if (scheduleType === 'once') {
      const scheduledFor = new Date(`${selectedDate}T${selectedTime}`).toISOString();
      scheduleData = {
        scheduledFor,
        timezone: selectedTimezone,
        isRecurring: false,
      };
    } else {
      const effectiveCron = customCron || cronExpression;
      scheduleData = {
        cronExpression: effectiveCron,
        timezone: selectedTimezone,
        isRecurring: true,
        maxExecutions: useMaxExecutions ? maxExecutions : undefined,
      };
    }

    onSchedule(scheduleData);
  }, [scheduleType, selectedDate, selectedTime, selectedTimezone, cronExpression, customCron, useMaxExecutions, maxExecutions, validateForm, onSchedule]);

  const resetForm = useCallback(() => {
    setScheduleType('once');
    setSelectedDate('');
    setSelectedTime('');
    setSelectedTimezone(timezone);
    setCronExpression('');
    setCustomCron('');
    setMaxExecutions(0);
    setUseMaxExecutions(false);
    setValidationErrors([]);
  }, [timezone]);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  return (
    <Modal
      variant="medium"
      isOpen={isOpen}
      onClose={handleClose}
      aria-labelledby="schedule-modal-title"
    >
      <ModalHeader
        title={
          <Split hasGutter>
            <SplitItem>
              <CalendarAltIcon />
            </SplitItem>
            <SplitItem>
              Schedule {operationLabel}
            </SplitItem>
          </Split>
        }
        labelId="schedule-modal-title"
      />

      <ModalBody>
        <Alert variant="info" isInline title="Operation Target" style={{ marginBottom: 16 }}>
          This will schedule the {operationLabel.toLowerCase()} operation for <strong>{targetCount} workshop(s)</strong>.
        </Alert>

        {validationErrors.length > 0 && (
          <Alert variant="danger" isInline title="Validation Errors" style={{ marginBottom: 16 }}>
            <ul style={{ marginBottom: 0 }}>
              {validationErrors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </Alert>
        )}

        <Form>
          {/* Quick Presets */}
          <FormSection title="Quick Schedule Options" titleElement="h3">
            <SchedulePresets onSelect={handlePresetSelect} />
          </FormSection>

          {/* Schedule Type */}
          <FormGroup label="Schedule Type" fieldId="schedule-type" isRequired>
            <Radio
              id="once-radio"
              name="schedule-type"
              label="One-time execution"
              description="Execute the operation once at a specific date and time"
              isChecked={scheduleType === 'once'}
              onChange={() => setScheduleType('once')}
            />
            <Radio
              id="recurring-radio"
              name="schedule-type"
              label="Recurring execution"
              description="Execute the operation on a recurring schedule using cron expressions"
              isChecked={scheduleType === 'recurring'}
              onChange={() => setScheduleType('recurring')}
            />
          </FormGroup>

          {/* One-time Scheduling */}
          {scheduleType === 'once' && (
            <FormSection title="Schedule Date & Time" titleElement="h4">
              <Split hasGutter>
                <SplitItem isFilled>
                  <FormGroup label="Date" fieldId="schedule-date" isRequired>
                    <DatePicker
                      id="schedule-date"
                      value={selectedDate}
                      onChange={(event, value) => setSelectedDate(value)}
                      placeholder="YYYY-MM-DD"
                      aria-label="Schedule date"
                      validators={[
                        (date: Date) => {
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          return date < today ? 'Cannot schedule for past dates' : '';
                        }
                      ]}
                    />
                  </FormGroup>
                </SplitItem>
                <SplitItem isFilled>
                  <FormGroup label="Time" fieldId="schedule-time" isRequired>
                    <TimePicker
                      id="schedule-time"
                      time={selectedTime}
                      onChange={(event, time) => setSelectedTime(time)}
                      is24Hour
                      placeholder="HH:MM"
                      aria-label="Schedule time"
                      minTime={minTimeStr}
                      stepMinutes={15}
                    />
                  </FormGroup>
                </SplitItem>
              </Split>
            </FormSection>
          )}

          {/* Recurring Scheduling */}
          {scheduleType === 'recurring' && (
            <FormSection title="Recurring Schedule" titleElement="h4">
              <CronExpressionBuilder
                value={cronExpression}
                onChange={handleCronChange}
              />

              <FormGroup
                label="Custom Cron Expression"
                fieldId="custom-cron"
              >
                <p style={{ fontSize: 'var(--pf-global--FontSize--sm)', color: 'var(--pf-global--Color--200)', marginBottom: 8 }}>
                  Override the above builder with a custom cron expression (optional)
                </p>
                <TextInput
                  id="custom-cron"
                  value={customCron}
                  onChange={(event, value) => setCustomCron(value)}
                  placeholder="0 2 * * * (every day at 2:00 AM)"
                  aria-label="Custom cron expression"
                />
              </FormGroup>

              <FormGroup fieldId="max-executions">
                <Checkbox
                  id="use-max-executions"
                  label="Limit maximum executions"
                  isChecked={useMaxExecutions}
                  onChange={(event, checked) => setUseMaxExecutions(checked)}
                />
                {useMaxExecutions && (
                  <div style={{ marginTop: 8, marginLeft: 24 }}>
                    <NumberInput
                      value={maxExecutions}
                      onMinus={() => setMaxExecutions(Math.max(1, maxExecutions - 1))}
                      onPlus={() => setMaxExecutions(maxExecutions + 1)}
                      onChange={(event) => setMaxExecutions(Math.max(1, Number((event.target as HTMLInputElement).value)))}
                      min={1}
                      widthChars={4}
                      aria-label="Maximum executions"
                    />
                  </div>
                )}
              </FormGroup>
            </FormSection>
          )}

          {/* Timezone Selection */}
          <FormGroup label="Timezone" fieldId="timezone" isRequired>
            <Select
              id="timezone"
              isOpen={isTimezoneOpen}
              selected={selectedTimezone}
              onSelect={(event, selection) => {
                setSelectedTimezone(selection as string);
                setIsTimezoneOpen(false);
              }}
              onOpenChange={setIsTimezoneOpen}
              toggle={(toggleRef) => (
                <MenuToggle ref={toggleRef} onClick={() => setIsTimezoneOpen(!isTimezoneOpen)}>
                  {TIMEZONE_OPTIONS.find(tz => tz.value === selectedTimezone)?.label || selectedTimezone}
                </MenuToggle>
              )}
            >
              <SelectList>
                {TIMEZONE_OPTIONS.map(tz => (
                  <SelectOption key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectOption>
                ))}
              </SelectList>
            </Select>
          </FormGroup>
        </Form>
      </ModalBody>

      <ModalFooter>
        <Button
          variant="primary"
          onClick={handleSubmit}
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
        >
          Schedule Operation
        </Button>
        <Button variant="link" onClick={handleClose} isDisabled={isSubmitting}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
};