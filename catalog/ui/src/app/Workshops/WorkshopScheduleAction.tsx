import React, { useEffect, useState } from 'react';
import { Form, FormGroup, Switch } from '@patternfly/react-core';
import { ResourceClaim, Workshop, WorkshopProvision } from '@app/types';
import DateTimePicker from '@app/components/DateTimePicker';
import useSession from '@app/utils/useSession';
import {
  getWorkshopAutoStopTime,
  getWorkshopDefaultRuntime,
  getWorkshopLifespan,
  getWorkshopServicesStartTime,
} from './workshops-utils';
import parseDuration from 'parse-duration';

const minDefault = parseDuration('6h');

const WorkshopScheduleAction: React.FC<{
  action: 'retirement' | 'stop' | 'start';
  resourceClaims: ResourceClaim[];
  workshop: Workshop;
  workshopProvisions: WorkshopProvision[];
  setState?: React.Dispatch<React.SetStateAction<Date>>;
}> = ({ action, resourceClaims, workshop, workshopProvisions, setState }) => {
  const { isAdmin } = useSession().getSession();
  let maxDate: number = null;
  let currentActionDate: Date = null;
  const { end: autoDestroyTime, start: autoStartTime } = getWorkshopLifespan(workshop, workshopProvisions);
  const autoStopTime = getWorkshopAutoStopTime(workshop, resourceClaims);
  if (action === 'retirement' || action === 'start') {
    if (action === 'retirement') {
      currentActionDate = autoDestroyTime ? new Date(autoDestroyTime) : new Date(new Date().getTime() + 14400000); // By default: 14400000 = 4h;
    } else {
      currentActionDate = autoStartTime ? new Date(autoStartTime) : null;
    }
  } else {
    currentActionDate = autoStopTime ? new Date(autoStopTime) : null;
    maxDate = getWorkshopServicesStartTime(workshop, resourceClaims);
  }

  const [selectedDate, setSelectedDate] = useState(currentActionDate || new Date());
  const [forceUpdateTimestamp, setForceUpdateTimestamp] = useState(null);
  useEffect(() => setState(selectedDate), [setState, selectedDate]);

  const actionLabel = action === 'retirement' ? 'Auto-destroy' : action === 'start' ? 'Start Date' : 'Auto-stop';

  const minMaxProps = {
    minDate: Date.now(),
    maxDate,
  };
  if (isAdmin) {
    minMaxProps.maxDate = null;
  }
  const noAutoStopSwitchIsVisible =
    action === 'stop' && autoDestroyTime && (minMaxProps.maxDate === null || minMaxProps.maxDate >= autoDestroyTime);

  return (
    <Form isHorizontal>
      <FormGroup fieldId="workshop-schedule-action" label={actionLabel}>
        <DateTimePicker
          defaultTimestamp={selectedDate.getTime()}
          onSelect={(date) => setSelectedDate(date)}
          {...minMaxProps}
          isDisabled={noAutoStopSwitchIsVisible && selectedDate.getTime() >= autoDestroyTime}
          forceUpdateTimestamp={forceUpdateTimestamp}
        />
      </FormGroup>
      {noAutoStopSwitchIsVisible ? (
        <Switch
          id="services-schedule-action__no-auto-stop"
          aria-label="No auto-stop"
          label="No auto-stop"
          isChecked={selectedDate.getTime() >= autoDestroyTime}
          hasCheckIcon
          onChange={(isChecked) => {
            if (isChecked) {
              setSelectedDate(new Date(autoDestroyTime));
            } else {
              const _date = new Date(Date.now() + (getWorkshopDefaultRuntime(resourceClaims) || minDefault));
              const date = _date.getTime() > autoDestroyTime ? new Date(Date.now() + minDefault) : _date;
              setSelectedDate(date);
              setForceUpdateTimestamp(date);
            }
          }}
        />
      ) : null}
    </Form>
  );
};

export default WorkshopScheduleAction;
