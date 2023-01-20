import React, { useState } from 'react';
import { FormGroup, Radio, Select, SelectOption, SelectVariant, Tooltip } from '@patternfly/react-core';
import OutlinedQuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/outlined-question-circle-icon';

const ActivityOpts = [
  { name: 'Customer Activity', id: 1 },
  { name: 'Development', id: 2 },
  { name: 'Training', id: 3 },
];
const PurposeOpts = [
  { name: 'Customer environment testing', activity: 'Customer Activity', id: 1 },
  { name: 'Customer workshop/demo', activity: 'Customer Activity', id: 2 },
  { name: 'Informal training', activity: 'Customer Activity', id: 3 },
  { name: 'Multi-customer event', activity: 'Customer Activity', id: 4 },
  { name: 'Proof of concept', activity: 'Customer Activity', id: 5 },
  { name: 'Catalog item creation / maintenance', activity: 'Development', id: 6 },
  { name: 'PnT engineering', activity: 'Development', id: 7 },
  { name: 'Solution prototyping', activity: 'Development', id: 8 },
  { name: 'Ad-hoc or exploratory', activity: 'Training', id: 9 },
  { name: 'As part of course', activity: 'Training', id: 10 },
];
const EventPurposeOpts = [
  { name: 'RHTE 2023 - APAC', activity: 'Event', id: 1, sfdc: null },
  { name: 'RHTE 2023 - EMEA', activity: 'Event', id: 2, sfdc: null },
  { name: 'RHTE 2023 - LATAM', activity: 'Event', id: 3, sfdc: null },
  { name: 'RHTE 2023 - NA', activity: 'Event', id: 4, sfdc: null },
];
const ActivityPurposeSelector: React.FC<
  | {
      onChange: (value: string) => void;
      value?: string;
      isEvent?: false | null;
    }
  | {
      onChange: (value: string, sfdc: string) => void;
      value: string;
      isEvent: true;
    }
> = ({ onChange, value, isEvent = false }) => {
  const defaultValuesArr = value ? value.split('-').map((x) => x.trim()) : ['', ''];
  const [isOpen, setIsOpen] = useState(false);
  const [activity, setActivity] = useState(defaultValuesArr.length === 1 ? defaultValuesArr[0] : '');
  const [purpose, setPurpose] = useState(defaultValuesArr.length === 2 ? defaultValuesArr[1] : '');

  return (
    <>
      {!isEvent ? (
        <FormGroup
          fieldId="activity"
          isRequired
          label="Activity"
          labelIcon={
            <Tooltip position="right" content={<div>Activity for this service.</div>}>
              <OutlinedQuestionCircleIcon
                aria-label="Activity for this service."
                className="tooltip-icon-only"
                style={{ marginLeft: 'var(--pf-global--spacer--sm)' }}
              />
            </Tooltip>
          }
        >
          <div
            className="catalog-item-form__group-control--single"
            style={{ flexDirection: 'column', alignItems: 'flex-start' }}
          >
            {ActivityOpts.map((activityOpt) => (
              <div key={`activity-${activityOpt.id}`}>
                <Radio
                  isChecked={activityOpt.name === activity}
                  name="activity"
                  onChange={() => {
                    setActivity(activityOpt.name);
                    setPurpose('');
                    onChange(`${activityOpt.name} -`, null);
                  }}
                  label={activityOpt.name}
                  id={`activity-${activityOpt.id}`}
                ></Radio>
              </div>
            ))}
          </div>
        </FormGroup>
      ) : null}
      <FormGroup fieldId="purpose" isRequired label="Purpose">
        <div className="catalog-item-form__group-control--single">
          <div className="select-wrapper">
            <Select
              aria-label="Purpose"
              isOpen={isOpen}
              onSelect={(_, _purpose) => {
                setPurpose(_purpose as string);
                setIsOpen(false);
                let sfdc = null;
                if (isEvent) {
                  sfdc = EventPurposeOpts.find((e) => e.name === _purpose)?.sfdc;
                }
                onChange(`${activity} - ${_purpose}`, sfdc);
              }}
              onToggle={() => setIsOpen((v) => !v)}
              placeholderText="- Select purpose -"
              selections={purpose}
              variant={SelectVariant.single}
            >
              {(isEvent ? EventPurposeOpts : PurposeOpts)
                .filter((purposeOpt) => purposeOpt.activity === activity)
                .map((purposeOpt) => (
                  <SelectOption key={`${purposeOpt.activity} - ${purposeOpt.name}`} value={purposeOpt.name} />
                ))}
            </Select>
          </div>
          <Tooltip position="right" content={<div>Purpose for this service.</div>}>
            <OutlinedQuestionCircleIcon aria-label="Purpose for this service." className="tooltip-icon-only" />
          </Tooltip>
        </div>
      </FormGroup>
    </>
  );
};

export default ActivityPurposeSelector;
