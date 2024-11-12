import React, { useEffect, useState } from 'react';
import DateTimePicker from '@app/components/DateTimePicker';
import Modal, { useModal } from '@app/Modal/Modal';
import { Alert, AlertGroup, Button, Form, FormGroup, Switch, Tooltip } from '@patternfly/react-core';
import useHelpLink from '@app/utils/useHelpLink';
import OutlinedClockIcon from '@patternfly/react-icons/dist/js/icons/outlined-clock-icon';

export type TDates = { stopDate: Date; endDate: Date };
export type TDatesTypes = 'auto-stop' | 'auto-destroy';

const CatalogItemFormAutoStopDestroyModal: React.FC<{
  type: TDatesTypes;
  autoStopDate?: Date;
  autoDestroyDate: Date;
  maxRuntimeTimestamp?: number;
  defaultRuntimeTimestamp?: number;
  maxDestroyTimestamp?: number;
  onConfirm: (date: TDates) => void;
  onClose: () => void;
  isAutoStopDisabled?: boolean;
  title: string;
}> = ({
  type,
  autoStopDate,
  autoDestroyDate,
  maxRuntimeTimestamp,
  defaultRuntimeTimestamp,
  maxDestroyTimestamp,
  onConfirm,
  onClose,
  isAutoStopDisabled = false,
  title,
}) => {
  const helpLink = useHelpLink();
  const [autoStopDestroyModal, openAutoStopDestroyModal] = useModal();
  const [dates, setDates] = useState<TDates>({
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
    <Modal ref={autoStopDestroyModal} onConfirm={() => onConfirm(dates)} title={title} onClose={onClose}>
      <Form isHorizontal>
        {type === 'auto-stop' ? (
          !isAutoStopDisabled ? (
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
                      ? setDates({
                          ...dates,
                          stopDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
                        })
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
          ) : (
            <FormGroup fieldId="auto-stop-modal" label="Auto-stop">
              <Button variant="control" isDisabled={true} icon={<OutlinedClockIcon />} iconPosition="right" size="sm">
                <Tooltip position="right" content={<div>This Catalog Item does not support Auto-Stop</div>}>
                  <span style={{ marginRight: 'var(--pf-v5-global--spacer--sm)' }}>Auto-Stop disabled</span>
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
                onSelect={(d) => setDates({ ...dates, endDate: d })}
                maxDate={maxDestroyTimestamp ? Date.now() + maxDestroyTimestamp : null}
                minDate={Date.now()}
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
      </Form>
    </Modal>
  );
};

export default CatalogItemFormAutoStopDestroyModal;
