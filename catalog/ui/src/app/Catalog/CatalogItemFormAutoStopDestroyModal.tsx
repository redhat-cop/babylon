import React, { useEffect, useState } from 'react';
import DateTimePicker from '@app/components/DateTimePicker';
import Modal, { useModal } from '@app/Modal/Modal';
import { Alert, AlertGroup, Button, Form, FormGroup, Switch, Tooltip } from '@patternfly/react-core';
import useHelpLink from '@app/utils/useHelpLink';
import OutlinedClockIcon from '@patternfly/react-icons/dist/js/icons/outlined-clock-icon';

export type TDates = { startDate?: Date; stopDate?: Date; endDate?: Date };
export type TDatesTypes = 'auto-start' | 'auto-stop' | 'auto-destroy';

const CatalogItemFormAutoStopDestroyModal: React.FC<{
  type: TDatesTypes | null;
  autoStartDate?: Date;
  autoStopDate?: Date;
  autoDestroyDate: Date;
  maxStartTimestamp?: number;
  minStartTimestamp?: number;
  stopMaxDate?: number | null;
  stopMinDate?: number;
  stopMaxDateExclusive?: boolean;
  maxRuntimeTimestamp?: number;
  defaultRuntimeTimestamp?: number;
  maxDestroyTimestamp?: number;
  showNoAutoStopSwitch?: boolean;
  onConfirm: (date: TDates) => void;
  onClose: () => void;
  isAutoStopDisabled?: boolean;
  title: string;
}> = ({
  type,
  autoStartDate,
  autoStopDate,
  autoDestroyDate,
  maxStartTimestamp,
  minStartTimestamp,
  stopMaxDate,
  stopMinDate,
  stopMaxDateExclusive = false,
  maxRuntimeTimestamp,
  defaultRuntimeTimestamp,
  maxDestroyTimestamp,
  showNoAutoStopSwitch = false,
  onConfirm,
  onClose,
  isAutoStopDisabled = false,
  title,
}) => {
  const helpLink = useHelpLink();
  const [autoStopDestroyModal, openAutoStopDestroyModal] = useModal();
  const [now, setNow] = useState(() => Date.now());
  const [noAutoStopSelected, setNoAutoStopSelected] = useState(false);
  const [dates, setDates] = useState<TDates>({
    startDate: null,
    stopDate: null,
    endDate: null,
  });
  const _startDate = dates.startDate || autoStartDate;
  const _stopDate =
    showNoAutoStopSwitch && noAutoStopSelected ? undefined : dates.stopDate || autoStopDate;
  const _endDate = dates.endDate || autoDestroyDate;
  const noAutoStopChecked = showNoAutoStopSwitch
    ? noAutoStopSelected
    : !_stopDate || (!!_stopDate && !!_endDate && _stopDate.getTime() >= _endDate.getTime());
  const effectiveStopMaxDate = stopMaxDateExclusive
    ? stopMaxDate ?? null
    : stopMaxDate ?? (maxRuntimeTimestamp ? now + maxRuntimeTimestamp : null);
  let effectiveStopMinDate = stopMinDate ? Math.max(now, stopMinDate) : now;
  if (effectiveStopMaxDate && effectiveStopMinDate >= effectiveStopMaxDate) {
    effectiveStopMinDate = effectiveStopMaxDate - 60000;
  }
  const noAutoStopSwitchIsVisible =
    showNoAutoStopSwitch ||
    effectiveStopMaxDate === null ||
    (!!effectiveStopMaxDate && effectiveStopMaxDate >= _endDate.getTime());

  useEffect(() => {
    if (!type) {
      return;
    }
    setNow(Date.now());
    setDates({ startDate: null, stopDate: null, endDate: null });
    if (type === 'auto-stop' && showNoAutoStopSwitch) {
      setNoAutoStopSelected(!autoStopDate);
    }
    openAutoStopDestroyModal();
  }, [type]);

  return (
    <Modal
      ref={autoStopDestroyModal}
      onConfirm={() => {
        if (type === 'auto-stop' && showNoAutoStopSwitch) {
          onConfirm({
            ...dates,
            stopDate: noAutoStopSelected ? undefined : dates.stopDate ?? autoStopDate,
          });
          return;
        }
        if (type === 'auto-stop' && noAutoStopChecked) {
          onConfirm({
            ...dates,
            stopDate: dates.stopDate ?? new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
          });
          return;
        }
        onConfirm(dates);
      }}
      title={title}
      onClose={onClose}
    >
      <Form isHorizontal>
        {type === 'auto-start' ? (
          <>
            <FormGroup fieldId="auto-start-modal" label="Start">
              <DateTimePicker
                defaultTimestamp={autoStartDate ? autoStartDate.getTime() : now}
                onSelect={(d) => setDates((prev) => ({ ...prev, startDate: d }))}
                minDate={minStartTimestamp ?? now}
                maxDate={maxStartTimestamp ?? null}
                forceUpdateTimestamp={dates.startDate?.getTime()}
              />
            </FormGroup>
            {_startDate && _startDate.getTime() <= now ? (
              <Alert variant="warning" isInline title="The selected start date and time is in the past." />
            ) : null}
          </>
        ) : null}
        {type === 'auto-stop' ? (
          !isAutoStopDisabled ? (
            <>
              <FormGroup fieldId="auto-stop-modal" label="Auto-stop">
                <DateTimePicker
                  defaultTimestamp={autoStopDate ? autoStopDate.getTime() : null}
                  onSelect={(d) => setDates((prev) => ({ ...prev, stopDate: d }))}
                  minDate={effectiveStopMinDate}
                  maxDate={effectiveStopMaxDate}
                  isDisabled={noAutoStopChecked}
                  forceUpdateTimestamp={dates.stopDate?.getTime()}
                />
              </FormGroup>
              {noAutoStopSwitchIsVisible ? (
                <Switch
                  id="no-auto-stop-switch"
                  aria-label="No auto-stop"
                  label="No auto-stop"
                  isChecked={noAutoStopChecked}
                  hasCheckIcon
                  onChange={(_event, isChecked) => {
                    if (showNoAutoStopSwitch) {
                      setNoAutoStopSelected(isChecked);
                      if (isChecked) {
                        setDates((prev) => ({ ...prev, stopDate: null }));
                      } else {
                        setDates((prev) => ({
                          ...prev,
                          stopDate: new Date(Date.now() + (defaultRuntimeTimestamp || 0)),
                        }));
                      }
                      return;
                    }
                    if (isChecked) {
                      setDates((prev) => ({
                        ...prev,
                        stopDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
                      }));
                    } else {
                      setDates((prev) => ({
                        ...prev,
                        stopDate: new Date(Date.now() + defaultRuntimeTimestamp),
                      }));
                    }
                  }}
                />
              ) : null}
              {_stopDate && _stopDate.getTime() <= now ? (
                <Alert
                  variant="warning"
                  isInline
                  title="The selected auto-stop date and time is in the past."
                />
              ) : null}
              <AlertGroup>
                <Alert
                  title={
                    <p>
                      Any change to auto stop/retirement will increase the cost. The usage costs associated with this
                      order will be charged back to your cost center.
                    </p>
                  }
                  variant="info"
                  isInline
                />
              </AlertGroup>
            </>
          ) : (
            <FormGroup fieldId="auto-stop-modal" label="Auto-stop">
              <Button variant="control" isDisabled={true} icon={<OutlinedClockIcon />} iconPosition="right" size="sm">
                <Tooltip position="right" content={<div>This Catalog Item does not support Auto-Stop</div>}>
                  <span style={{ marginRight: "var(--pf-t--global--spacer--sm)" }}>Auto-Stop disabled</span>
                </Tooltip>
              </Button>
            </FormGroup>
          )
        ) : null}
        {type === 'auto-destroy' ? (
          <>
            <FormGroup fieldId="auto-destroy-modal" label="Auto-destroy">
              <DateTimePicker
                defaultTimestamp={autoDestroyDate.getTime()}
                onSelect={(d) => setDates((prev) => ({ ...prev, endDate: d }))}
                maxDate={maxDestroyTimestamp ? now + maxDestroyTimestamp : null}
                minDate={now}
                forceUpdateTimestamp={dates.endDate?.getTime()}
              />
            </FormGroup>
            {_endDate && _endDate.getTime() <= now ? (
              <Alert
                variant="warning"
                isInline
                title="The selected auto-destroy date and time is in the past."
              />
            ) : null}
            <AlertGroup>
              <Alert
                title={
                  <>
                    <p>
                      Any change to auto stop/retirement will increase the cost. The usage costs associated with this
                      order will be charged back to your cost center.
                    </p>
                    <p>
                      Auto-Destroy can be extended by submitting a{' '}
                      <a href={helpLink} target="_blank" rel="noopener noreferrer">
                        support request
                      </a>
                      .
                    </p>
                  </>
                }
                variant="info"
                isInline
              />
            </AlertGroup>
          </>
        ) : null}
      </Form>
    </Modal>
  );
};

export default CatalogItemFormAutoStopDestroyModal;
