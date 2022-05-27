import React, { useEffect } from 'react';
import parseDuration from 'parse-duration';
import { Form, FormGroup } from '@patternfly/react-core';
import { ResourceClaim } from '@app/types';
import DatetimeSelect from '@app/components/DatetimeSelect';
import LocalTimestamp from '@app/components/LocalTimestamp';
import TimeInterval from '@app/components/TimeInterval';

import { displayName } from '@app/util';

const ServicesScheduleAction: React.FC<{
  action: string;
  resourceClaim: ResourceClaim;
  setTitle?: React.Dispatch<React.SetStateAction<string>>;
  setState?: React.Dispatch<React.SetStateAction<Date>>;
}> = ({ action, resourceClaim, setTitle, setState }) => {
  const current: Date = new Date(
    action === 'retirement'
      ? Date.parse(resourceClaim.spec.lifespan?.end || resourceClaim.status.lifespan.end)
      : action === 'stop'
      ? Math.min(
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
      : Date.now()
  );

  const [selectedDate, setSelectedDate] = React.useState<Date>(current);
  useEffect(() => setState(selectedDate), [setState, selectedDate]);
  useEffect(() => setTitle(`${displayName(resourceClaim)}`), [setTitle, resourceClaim]);
  // Reset selected time to current time when action or resourceClaim changes
  useEffect(() => {
    setSelectedDate(current);
  }, [current.getTime()]);

  const minimum: Date = new Date(Date.now());
  const maximum: Date = new Date(
    // Calculate retirement maximum from maximum lifespan
    action === 'retirement'
      ? Math.min(
          Date.parse(resourceClaim.metadata.creationTimestamp) + parseDuration(resourceClaim.status.lifespan.maximum),
          Date.now() + parseDuration(resourceClaim.status.lifespan.relativeMaximum)
        )
      : // Calculate stop maximum from runtime maximum
      action === 'stop'
      ? Math.min(
          ...resourceClaim.status.resources
            .map((r) => {
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
            .filter((runtime) => runtime !== null)
        )
      : // Default to 30 days?
        Date.now() + 30 * 24 * 60 * 60 * 1000
  );

  const actionLabel = action === 'retirement' ? 'Auto-destroy' : action === 'stop' ? 'Auto-stop' : action;

  // Interval between times to show
  const interval: number = action === 'retirement' ? 60 * 60 * 1000 : 15 * 60 * 1000;

  return (
    <Form isHorizontal>
      <FormGroup fieldId="" label={actionLabel}>
        <DatetimeSelect
          idPrefix={`${resourceClaim.metadata.namespace}:${resourceClaim.metadata.name}:lifespan:`}
          onSelect={(date) => setSelectedDate(date)}
          toggleContent={
            <span>
              <LocalTimestamp date={selectedDate} /> (<TimeInterval toDate={selectedDate} />)
            </span>
          }
          current={selectedDate}
          interval={interval}
          minimum={minimum}
          maximum={maximum}
        />
      </FormGroup>
    </Form>
  );
};

export default ServicesScheduleAction;
