import React, { useEffect, useState } from 'react';
import { Alert, Form, FormGroup } from '@patternfly/react-core';
import DateTimePicker from '@app/components/DateTimePicker';
import useSession from '@app/utils/useSession';

const SelfPacedLabScheduleAction: React.FC<{
  action: 'retirement' | 'start';
  currentDate?: number;
  setState?: React.Dispatch<React.SetStateAction<Date>>;
  setIsDisabled?: React.Dispatch<React.SetStateAction<boolean>>;
}> = ({ action, currentDate, setState, setIsDisabled }) => {
  const { isAdmin } = useSession().getSession();
  const defaultDate = currentDate ? new Date(currentDate) : new Date(Date.now() + 14400000);
  const [selectedDate, setSelectedDate] = useState(defaultDate);

  useEffect(() => {
    setState(selectedDate);
  }, [setState, selectedDate]);

  useEffect(() => {
    if (setIsDisabled) {
      if (action === 'start') {
        setIsDisabled(selectedDate.getTime() < Date.now());
      } else {
        setIsDisabled(false);
      }
    }
  }, [setIsDisabled, selectedDate, action]);

  const actionLabel = action === 'retirement' ? 'Auto-destroy' : 'Start Date';

  const minMaxProps: { minDate: number; maxDate?: number } = {
    minDate: Date.now(),
  };
  if (!isAdmin) {
    minMaxProps.maxDate = Date.now() + 365 * 24 * 60 * 60 * 1000;
  }

  return (
    <Form isHorizontal>
      <FormGroup fieldId="selfpacedlab-schedule-action" label={actionLabel}>
        <DateTimePicker
          defaultTimestamp={selectedDate.getTime()}
          onSelect={(date) => setSelectedDate(date)}
          {...minMaxProps}
        />
      </FormGroup>
      {selectedDate.getTime() <= Date.now() ? (
        <Alert
          variant="warning"
          isInline
          title={`The selected ${action === 'retirement' ? 'auto-destroy' : 'start'} date and time is in the past.`}
        />
      ) : null}
    </Form>
  );
};

export default SelfPacedLabScheduleAction;
