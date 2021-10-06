import * as React from 'react';

const parseDuration = require('parse-duration');

import {
  Button,
  Form,
  FormGroup,
  Modal,
  ModalVariant,
  TimePicker,
} from '@patternfly/react-core';

import { DatetimeSelect } from '@app/components/DatetimeSelect';
import { LocalTimestamp } from '@app/components/LocalTimestamp';
import { TimeInterval } from '@app/components/TimeInterval';

import './services-item-schedule-action-modal.css';

export interface ServicesItemScheduleActionModalProps {
  action
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (v:Date) => void;
  resourceClaim: any;
}

const ServicesItemScheduleActionModal: React.FunctionComponent<ServicesItemScheduleActionModalProps> = ({
  action,
  isOpen,
  onClose,
  onConfirm,
  resourceClaim,
}) => {
  const [selectedTime, setSelectedTime] = React.useState<any | null>(null);

  const catalogItemDisplayName = (
    resourceClaim.metadata?.annotations?.["babylon.gpte.redhat.com/catalogItemDisplayName"] ||
    resourceClaim.metadata?.labels?.["babylon.gpte.redhat.com/catalogItemName"] ||
    "Service"
  );

  const current = new Date(
    action === 'retirement' ? (
      Date.parse(resourceClaim.status.lifespan.end)
    ) :
    action === 'stop' ? Math.min(
      ...resourceClaim.status.resources.map(r => {
        const stopTimestamp = r.state.spec.vars.action_schedule.stop;
        if (stopTimestamp) {
          return Date.parse(stopTimestamp);
        } else {
          return null;
        }
      }).filter(time => time !== null)
    ) :
    Date.now()
  );

  // Reset selected time to current when action changes
  React.useEffect(() => setSelectedTime(current), [action]);

  const minimum = new Date(Date.now());

  const maximum = new Date(
    action === 'retirement' ? Math.min(
      Date.parse(resourceClaim.metadata.creationTimestamp) + parseDuration(resourceClaim.status.lifespan.maximum),
      Date.now() + parseDuration(resourceClaim.status.lifespan.relativeMaximum),
    ) :
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
    Date.now() + 30 * 24 * 60 * 60 * 1000
  );

  const interval = action === 'retirement' ? 60 * 60 * 1000 : 15 * 60 * 1000;

  function handleCancel() {
    setSelectedTime(null);
    if (onClose) {
      onClose();
    }
  }

  function handleConfirm(time) {
    if (selectedTime) {
      onConfirm(selectedTime);
    } else {
      onClose();
    }
  }

  return (
    <Modal
      className="rhpds-services-item-schedule-action-modal"
      variant={ModalVariant.small}
      title={`${catalogItemDisplayName} ${action}`}
      isOpen={isOpen}
      onClose={handleCancel}
      actions={[
        <Button key="confirm" variant="primary"
          onClick={handleConfirm}
        >Confirm</Button>,
        <Button key="cancel" variant="link"
          onClick={handleCancel}
        >Cancel</Button>
      ]}
    >
      <Form isHorizontal>
        <FormGroup fieldId="" label={`${action} time`}>
          <DatetimeSelect
            idPrefix={`${resourceClaim.metadata.namespace}:${resourceClaim.metadata.name}:lifespan:`}
            onSelect={time => setSelectedTime(time)}
            toggleContent={<span><LocalTimestamp time={selectedTime || current}/> (<TimeInterval to={selectedTime || current}/>)</span>}
            current={selectedTime || current}
            interval={interval}
            minimum={minimum}
            maximum={maximum}
          />
        </FormGroup>
      </Form>
    </Modal>
  );
}

export { ServicesItemScheduleActionModal };
