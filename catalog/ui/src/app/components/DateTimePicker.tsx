import React, { useEffect, useState } from 'react';
import {
  CalendarMonth,
  InputGroup,
  TextInput,
  Button,
  Popover,
  InputGroupItem,
  DropdownList,
} from '@patternfly/react-core';
import { Dropdown, DropdownItem, MenuToggle, MenuToggleElement } from '@patternfly/react-core';
import OutlinedCalendarAltIcon from '@patternfly/react-icons/dist/js/icons/outlined-calendar-alt-icon';
import OutlinedClockIcon from '@patternfly/react-icons/dist/js/icons/outlined-clock-icon';
import { getLang } from '@app/util';
import { dateInTimezone, getDateTimePartsInTimezone } from './timezones';

import './date-time-picker.css';

function formatAmPm(timeStr: string): string {
  const [hStr, mStr] = timeStr.split(':');
  let hours = Number(hStr);
  const minutes = Number(mStr);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours %= 12;
  hours = hours || 12;
  return `${('00' + hours).slice(-2)}:${('00' + minutes).slice(-2)} ${ampm}`;
}

function formatHHMM(timeStr: string): string {
  let hours = Number(timeStr.match(/^(\d+)/)[1]);
  const minutes = Number(timeStr.match(/:(\d+)/)[1]);
  const AMPM = timeStr.match(/\s(.*)$/)[1];
  if (AMPM === 'PM' && hours < 12) hours = hours + 12;
  if (AMPM === 'AM' && hours === 12) hours = hours - 12;
  return `${('00' + hours).slice(-2)}:${('00' + minutes).slice(-2)}`;
}

