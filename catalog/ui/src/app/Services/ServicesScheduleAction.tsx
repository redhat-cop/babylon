import React, { useEffect, useMemo, useState } from 'react';
import parseDuration from 'parse-duration';
import { Form, FormGroup } from '@patternfly/react-core';
import { ResourceClaim } from '@app/types';
import { displayName } from '@app/util';
import DateTimePicker from '@app/components/DateTimePicker';
import useSession from '@app/utils/useSession';
import { getAutoStopTime, getStartTime } from './service-utils';

const ServicesScheduleAction: React.FC<{
  action: 'retirement' | 'stop';
  resourceClaim: ResourceClaim;
  setTitle?: React.Dispatch<React.SetStateAction<string>>;
  setState?: React.Dispatch<React.SetStateAction<Date>>;
}> = ({ action, resourceClaim, setTitle, setState }) => {
  const { isAdmin } = useSession().getSession();
  const currentActionDate: Date = useMemo(
    () =>
      new Date(
        action === 'retirement'
          ? Date.parse(resourceClaim.spec.lifespan?.end || resourceClaim.status.lifespan?.end)
          : getAutoStopTime(resourceClaim)
      ),
    [action, resourceClaim]
  );

  const [selectedDate, setSelectedDate] = useState(currentActionDate);
  useEffect(() => setState(selectedDate), [setState, selectedDate]);
  useEffect(() => setTitle(`${displayName(resourceClaim)}`), [setTitle, resourceClaim]);

  const actionLabel = action === 'retirement' ? 'Auto-destroy' : 'Auto-stop';

  const maxDate =
    action === 'retirement'
      ? Math.min(
          Date.parse(resourceClaim.metadata.creationTimestamp) + parseDuration(resourceClaim.status.lifespan.maximum),
          Date.now() + parseDuration(resourceClaim.status.lifespan.relativeMaximum)
        )
      : getStartTime(resourceClaim);

  const minMaxProps = {
    minDate: Date.now(),
    maxDate,
  };
  if (isAdmin) {
    minMaxProps.maxDate = null;
  }

  return (
    <Form isHorizontal>
      <FormGroup fieldId="services-schedule-action" label={actionLabel}>
        <DateTimePicker
          defaultTimestamp={selectedDate.getTime()}
          onSelect={(date) => setSelectedDate(date)}
          {...minMaxProps}
        />
      </FormGroup>
    </Form>
  );
};

export default ServicesScheduleAction;
