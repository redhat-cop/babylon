import React, { useEffect, useState } from 'react';
import { Form, FormGroup } from '@patternfly/react-core';
import { ResourceClaim, Workshop, WorkshopProvision } from '@app/types';
import DateTimePicker from '@app/components/DateTimePicker';
import useSession from '@app/utils/useSession';
import { getWorkshopAutoStopTime, getWorkshopLifespan, getWorkshopServicesStartTime } from './workshops-utils';

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
  if (action === 'retirement' || action === 'start') {
    const { end: autoDestroyTime, start: autoStartTime } = getWorkshopLifespan(workshop, workshopProvisions);
    if (action === 'retirement') {
      currentActionDate = autoDestroyTime ? new Date(autoDestroyTime) : null;
    } else {
      currentActionDate = autoStartTime ? new Date(autoStartTime) : null;
    }
  } else {
    const autoStopTime = getWorkshopAutoStopTime(resourceClaims);
    currentActionDate = autoStopTime ? new Date(autoStopTime) : null;
    maxDate = getWorkshopServicesStartTime(resourceClaims);
  }

  const [selectedDate, setSelectedDate] = useState(currentActionDate || new Date());
  useEffect(() => setState(selectedDate), [setState, selectedDate]);

  const actionLabel = action === 'retirement' ? 'Auto-destroy' : action === 'start' ? 'Start Date' : 'Auto-stop';

  const minMaxProps = {
    minDate: Date.now(),
    maxDate,
  };
  if (isAdmin) {
    minMaxProps.maxDate = null;
  }

  return (
    <Form isHorizontal>
      <FormGroup fieldId="workshop-schedule-action" label={actionLabel}>
        <DateTimePicker
          defaultTimestamp={selectedDate.getTime()}
          onSelect={(date) => setSelectedDate(date)}
          {...minMaxProps}
        />
      </FormGroup>
    </Form>
  );
};

export default WorkshopScheduleAction;
