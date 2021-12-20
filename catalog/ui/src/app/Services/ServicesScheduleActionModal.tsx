import React from 'react';

const parseDuration = require('parse-duration');

import { Button, Form, FormGroup, Modal, ModalVariant, TimePicker } from '@patternfly/react-core';
import { ResourceClaim } from '@app/types';
import { displayName } from '@app/util';

import DatetimeSelect from '@app/components/DatetimeSelect';
import LocalTimestamp from '@app/components/LocalTimestamp';
import TimeInterval from '@app/components/TimeInterval';

import './services-schedule-action-modal.css';

export interface ServicesScheduleActionModalProps {
  action: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (v:Date) => void;
  resourceClaim: ResourceClaim;
}

const ServicesScheduleActionModal: React.FunctionComponent<ServicesScheduleActionModalProps> = ({
  action,
  isOpen,
  onClose,
  onConfirm,
  resourceClaim,
}) => {
  const current:Date = new Date(
    action === 'retirement' ? (
      Date.parse(resourceClaim.spec.lifespan?.end || resourceClaim.status.lifespan.end)
    ) :
    action === 'stop' ? Math.min(
      ...resourceClaim.spec.resources.map((specResource, idx) => {
        const statusResource = resourceClaim.status?.resources?.[idx];
        const stopTimestamp = specResource.template?.spec?.vars?.action_schedule?.stop || statusResource.state.spec.vars.action_schedule.stop;
        if (stopTimestamp) {
          return Date.parse(stopTimestamp);
        } else {
          return null;
        }
      }).filter(time => time !== null)
    ) :
    Date.now()
  );

  const [selectedDate, setSelectedDate] = React.useState<Date>(current);

  // Reset selected time to current time when action or resourceClaim changes
  React.useEffect(() => {
    setSelectedDate(current)
  }, [current.getTime()]);

  const minimum:Date = new Date(Date.now());
  const maximum:Date = new Date(
    // Calculate retirement maximum from maximum lifespan
    action === 'retirement' ? Math.min(
      Date.parse(resourceClaim.metadata.creationTimestamp) + parseDuration(resourceClaim.status.lifespan.maximum),
      Date.now() + parseDuration(resourceClaim.status.lifespan.relativeMaximum),
    ) :
    // Calculate stop maximum from runtime maximum
    action === 'stop' ? Math.min(
      ...resourceClaim.status.resources.map(r => {
        const startTimestamp = r.state.spec.vars.action_schedule.start;
        const resourceMaximumRuntime = r.state.spec.vars.action_schedule.maximum_runtime;
        if (resourceMaximumRuntime && startTimestamp) {
          return Date.parse(startTimestamp) + parseDuration(resourceMaximumRuntime);
        } else {
          return null;
        }
      }).filter(runtime => runtime !== null)
    ) :
    // Default to 30 days?
    Date.now() + 30 * 24 * 60 * 60 * 1000
  );

  // Interval between times to show
  const interval:number = action === 'retirement' ? 60 * 60 * 1000 : 15 * 60 * 1000;

  return (
    <Modal
      className="services-schedule-action-modal"
      variant={ModalVariant.small}
      title={`${displayName(resourceClaim)} ${action}`}
      isOpen={isOpen}
      onClose={onClose}
      actions={[
        <Button key="confirm" variant="primary"
          onClick={() => onConfirm(selectedDate)}
        >Confirm</Button>,
        <Button key="cancel" variant="link"
          onClick={onClose}
        >Cancel</Button>
      ]}
    >
      <Form isHorizontal>
        <FormGroup fieldId="" label={`${action} time`}>
          <DatetimeSelect
            idPrefix={`${resourceClaim.metadata.namespace}:${resourceClaim.metadata.name}:lifespan:`}
            onSelect={(date) => setSelectedDate(date)}
            toggleContent={<span><LocalTimestamp date={selectedDate}/> (<TimeInterval toDate={selectedDate}/>)</span>}
            current={selectedDate}
            interval={interval}
            minimum={minimum}
            maximum={maximum}
          />
        </FormGroup>
      </Form>
    </Modal>
  );
}

export default ServicesScheduleActionModal;