const DateTimePicker: React.FC<{
  defaultTimestamp: number;
  isDisabled?: boolean;
  onSelect: (date: Date) => void;
  minDate?: number;
  maxDate?: number;
  forceUpdateTimestamp?: number;
  timezone: string;
}> = ({ defaultTimestamp, isDisabled = false, onSelect, minDate, maxDate, forceUpdateTimestamp, timezone }) => {
  const dateFormat = (date: Date) =>
    date.toLocaleDateString([getLang(), 'en-US'], {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
      timeZone: timezone,
    });

  function getDateAndTimeTz(date: Date) {
    const parts = getDateTimePartsInTimezone(date, timezone);
    return {
      dateIso: new Date(Date.UTC(parts.year, parts.month, parts.day)).toISOString(),
      time: `${('00' + parts.hour).slice(-2)}:${('00' + parts.minute).slice(-2)}`,
    };
  }

  function getDateTimeTz(dateIso: string, timeStr: string): Date {
    const [hStr, mStr] = timeStr.split(':');
    const hours = Number(hStr);
    const minutes = Number(mStr);
    const d = new Date(dateIso);
    return dateInTimezone(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hours, minutes, timezone);
  }

  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isTimeOpen, setIsTimeOpen] = useState(false);
  const dateTime = new Date(defaultTimestamp);
  const defaultParts = getDateAndTimeTz(dateTime);
  const [valueDate, setValueDate] = useState(defaultParts.dateIso);
  const [valueTime, setValueTime] = useState(defaultParts.time);
  const hours = Array.from(new Array(24), (_, i) => ('00' + i).slice(-2));
  const minutes = ['00', '15', '30', '45'];

  useEffect(() => {
    const currentUtcDate = getDateTimeTz(valueDate, valueTime);
    const parts = getDateTimePartsInTimezone(currentUtcDate, timezone);
    setValueDate(new Date(Date.UTC(parts.year, parts.month, parts.day)).toISOString());
    setValueTime(`${('00' + parts.hour).slice(-2)}:${('00' + parts.minute).slice(-2)}`);
  }, [timezone]);

  useEffect(() => {
    if (forceUpdateTimestamp) {
      const parts = getDateAndTimeTz(new Date(forceUpdateTimestamp));
      setValueDate(parts.dateIso);
      setValueTime(parts.time);
    }
  }, [forceUpdateTimestamp, timezone]);

  const onToggleCalendar = () => {
    setIsCalendarOpen(!isCalendarOpen);
    setIsTimeOpen(false);
  };

  const onToggleTime = () => {
    setIsTimeOpen(!isTimeOpen);
    setIsCalendarOpen(false);
  };

  const _onSelect = (dateIso: string, timeStr: string) => {
    const dateTime = getDateTimeTz(dateIso, timeStr);
    onSelect(dateTime);
  };

  const onSelectCalendar = (newValueDate: Date) => {
    const iso = new Date(Date.UTC(newValueDate.getFullYear(), newValueDate.getMonth(), newValueDate.getDate())).toISOString();
    setValueDate(iso);
    setIsCalendarOpen(!isCalendarOpen);
    setIsTimeOpen(!isTimeOpen);
    _onSelect(iso, valueTime);
  };

  const onSelectTime = (ev: React.MouseEvent<Element, MouseEvent> | undefined, value: string | number | undefined) => {
    const newValueTime = formatHHMM(String(value));
    setValueTime(newValueTime);
    setIsTimeOpen(!isTimeOpen);
    _onSelect(valueDate, newValueTime);
  };

  const rangeValidatorDate = (date: Date) => {
    if (minDate) {
      const newMinDate = new Date(minDate);
      newMinDate.setDate(newMinDate.getDate() - 1);
      if (date < newMinDate) return false;
    }
    if (maxDate && date > new Date(maxDate)) {
      return false;
    }

    return true;
  };

  const isTimeOptionValid = (hour: string, minute: string): boolean => {
    if (!minDate) return true;

    const d = new Date(valueDate);
    const candidateDate = dateInTimezone(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), Number(hour), Number(minute), timezone);
    return candidateDate.getTime() >= minDate;
  };

  const timeOptions = hours
    .flatMap((hour) =>
      minutes
        .filter((minute) => isTimeOptionValid(hour, minute))
        .map((minute) => (
          <DropdownItem key={`${hour}-${minute}`} value={formatAmPm(`${hour}:${minute}`)} component="button">
            {formatAmPm(`${hour}:${minute}`)}
          </DropdownItem>
        )),
    );

  const calendarDate = (() => {
    const d = new Date(valueDate);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  })();

  const calendar = (
    <CalendarMonth
      date={calendarDate}
      onChange={(_event, newValueDate: Date) => onSelectCalendar(newValueDate)}
      validators={[rangeValidatorDate]}
    />
  );

  const time = (
    <Dropdown
      isOpen={isTimeOpen}
      onSelect={onSelectTime}
      className="date-time-picker__time-picker"
      isScrollable
      toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
        <MenuToggle
          ref={toggleRef}
          onClick={onToggleTime}
          isExpanded={isTimeOpen}
          style={{
            padding: '6px 16px',
            ...(isDisabled
              ? {
                  color:
                    'var(--pf-v6-global--disabled-color--100)',
                }
              : {}),
          }}
          isDisabled={isDisabled}
          className="hide-controls"
        >
          <OutlinedClockIcon />
        </MenuToggle>
      )}
    >
      <DropdownList>{timeOptions}</DropdownList>
    </Dropdown>
  );

  const calendarButton = (
    <Button
      icon={<OutlinedCalendarAltIcon />}
      variant="control"
      aria-label="Toggle the calendar"
      onClick={onToggleCalendar}
      isDisabled={isDisabled}
    ></Button>
  );

  const selectedDateTime = getDateTimeTz(valueDate, valueTime);

  return (
    <div style={{ width: '320px' }}>
      <Popover
        position="bottom"
        bodyContent={calendar}
        showClose={false}
        isVisible={isCalendarOpen}
        hasNoPadding
        hasAutoWidth
      >
        <InputGroup>
          <InputGroupItem isFill>
            <TextInput
              type="text"
              id="date-time"
              aria-label="Date and time picker"
              value={dateFormat(selectedDateTime)}
              className="date-time-picker__text"
              onClick={onToggleCalendar}
              isDisabled={isDisabled}
              readOnlyVariant="default"
            />
          </InputGroupItem>
          {calendarButton}
          {time}
        </InputGroup>
      </Popover>
    </div>
  );
};

export default DateTimePicker;
