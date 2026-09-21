import React, { useEffect, useState } from 'react';
import DateTimePicker from '@app/components/DateTimePicker';
import TimezoneSelector from '@app/components/TimezoneSelector';
import { getBrowserTimezone } from '@app/components/timezones';
import Modal, { useModal } from '@app/Modal/Modal';
import { Form, FormGroup } from '@patternfly/react-core';

const ReorderScheduleStartModal: React.FC<{
  isOpen: boolean;
  startDate: Date;
  title: string;
  onConfirm: (startDate: Date) => void;
  onClose: () => void;
}> = ({ isOpen, startDate, title, onConfirm, onClose }) => {
  const [modalRef, openModal] = useModal();
  const [now, setNow] = useState(() => Date.now());
  const [selectedDate, setSelectedDate] = useState(startDate);
  const [timezone, setTimezone] = useState(getBrowserTimezone);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setNow(Date.now());
    setSelectedDate(startDate);
    openModal();
  }, [isOpen, startDate]);

  return (
    <Modal ref={modalRef} title={title} onClose={onClose} onConfirm={() => onConfirm(selectedDate)}>
      <TimezoneSelector timezone={timezone} onChange={setTimezone} />
      <Form isHorizontal>
        <FormGroup fieldId="reorder-start-modal" label="Start">
          <DateTimePicker
            defaultTimestamp={startDate.getTime()}
            forceUpdateTimestamp={selectedDate.getTime()}
            minDate={now}
            maxDate={null}
            onSelect={setSelectedDate}
            timezone={timezone}
          />
        </FormGroup>
      </Form>
    </Modal>
  );
};

export default ReorderScheduleStartModal;
