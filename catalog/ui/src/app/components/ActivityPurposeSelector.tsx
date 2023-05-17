import React, { useState } from 'react';
import { FormGroup, Radio, Select, SelectOption, SelectVariant, TextInput, Tooltip } from '@patternfly/react-core';
import OutlinedQuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/outlined-question-circle-icon';
import useSession from '@app/utils/useSession';

export const ActivityOpts = [
  { name: 'Customer Facing', id: 1 },
  { name: 'Partner Facing', id: 2 },
  { name: 'Practice / Enablement', id: 3 },
  { name: 'Brand Event', id: 4 },
  { name: 'Asset Development', id: 5, requiredRoles: ['rhpds-devs', 'rhpds-admins'] },
  { name: 'Admin', id: 6, requiredRoles: ['rhpds-admins'] },
];
export const PurposeOpts = [
  { name: 'Conduct a customer Demo', activityId: 1, id: 1, sfdcRequired: true },
  { name: 'Conduct an individual customer hands on workshop', activityId: 1, id: 2, sfdcRequired: true },
  { name: 'Conduct a Proof of Concept', activityId: 1, id: 3, sfdcRequired: true },
  { name: 'Conduct a Marketing Event/Multi customer event', activityId: 1, id: 4, sfdcRequired: true },
  { name: 'Other', activityId: 1, id: 5, requireUserInput: true, sfdcRequired: true },
  { name: 'Conduct a Partner Demo', activityId: 2, id: 6, sfdcRequired: true },
  { name: 'Conduct a Partner Enablement workshop', activityId: 2, id: 7, sfdcRequired: false },
  { name: 'Conduct a Partner Proof of Concept', activityId: 2, id: 8, sfdcRequired: false },
  { name: 'Conduct a Multi Partner event', activityId: 2, id: 9, sfdcRequired: false },
  { name: 'Conduct a Partner event with customers', activityId: 2, id: 10, sfdcRequired: true },
  { name: 'Other', activityId: 2, id: 11, requireUserInput: true, sfdcRequired: true },
  { name: 'Prepare for a customer demo', activityId: 3, id: 12, sfdcRequired: true },
  { name: 'Prepare for a customer workshop', activityId: 3, id: 13, sfdcRequired: true },
  { name: 'Learning about the product', activityId: 3, id: 14, sfdcRequired: false },
  { name: 'Trying out a technical solution', activityId: 3, id: 15, sfdcRequired: false },
  { name: 'Preparing for a customer services engagement', activityId: 3, id: 16, sfdcRequired: false },
  { name: 'Conduct Internal Training/Enablement', activityId: 3, id: 17, sfdcRequired: false },
  { name: 'Other', activityId: 3, id: 18, requireUserInput: true, sfdcRequired: true },
  { name: 'Tech Exchange', activityId: 4, id: 19, sfdcRequired: false },
  { name: 'Summit', activityId: 4, id: 20, sfdcRequired: false },
  { name: 'AnsibleFest', activityId: 4, id: 21, sfdcRequired: false },
  { name: 'Other', activityId: 4, id: 22, requireUserInput: true, sfdcRequired: false },
  { name: 'Developing a Custom Demo', activityId: 5, id: 23, sfdcRequired: false },
  { name: 'Developing a community demo', activityId: 5, id: 24, sfdcRequired: false },
  { name: 'Other', activityId: 5, id: 25, requireUserInput: true, sfdcRequired: false },
  { name: 'Asset Development', activityId: 6, id: 26, sfdcRequired: false },
  { name: 'Asset Maintenance', activityId: 6, id: 27, sfdcRequired: false },
  { name: 'QA', activityId: 6, id: 28, sfdcRequired: false },
  { name: 'Other', activityId: 6, id: 29, requireUserInput: true, sfdcRequired: false },
];
const ActivityPurposeSelector: React.FC<{
  onChange: (activity: string, purpose: string, explanation: string) => void;
  value?: { purpose?: string; activity?: string; explanation?: string };
}> = ({ onChange, value }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { groups } = useSession().getSession();
  const [activity, setActivity] = useState(value.activity || '');
  const [purpose, setPurpose] = useState(value.purpose || '');
  const [explanation, setExplanation] = useState(value.explanation || '');
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
          {ActivityOpts.filter((a) => !a.requiredRoles || a.requiredRoles.some((r) => groups.includes(r))).map(
            (activityOpt) => (
              <div key={`activity-${activityOpt.id}`}>
                <Radio
                  isChecked={activityOpt.name === activity}
                  name="activity"
                  onChange={() => {
                    setActivity(activityOpt.name);
                    setPurpose('');
                    onChange(activityOpt.name, null, null);
                  }}
                  label={activityOpt.name}
                  id={`activity-${activityOpt.id}`}
                ></Radio>
              </div>
            )
          )}
        </div>
      </FormGroup>
      <FormGroup fieldId="purpose" isRequired label="Purpose">
        <div className="catalog-item-form__group-control--single">
          <div className="select-wrapper">
            <Select
              aria-label="Purpose"
              isOpen={isOpen}
              onSelect={(_, _purpose) => {
                setPurpose(_purpose as string);
                setIsOpen(false);
                onChange(activity, _purpose as string, null);
              }}
              onToggle={() => setIsOpen((v) => !v)}
              placeholderText="- Select purpose -"
              selections={purpose.split(':')[0]}
              variant={SelectVariant.single}
            >
              {PurposeOpts.filter(
                (purposeOpt) => ActivityOpts.find((a) => a.id === purposeOpt.activityId).name === activity
              ).map((purposeOpt) => (
                <SelectOption
                  key={`${ActivityOpts.find((a) => a.id === purposeOpt.activityId).name} - ${purposeOpt.name}`}
                  value={purposeOpt.name}
                />
              ))}
            </Select>
          </div>
          {purpose && purpose === 'Other' ? (
            <div className="catalog-item-form__group-control--single">
              <div className="select-wrapper">
                <TextInput
                  aria-label="Specify purpose"
                  placeholder="Specify purpose"
                  onChange={(_explanation) => {
                    setExplanation(_explanation);
                    onChange(activity, purpose, _explanation);
                  }}
                  value={explanation}
                />
              </div>
            </div>
          ) : null}
          <Tooltip position="right" content={<div>Purpose for this service.</div>}>
            <OutlinedQuestionCircleIcon aria-label="Purpose for this service." className="tooltip-icon-only" />
          </Tooltip>
        </div>
      </FormGroup>
    </>
  );
};

export default ActivityPurposeSelector;
