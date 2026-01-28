import React, { useEffect, useState } from 'react';
import { Form, FormGroup, Switch } from '@patternfly/react-core';
import { ResourceClaim, Workshop, WorkshopProvision } from '@app/types';
import DateTimePicker from '@app/components/DateTimePicker';
import useSession from '@app/utils/useSession';
import {
  getMaxAutoDestroy,
  getWorkshopAutoStopTime,
  getWorkshopDefaultRuntime,
  getWorkshopLifespan,
} from './workshops-utils';
import parseDuration from 'parse-duration';
import { getMaxRuntime } from '@app/Services/service-utils';

const minDefault = parseDuration('6h');

const WorkshopScheduleAction: React.FC<{
  action: 'retirement' | 'stop' | 'start' | 'start-date' | 'ready-by-date';
  resourceClaims: ResourceClaim[];
  workshop: Workshop;
  workshopProvisions: WorkshopProvision[];
  setState?: React.Dispatch<React.SetStateAction<Date>>;
  setIsDisabled?: React.Dispatch<React.SetStateAction<boolean>>;
}> = ({ action, resourceClaims, workshop, workshopProvisions, setState, setIsDisabled }) => {
  const { isAdmin } = useSession().getSession();
  let maxDate: number = null;
  let currentActionDate: Date = null;
  const { end: autoDestroyTime, start: autoStartTime } = getWorkshopLifespan(workshop, workshopProvisions);
  const autoStopTime = getWorkshopAutoStopTime(workshop, resourceClaims);
  if (action === 'retirement' || action === 'start' || action === 'start-date') {
    if (action === 'retirement') {
      currentActionDate = autoDestroyTime ? new Date(autoDestroyTime) : new Date(new Date().getTime() + 14400000); // By default: 14400000 = 4h;
      maxDate = getMaxAutoDestroy(workshop);
    } else if (action === 'start') {
      currentActionDate = autoStartTime ? new Date(autoStartTime) : null;
    } else if (action === 'start-date') {
      // User start date is 6 hours after provisioning time
      currentActionDate = autoStartTime ? new Date(autoStartTime + (6 * 60 * 60 * 1000)) : null;
    }
  } else {
    currentActionDate = autoStopTime ? new Date(autoStopTime) : null;
    maxDate = resourceClaims.length > 0 ? Math.min(...resourceClaims.map((r) => getMaxRuntime(r))) : null;
  }

  const [selectedDate, setSelectedDate] = useState(currentActionDate || new Date());
  const [forceUpdateTimestamp, setForceUpdateTimestamp] = useState(null);
  
  // Convert selected date for setState based on action type
  useEffect(() => {
    if (action === 'start-date') {
      // Convert user start date back to provisioning date (6 hours earlier)
      const provisioningDate = new Date(selectedDate.getTime() - (6 * 60 * 60 * 1000));
      setState(provisioningDate);
    } else {
      setState(selectedDate);
    }
  }, [setState, selectedDate, action]);

  // Disable submit button if date is in the past for start-date action
  useEffect(() => {
    if (setIsDisabled && action === 'start-date') {
      const isInPast = selectedDate.getTime() < Date.now();
      setIsDisabled(isInPast);
    }
  }, [setIsDisabled, selectedDate, action]);

  const actionLabel =
    action === 'retirement' ? 'Auto-destroy' : 
    action === 'start' ? 'Start Provisioning Date' : 
    action === 'start-date' ? 'Start Date' : 
    'Auto-stop';

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
          onChange={(_event, isChecked) => {
            if (isChecked) {
              setSelectedDate(new Date(new Date().setFullYear(new Date().getFullYear() + 1)));
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
