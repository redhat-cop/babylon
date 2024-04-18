import React, { useEffect, useState } from 'react';
import DateTimePicker from '@app/components/DateTimePicker';
import Modal, { useModal } from '@app/Modal/Modal';
import { Alert, AlertGroup, Form, FormGroup, HelperText, HelperTextItem, Switch } from '@patternfly/react-core';
import InfoIcon from '@patternfly/react-icons/dist/js/icons/info-icon';
import useSession from '@app/utils/useSession';
import useHelpLink from '@app/utils/useHelpLink';

export type TDates = { startDate: Date; stopDate: Date; endDate: Date };
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
  const { isAdmin } = useSession().getSession();
  const helpLink = useHelpLink();
  const [autoStopDestroyModal, openAutoStopDestroyModal] = useModal();
  const [dates, setDates] = useState<TDates>({
    startDate: null,
    stopDate: null,
    endDate: null,
  });
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
          ? onConfirm({ endDate: _endDate, stopDate: _stopDate, startDate: dates.startDate || new Date() })
          : onConfirm(dates)
      }
      title={type === 'auto-stop' || type === 'auto-destroy' ? title : 'Schedule for'}
      onClose={onClose}
      {...(type === 'schedule' ? { confirmText: 'Schedule' } : {})}
    >
      <Form isHorizontal={type !== 'schedule'}>
        {type === 'schedule' ? (
          <FormGroup fieldId="auto-start-modal" label="Start Date">
            <DateTimePicker
              defaultTimestamp={autoStartDate?.getTime() || Date.now()}
              onSelect={(d) => setDates({ ...dates, startDate: d })}
              minDate={Date.now()}
              maxDate={maxStartTimestamp}
            />
          </FormGroup>
        ) : null}
        {type === 'auto-stop' && !isAutoStopDisabled ? (
          <>
            <FormGroup fieldId="auto-stop-modal" label="Auto-stop">
              <DateTimePicker
                defaultTimestamp={autoStopDate ? autoStopDate.getTime() : null}
                onSelect={(d) => setDates({ ...dates, stopDate: d })}
                minDate={Date.now()}
                maxDate={maxRuntimeTimestamp}
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
                onChange={(isChecked) => {
                  isChecked
                    ? setDates({ ...dates, stopDate: dates.endDate || autoDestroyDate })
                    : setDates({ ...dates, stopDate: new Date(Date.now() + defaultRuntimeTimestamp) });
                }}
              />
            ) : null}
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
                minDate={Date.now()}
              />
            </FormGroup>
            {isAdmin ? null : (
              <AlertGroup>
                <Alert
                  title={
                    <p>
                      Auto-Destroy can be extended by submitting a{' '}
                      <a href={helpLink} target="_blank" rel="noopener noreferrer">
                        support request
                      </a>
                      .
                    </p>
                  }
                  variant="info"
                  isInline
                />
              </AlertGroup>
            )}
          </>
        ) : null}
      </Form>
      {isWorkshopEnabled ? (
        <HelperText style={{ marginTop: 'var(--pf-global--spacer--sm)' }}>
          <HelperTextItem icon={<InfoIcon />}>
            Services will launch at the specified date and take some time to be available.
          </HelperTextItem>
        </HelperText>
      ) : null}
    </Modal>
  );
};

export default CatalogItemFormAutoStopDestroyModal;
