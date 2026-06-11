import React, { useEffect, useState } from 'react';
import DateTimePicker from '@app/components/DateTimePicker';
import TimezoneSelector from '@app/components/TimezoneSelector';
import { getBrowserTimezone } from '@app/components/timezones';
import Modal, { useModal } from '@app/Modal/Modal';
import { Form, FormGroup, Switch, Tooltip } from '@patternfly/react-core';
import OutlinedQuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/outlined-question-circle-icon';
import BetaBadge from '@app/components/BetaBadge';
import { READY_BY_LEAD_TIME_MS } from '@app/util';

const CatalogItemFormStartModal: React.FC<{
  isOpen: boolean;
  isWorkshop: boolean;
  isAdmin: boolean;
  startDate: Date;
  onConfirm: (startDate: Date, useReadyByDate: boolean) => void;
  onClose: () => void;
  title: string;
}> = ({ isOpen, isWorkshop, isAdmin, startDate, onConfirm, onClose, title }) => {
  const [modalRef, openModal] = useModal();
  const [now] = useState(() => Date.now());
  const [timezone, setTimezone] = useState(getBrowserTimezone);
  const [selectedDate, setSelectedDate] = useState<Date>(startDate);
  const [useReadyByDate, setUseReadyByDate] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedDate(startDate);
      openModal();
    }
  }, [isOpen, startDate, openModal]);

  return (
    <Modal ref={modalRef} onConfirm={() => onConfirm(selectedDate, useReadyByDate)} title={title} onClose={onClose}>
      <TimezoneSelector timezone={timezone} onChange={setTimezone} />
      <Form isHorizontal>
        <FormGroup
          fieldId="start-date-modal"
          label={isWorkshop && useReadyByDate ? 'Ready by' : isWorkshop ? 'Provisioning Date' : 'Start Provisioning Date'}
        >
          <DateTimePicker
            defaultTimestamp={
              isWorkshop && useReadyByDate
                ? (selectedDate?.getTime() || now) + READY_BY_LEAD_TIME_MS
                : selectedDate?.getTime() || now
            }
            forceUpdateTimestamp={
              isWorkshop && useReadyByDate
                ? selectedDate?.getTime() + READY_BY_LEAD_TIME_MS
                : selectedDate?.getTime()
            }
            onSelect={(d: Date) => {
              if (isWorkshop && useReadyByDate) {
                setSelectedDate(new Date(d.getTime() - READY_BY_LEAD_TIME_MS));
              } else {
                setSelectedDate(d);
              }
            }}
            minDate={isWorkshop && useReadyByDate ? now + READY_BY_LEAD_TIME_MS : now}
            timezone={timezone}
          />
        </FormGroup>
        {isWorkshop && isAdmin ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--pf-t--global--spacer--sm)',
            }}
          >
            <Switch
              id="provisioning-mode-switch-modal"
              aria-label="Set ready by date"
              label={
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  Set ready by date
                  <BetaBadge />
                </div>
              }
              isChecked={useReadyByDate}
              hasCheckIcon
              onChange={(_event, isChecked) => setUseReadyByDate(isChecked)}
            />
            <Tooltip
              position="right"
              content={
                <p>
                  When enabled, allows you to specify when the workshop should be ready by (8 hours after provisioning
                  starts).
                </p>
              }
            >
              <OutlinedQuestionCircleIcon
                aria-label="When enabled, allows you to specify when the workshop should be ready by."
                className="tooltip-icon-only"
              />
            </Tooltip>
          </div>
        ) : null}
      </Form>
    </Modal>
  );
};

export default CatalogItemFormStartModal;
