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
const ActivityPurposeSelector: React.FC<{
  onChange: (value: string) => void;
  value?: string;
}> = ({ onChange, value }) => {
  const defaultValuesArr = value ? value.split('-') : ['', ''];
  const [isOpen, setIsOpen] = useState(false);
  const [activity, setActivity] = useState(defaultValuesArr.length === 1 ? defaultValuesArr[0].trim() : '');
  const [purpose, setPurpose] = useState(defaultValuesArr.length === 1 ? defaultValuesArr[1].trim() : '');

  return (
    <>
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
                  onChange(`${activityOpt.name} -`);
                }}
                label={activityOpt.name}
                id={`activity-${activityOpt.id}`}
              ></Radio>
            </div>
          ))}
        </div>
      </FormGroup>
      <FormGroup fieldId="purpose" isRequired label="Purpose">
        <div className="catalog-item-form__group-control--single">
          <div className="select-wrapper">
            <Select
              aria-label="Purpose"
              isOpen={isOpen}
              onSelect={(_, value) => {
                setPurpose(value as string);
                setIsOpen(false);
                onChange(`${activity} - ${value}`);
              }}
              onToggle={() => setIsOpen((v) => !v)}
              placeholderText="- Select purpose -"
              selections={purpose}
              variant={SelectVariant.single}
            >
              {PurposeOpts.filter((purposeOpt) => purposeOpt.activity === activity).map((purposeOpt) => (
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
