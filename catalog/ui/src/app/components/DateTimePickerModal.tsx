import React, { useEffect, useState } from 'react';
import { Button, Form, FormGroup } from '@patternfly/react-core';
import OutlinedCalendarAltIcon from '@patternfly/react-icons/dist/js/icons/outlined-calendar-alt-icon';
import DateTimePicker from './DateTimePicker';
import TimezoneSelector from './TimezoneSelector';
import { getBrowserTimezone } from './timezones';
import Modal, { useModal } from '@app/Modal/Modal';

import './date-time-picker-modal.css';

function formatDateForDisplay(date: Date, tz: string): string {
  try {
    return date.toLocaleString(undefined, {
      timeZone: tz,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return date.toLocaleString();
  }
}

const DateTimePickerModalDialog: React.FC<{
  isOpen: boolean;
  date: Date;
  minDate: number;
  title: string;
  onConfirm: (date: Date) => void;
  onClose: () => void;
}> = ({ isOpen, date, minDate, title, onConfirm, onClose }) => {
  const [modalRef, openModal] = useModal();
  const [timezone, setTimezone] = useState(getBrowserTimezone);
  const [selectedDate, setSelectedDate] = useState<Date>(date);

  useEffect(() => {
    if (isOpen) {
      setSelectedDate(date);
      openModal();
    }
  }, [isOpen, date, openModal]);

  return (
    <Modal ref={modalRef} onConfirm={() => onConfirm(selectedDate)} title={title} onClose={onClose}>
      <TimezoneSelector timezone={timezone} onChange={setTimezone} />
      <Form isHorizontal style={{ marginTop: '16px' }}>
        <FormGroup fieldId="date-picker-modal" label="Date and Time">
          <DateTimePicker
            defaultTimestamp={selectedDate.getTime()}
            forceUpdateTimestamp={selectedDate.getTime()}
            onSelect={(d: Date) => setSelectedDate(d)}
            minDate={minDate}
            timezone={timezone}
          />
        </FormGroup>
      </Form>
    </Modal>
  );
};

const DateTimePickerButton: React.FC<{
  date: Date;
  timezone?: string;
  placeholder?: string;
  isDisabled?: boolean;
  onClick: () => void;
}> = ({ date, timezone, placeholder = 'Select...', isDisabled, onClick }) => {
  const tz = timezone || getBrowserTimezone();
  return (
    <Button variant="link" className="date-time-picker-modal__btn" isDisabled={isDisabled} onClick={onClick}>
      <OutlinedCalendarAltIcon style={{ marginRight: '8px' }} />
      {date ? formatDateForDisplay(date, tz) : placeholder}
    </Button>
  );
};

export { DateTimePickerModalDialog, DateTimePickerButton, formatDateForDisplay };
