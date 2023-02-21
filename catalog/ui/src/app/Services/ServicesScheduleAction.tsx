import React, { useEffect, useMemo, useState } from 'react';
import parseDuration from 'parse-duration';
import { Form, FormGroup, Switch } from '@patternfly/react-core';
import { ResourceClaim } from '@app/types';
import { displayName } from '@app/util';
import DateTimePicker from '@app/components/DateTimePicker';
import useSession from '@app/utils/useSession';
import { getAutoStopTime, getMinDefaultRuntime, getStartTime } from './service-utils';

const ServicesScheduleAction: React.FC<{
  action: 'retirement' | 'stop';
  resourceClaim: ResourceClaim;
  setTitle?: React.Dispatch<React.SetStateAction<string>>;
  setState?: React.Dispatch<React.SetStateAction<Date>>;
}> = ({ action, resourceClaim, setTitle, setState }) => {
  const { isAdmin } = useSession().getSession();
  const autoDestroyTime = Date.parse(resourceClaim.spec.lifespan?.end || resourceClaim.status.lifespan?.end);
  const currentActionDate: Date = useMemo(
    () => new Date(action === 'retirement' ? autoDestroyTime : getAutoStopTime(resourceClaim)),
    [action, resourceClaim]
  );

  const [selectedDate, setSelectedDate] = useState(currentActionDate);
  const [forceUpdateTimestamp, setForceUpdateTimestamp] = useState(null);
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
  const noAutoStopSwitchIsVisible = action === 'stop' && (maxDate === null || maxDate >= autoDestroyTime);

  return (
    <Form isHorizontal>
      <FormGroup fieldId="services-schedule-action" label={actionLabel}>
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
              const date = new Date(Date.now() + (getMinDefaultRuntime(resourceClaim) || parseDuration('4h')));
              setSelectedDate(date);
              setForceUpdateTimestamp(date);
            }
          }}
        />
      ) : null}
    </Form>
  );
};

export default ServicesScheduleAction;
