import React, { useEffect, useMemo, useState } from 'react';
import parseDuration from 'parse-duration';
import { Alert, AlertGroup, Form, FormGroup, Switch } from '@patternfly/react-core';
import { ResourceClaim, WorkshopWithResourceClaims } from '@app/types';
import { displayName } from '@app/util';
import DateTimePicker from '@app/components/DateTimePicker';
import useSession from '@app/utils/useSession';
import { getAutoStopTime, getMaxRuntime, getMinDefaultRuntime, getStartTime } from './service-utils';
import { getWorkshopAutoStopTime, getWorkshopLifespan } from '@app/Workshops/workshops-utils';
import useHelpLink from '@app/utils/useHelpLink';

const minDefault = parseDuration('4h');

const ServicesScheduleAction: React.FC<{
  action: 'retirement' | 'stop' | 'start';
  resourceClaim?: ResourceClaim;
  workshop?: WorkshopWithResourceClaims;
  setTitle?: React.Dispatch<React.SetStateAction<string>>;
  setState?: React.Dispatch<React.SetStateAction<Date>>;
}> = ({ action, resourceClaim, workshop, setTitle, setState }) => {
  const { isAdmin } = useSession().getSession();
  const autoDestroyTime = resourceClaim
    ? Date.parse(resourceClaim.spec.lifespan?.end || resourceClaim.status.lifespan?.end)
    : getWorkshopLifespan(workshop, null).end;
  const initialDate = useMemo(() => {
    let time = null;
    if (workshop && workshop.resourceClaims) {
      if (action === 'retirement') {
        time = autoDestroyTime;
      } else {
        time = getWorkshopAutoStopTime(workshop, workshop.resourceClaims);
      }
    } else if (resourceClaim) {
      if (action === 'retirement') {
        time = autoDestroyTime;
      } else if (action === 'start') {
        time = getStartTime(resourceClaim);
      } else {
        time = getAutoStopTime(resourceClaim);
      }
    }
    return new Date(time);
  }, [resourceClaim, workshop, action]);

  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [forceUpdateTimestamp, setForceUpdateTimestamp] = useState(null);
  useEffect(() => setState(selectedDate), [setState, selectedDate]);
  useEffect(() => setTitle(`${displayName(resourceClaim || workshop)}`), [setTitle, resourceClaim]);

  const actionLabel = action === 'retirement' ? 'Auto-destroy' : action === 'start' ? 'Start' : 'Auto-stop';
  let maxDate = null;
  if (action === 'retirement') {
    maxDate = resourceClaim
      ? Math.min(
          Date.parse(resourceClaim.metadata.creationTimestamp) + parseDuration(resourceClaim.status.lifespan.maximum),
          Date.now() + parseDuration(resourceClaim.status.lifespan.relativeMaximum)
        )
      : workshop.resourceClaims
      ? Math.min(
          ...workshop.resourceClaims.flatMap((r) => [
            Date.parse(r.metadata.creationTimestamp) + parseDuration(r.status.lifespan.maximum),
            Date.now() + parseDuration(r.status.lifespan.relativeMaximum),
          ])
        )
      : null;
  } else if (action === 'start') {
    maxDate = null;
  } else {
    maxDate = resourceClaim
      ? getMaxRuntime(resourceClaim)
      : workshop.resourceClaims
      ? Math.min(...workshop.resourceClaims.map((r) => getMaxRuntime(r)))
      : null;
  }
  const minMaxProps = {
    minDate: Date.now(),
    maxDate,
  };
  if (isAdmin) {
    minMaxProps.maxDate = null;
  }
  const noAutoStopSwitchIsVisible =
    action === 'stop' && (minMaxProps.maxDate === null || minMaxProps.maxDate >= autoDestroyTime);
  const extendLifetimeMsgIsVisible = action === 'retirement' && minMaxProps.maxDate === null;
  const extendAutoStopMsgIsVisible = action === 'stop';
  const helpLink = useHelpLink();

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
          onChange={(_event, isChecked) => {
            if (isChecked) {
              setSelectedDate(new Date(new Date().setFullYear(new Date().getFullYear() + 1)));
            } else {
              const _date = new Date(
                Date.now() +
                  (resourceClaim
                    ? getMinDefaultRuntime(resourceClaim) || minDefault
                    : workshop.resourceClaims
                    ? Math.min(...workshop.resourceClaims.map((r) => getMinDefaultRuntime(r) || minDefault))
                    : null)
              );
              const date = _date.getTime() > autoDestroyTime ? new Date(Date.now() + minDefault) : _date;
              setSelectedDate(date);
              setForceUpdateTimestamp(date);
            }
          }}
        />
      ) : null}
      {extendAutoStopMsgIsVisible ? (
        <AlertGroup>
          <Alert
            title={
              <p>
                Any change to auto stop/retirement will increase the cost. The usage costs associated with this order
                will be charged back to your cost center.
              </p>
            }
            variant="info"
            isInline
          />
        </AlertGroup>
      ) : null}
      {extendLifetimeMsgIsVisible ? (
        <AlertGroup>
          <Alert
            title={
              <>
                <p>
                  Any change to auto stop/retirement will increase the cost. The usage costs associated with this order
                  will be charged back to your cost center.
                </p>
                {minMaxProps.maxDate === null ? (
                  <p>
                    Auto-Destroy can be extended by submitting a{' '}
                    <a href={helpLink} target="_blank" rel="noopener noreferrer">
                      support request
                    </a>
                    .
                  </p>
                ) : null}
              </>
            }
            variant="info"
            isInline
          />
        </AlertGroup>
      ) : null}
    </Form>
  );
};

export default ServicesScheduleAction;
