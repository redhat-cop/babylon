import React, { useEffect, useState } from 'react';
import DateTimePicker from '@app/components/DateTimePicker';
import Modal, { useModal } from '@app/Modal/Modal';
import { Form, FormGroup, HelperText, HelperTextItem } from '@patternfly/react-core';
import InfoIcon from '@patternfly/react-icons/dist/js/icons/info-icon';

export type TDates = { startDate: Date; stopDate: Date; destroyDate: Date };
export type TDatesTypes = 'auto-stop' | 'auto-destroy' | 'schedule';

const CatalogItemFormAutoStopDestroyModal: React.FC<{
  type: TDatesTypes;
  autoStartDate?: Date;
  autoStopDate?: Date;
  autoDestroyDate: Date;
  maxStartTimestamp?: number;
  maxRuntimeTimestamp?: number;
  maxDestroyTimestamp?: number;
  onConfirm: (date: TDates) => void;
  onClose: () => void;
  isWorkshopEnabled?: boolean;
  isAutoStopDisabled?: boolean;
}> = ({
  type,
  autoStartDate,
  autoStopDate,
  autoDestroyDate,
  maxStartTimestamp,
  maxRuntimeTimestamp,
  maxDestroyTimestamp,
  onConfirm,
  onClose,
  isWorkshopEnabled = false,
  isAutoStopDisabled = false,
}) => {
  const [autoStopDestroyModal, openAutoStopDestroyModal] = useModal();
  const [dates, setDates] = useState<TDates>({
    startDate: null,
    stopDate: null,
    destroyDate: null,
  });
  useEffect(() => {
    if (!!type) {
      openAutoStopDestroyModal();
    }
  }, [type]);

  return (
    <Modal
      ref={autoStopDestroyModal}
      onConfirm={() => onConfirm(dates)}
      title={type === 'auto-stop' ? 'Auto-stop' : type === 'auto-destroy' ? 'Auto-destroy' : 'Schedule for'}
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
        {(type === 'auto-stop' || type === 'schedule') && !isAutoStopDisabled ? (
          <FormGroup fieldId="auto-stop-modal" label="Auto-stop">
            <DateTimePicker
              defaultTimestamp={autoStopDate ? autoStopDate.getTime() : null}
              onSelect={(d) => setDates({ ...dates, stopDate: d })}
              minDate={Date.now()}
              maxDate={
                maxRuntimeTimestamp
                  ? type === 'schedule' && dates.startDate
                    ? dates.startDate.getTime() + maxRuntimeTimestamp
                    : Date.now() + maxRuntimeTimestamp
                  : null
              }
            />
          </FormGroup>
        ) : null}
        {type === 'auto-destroy' || type === 'schedule' ? (
          <FormGroup fieldId="auto-destroy-modal" label="Auto-destroy">
            <DateTimePicker
              defaultTimestamp={autoDestroyDate.getTime()}
              onSelect={(d) => setDates({ ...dates, destroyDate: d })}
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
