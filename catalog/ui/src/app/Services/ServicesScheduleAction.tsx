import React, { useEffect, useMemo, useState } from 'react';
import parseDuration from 'parse-duration';
import { Form, FormGroup } from '@patternfly/react-core';
import { ResourceClaim } from '@app/types';
import { displayName } from '@app/util';
import DateTimePicker from '@app/components/DateTimePicker';
import useSession from '@app/utils/useSession';

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
          ? Date.parse(resourceClaim.spec.lifespan?.end || resourceClaim.status.lifespan.end)
          : Math.min(
              ...resourceClaim.spec.resources
                .map((specResource, idx) => {
                  const statusResource = resourceClaim.status?.resources?.[idx];
                  const stopTimestamp =
                    specResource.template?.spec?.vars?.action_schedule?.stop ||
                    statusResource.state.spec.vars.action_schedule.stop;
                  if (stopTimestamp) {
                    return Date.parse(stopTimestamp);
                  } else {
                    return null;
                  }
                })
                .filter((time) => time !== null)
            )
      ),
    [
      action,
      resourceClaim.spec.lifespan?.end,
      resourceClaim.spec.resources,
      resourceClaim.status.lifespan.end,
      resourceClaim.status?.resources,
    ]
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
      : Math.min(
          ...resourceClaim.status.resources
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((r: any) => {
              if (!r.state) {
                return null;
              }
              const startTimestamp = r.state.spec.vars.action_schedule.start;
              const resourceMaximumRuntime = r.state.spec.vars.action_schedule.maximum_runtime;
              if (resourceMaximumRuntime && startTimestamp) {
                return Date.parse(startTimestamp) + parseDuration(resourceMaximumRuntime);
              } else {
                return null;
              }
            })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .filter((runtime: any) => runtime !== null)
        );

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
