import React, { useEffect, useState } from 'react';
import { Alert, Form, FormGroup } from '@patternfly/react-core';
import DateTimePicker from '@app/components/DateTimePicker';
import TimezoneSelector from '@app/components/TimezoneSelector';
import { getBrowserTimezone } from '@app/components/timezones';
import useSession from '@app/utils/useSession';

const SelfPacedLabScheduleAction: React.FC<{
  action: 'retirement' | 'start';
  currentDate?: number;
  setState?: React.Dispatch<React.SetStateAction<Date>>;
  setIsDisabled?: React.Dispatch<React.SetStateAction<boolean>>;
}> = ({ action, currentDate, setState, setIsDisabled }) => {
  const { isAdmin } = useSession().getSession();
  const [selectedDate, setSelectedDate] = useState(() =>
    currentDate ? new Date(currentDate) : new Date(Date.now() + 14400000),
  );
  const [timezone, setTimezone] = useState(getBrowserTimezone);

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
    // eslint-disable-next-line @eslint-react/purity -- picker bounds are relative to the current time at each render; freezing would allow past dates in a long-open modal
    minDate: Date.now(),
  };
  if (!isAdmin) {
    // eslint-disable-next-line @eslint-react/purity -- max date is one year from the current time at each render, same as minDate
    minMaxProps.maxDate = Date.now() + 365 * 24 * 60 * 60 * 1000;
  }

  return (
    <>
      <TimezoneSelector timezone={timezone} onChange={setTimezone} />
      <Form isHorizontal>
        <FormGroup fieldId="selfpacedlab-schedule-action" label={actionLabel}>
          <DateTimePicker
            defaultTimestamp={selectedDate.getTime()}
            onSelect={(date) => setSelectedDate(date)}
            {...minMaxProps}
            timezone={timezone}
          />
        </FormGroup>
        {/* eslint-disable-next-line @eslint-react/purity -- past-date warning must compare against the current time on each render */}
        {selectedDate.getTime() <= Date.now() ? (
          <Alert
            variant="warning"
            isInline
            title={`The selected ${action === 'retirement' ? 'auto-destroy' : 'start'} date and time is in the past.`}
          />
        ) : null}
      </Form>
    </>
  );
};

export default SelfPacedLabScheduleAction;
