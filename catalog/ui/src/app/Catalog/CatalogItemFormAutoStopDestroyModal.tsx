import React, { useEffect, useState } from 'react';
import DateTimePicker from '@app/components/DateTimePicker';
import Modal, { useModal } from '@app/Modal/Modal';
import { Alert, AlertGroup, Form, FormGroup, HelperText, HelperTextItem, Switch } from '@patternfly/react-core';
import InfoIcon from '@patternfly/react-icons/dist/js/icons/info-icon';
import useHelpLink from '@app/utils/useHelpLink';

export type TDates = { startDate: Date; stopDate: Date; endDate: Date; createTicket?: boolean };
export type TDatesTypes = 'auto-stop' | 'auto-destroy' | 'schedule';

const CatalogItemFormAutoStopDestroyModal: React.FC<{
  type: TDatesTypes;
  autoStartDate?: Date;
  autoStopDate?: Date;
  autoDestroyDate: Date;
  maxStartTimestamp?: number;
  maxRuntimeTimestamp?: number;
  defaultRuntimeTimestamp?: number;
  maxDestroyTimestamp?: number;
  onConfirm: (date: TDates) => void;
  onClose: () => void;
  isWorkshopEnabled?: boolean;
  isAutoStopDisabled?: boolean;
  title: string;
}> = ({
  type,
  autoStartDate,
  autoStopDate,
  autoDestroyDate,
  maxStartTimestamp,
  maxRuntimeTimestamp,
  defaultRuntimeTimestamp,
  maxDestroyTimestamp,
  onConfirm,
  onClose,
  isWorkshopEnabled = false,
  isAutoStopDisabled = false,
  title,
}) => {
  const helpLink = useHelpLink();
  const [autoStopDestroyModal, openAutoStopDestroyModal] = useModal();
  const [dates, setDates] = useState<TDates>({
    startDate: null,
    stopDate: null,
    endDate: null,
  });
  const defaultLifespanTime = autoDestroyDate.getTime() - new Date().getTime();
  const [createTicket, setCreateTicket] = useState(false);
  const _stopDate = dates.stopDate || autoStopDate;
  const _endDate = dates.endDate || autoDestroyDate;
  const noAutoStopChecked = _stopDate && _endDate && _stopDate.getTime() >= _endDate.getTime();

  useEffect(() => {
    if (!!type) {
      openAutoStopDestroyModal();
    }
  }, [type]);

  return (
    <Modal
      ref={autoStopDestroyModal}
      onConfirm={() =>
        type === 'schedule'
          ? onConfirm({
              endDate: _endDate,
              stopDate: _stopDate,
              startDate: dates.startDate || new Date(),
              createTicket,
            })
          : onConfirm(dates)
      }
      title={type === 'auto-stop' || type === 'auto-destroy' ? title : 'Schedule for'}
      onClose={onClose}
      {...(type === 'schedule' ? { confirmText: 'Schedule' } : {})}
    >
      <Form isHorizontal={type !== 'schedule'}>
        {type === 'schedule' ? (
          <FormGroup fieldId="auto-start-modal" label="Start Deployment Date">
            <DateTimePicker
              defaultTimestamp={autoStartDate?.getTime() || Date.now()}
              onSelect={(d) => {
                const _dates = dates;
                _dates.startDate = d;
                if (!dates.endDate || d.getTime() + defaultLifespanTime > dates.endDate.getTime()) {
                  _dates.endDate = new Date(d.getTime() + defaultLifespanTime);
                }
                setDates({ ..._dates });
                const today = new Date();
                const twoWeeks = new Date(new Date().setDate(today.getDate() + 14));
                if (d >= twoWeeks) {
                  setCreateTicket(true);
                }
              }}
              minDate={Date.now()}
              maxDate={maxStartTimestamp}
            />
          </FormGroup>
        ) : null}
        {isWorkshopEnabled ? (
          <HelperText style={{ marginTop: 'var(--pf-v5-global--spacer--sm)' }}>
            <HelperTextItem icon={<InfoIcon />}>
              Services will launch at the specified date and take some time to be available.
            </HelperTextItem>
          </HelperText>
        ) : null}
        {type === 'auto-stop' && !isAutoStopDisabled ? (
          <>
            <FormGroup fieldId="auto-stop-modal" label="Auto-stop">
              <DateTimePicker
                defaultTimestamp={autoStopDate ? autoStopDate.getTime() : null}
                onSelect={(d) => setDates({ ...dates, stopDate: d })}
                minDate={Date.now()}
                maxDate={Date.now() + maxRuntimeTimestamp}
                isDisabled={noAutoStopChecked}
              />
            </FormGroup>
            {Date.now() + maxRuntimeTimestamp >= _endDate.getTime() ? (
              <Switch
                id="no-auto-stop-switch"
                aria-label="No auto-stop"
                label="No auto-stop"
                isChecked={noAutoStopChecked}
                hasCheckIcon
                onChange={(_event, isChecked) => {
                  isChecked
                    ? setDates({ ...dates, stopDate: dates.endDate || autoDestroyDate })
                    : setDates({ ...dates, stopDate: new Date(Date.now() + defaultRuntimeTimestamp) });
                }}
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
        ) : null}
        {type === 'auto-destroy' || type === 'schedule' ? (
          <>
            <FormGroup fieldId="auto-destroy-modal" label="Auto-destroy">
              <DateTimePicker
                defaultTimestamp={autoDestroyDate.getTime()}
                onSelect={(d) => setDates({ ...dates, endDate: d, ...(type === 'schedule' ? { stopDate: d } : {}) })}
                maxDate={
                  maxDestroyTimestamp
                    ? type === 'schedule' && dates.startDate
                      ? dates.startDate.getTime() + maxDestroyTimestamp
                      : Date.now() + maxDestroyTimestamp
                    : null
                }
                minDate={type === 'schedule' && dates.startDate ? dates.startDate.getTime() : Date.now()}
                forceUpdateTimestamp={dates.endDate?.getTime()}
              />
            </FormGroup>
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

        {type === 'schedule' ? (
          <>
            <Switch
              id="support-ticket-switch"
              aria-label="Open Support Ticket"
              label="Open Support Ticket"
              isChecked={createTicket}
              hasCheckIcon
              onChange={(_event, isChecked) => {
                setCreateTicket(isChecked);
              }}
            />
          </>
        ) : null}
      </Form>
    </Modal>
  );
};

export default CatalogItemFormAutoStopDestroyModal;
