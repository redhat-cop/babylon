import React, { useState } from 'react';
import {
  Dropdown,
  DropdownToggle,
  DropdownItem,
  CalendarMonth,
  InputGroup,
  TextInput,
  Button,
  Popover,
} from '@patternfly/react-core';
import OutlinedCalendarAltIcon from '@patternfly/react-icons/dist/esm/icons/outlined-calendar-alt-icon';
import OutlinedClockIcon from '@patternfly/react-icons/dist/esm/icons/outlined-clock-icon';

export const DateTimePicker: React.FC<{ defaultTimestamp: string; isDisabled: boolean }> = ({
  defaultTimestamp,
  isDisabled = false,
}) => {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isTimeOpen, setIsTimeOpen] = useState(false);
  const dateTime = new Date(defaultTimestamp);
  const defaultTime = `${dateTime.getHours()}:${dateTime.getMinutes()}`;
  const defaultDate = dateTime.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [valueDate, setValueDate] = useState(defaultDate);
  const [valueTime, setValueTime] = useState(defaultTime);
  const hours = Array.from(new Array(24), (_, i) => i);
  const minutes = ['00', '30'];

  const dateFormat = (date: Date) =>
    date
      .toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', timeZoneName: 'short' })
      .replace(/\//g, '-');

  const onToggleCalendar = () => {
    setIsCalendarOpen(!isCalendarOpen);
    setIsTimeOpen(false);
  };

  const onToggleTime = () => {
    setIsTimeOpen(!isTimeOpen);
    setIsCalendarOpen(false);
  };

  const onSelectCalendar = (newValueDate: Date) => {
    const newValue = dateFormat(newValueDate);
    setValueDate(newValue);
    setIsCalendarOpen(!isCalendarOpen);
  };

  const onSelectTime = (ev: React.SyntheticEvent<HTMLDivElement>) => {
    setValueTime(ev.currentTarget.textContent);
    setIsTimeOpen(!isTimeOpen);
  };

  const timeOptions = hours.map((hour) =>
    minutes.map((minute) => (
      <DropdownItem key={`${hour}-${minute}`} component="button" value={`${hour}:${minute}`}>
        {`${hour}:${minute}`}
      </DropdownItem>
    ))
  );

  const calendar = <CalendarMonth date={new Date(valueDate)} onChange={onSelectCalendar} />;

  const time = (
    <Dropdown
      onSelect={onSelectTime}
      toggle={
        <DropdownToggle
          aria-label="Toggle the time picker menu"
          toggleIndicator={null}
          onToggle={onToggleTime}
          style={{ padding: '6px 16px' }}
          isDisabled={isDisabled}
        >
          <OutlinedClockIcon />
        </DropdownToggle>
      }
      isOpen={isTimeOpen}
      dropdownItems={timeOptions}
    />
  );

  const calendarButton = (
    <Button variant="control" aria-label="Toggle the calendar" onClick={onToggleCalendar} isDisabled={isDisabled}>
      <OutlinedCalendarAltIcon />
    </Button>
  );

  return (
    <div style={{ width: '300px' }}>
      <Popover
        position="bottom"
        bodyContent={calendar}
        showClose={false}
        isVisible={isCalendarOpen}
        hasNoPadding
        hasAutoWidth
      >
        <InputGroup>
          <TextInput
            type="text"
            id="date-time"
            aria-label="date and time picker"
            value={valueDate + ' ' + valueTime}
            isReadOnly
          />
          {calendarButton}
          {time}
        </InputGroup>
      </Popover>
    </div>
  );
};
