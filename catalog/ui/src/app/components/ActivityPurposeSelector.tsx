import React, { useState } from 'react';
import { FormGroup, Radio, Select, SelectOption, SelectVariant, TextInput, Tooltip } from '@patternfly/react-core';
import OutlinedQuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/outlined-question-circle-icon';
import useSession from '@app/utils/useSession';
import { TPurposeOpts } from '@app/types';

const ActivityPurposeSelector: React.FC<{
  onChange: (activity: string, purpose: string, explanation: string) => void;
  value?: { purpose?: string; activity?: string; explanation?: string };
  purposeOpts: TPurposeOpts;
}> = ({ onChange, value, purposeOpts }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { groups } = useSession().getSession();
  const [activity, setActivity] = useState(value.activity || '');
  const [purpose, setPurpose] = useState(value.purpose || '');
  const [explanation, setExplanation] = useState(value.explanation || '');
  const activityOpts = purposeOpts
    .filter((a) => !a.requiredRoles || a.requiredRoles.some((r) => groups.includes(r)))
    .reduce((entryMap, e) => entryMap.set(e.activity, [...(entryMap.get(e.activity) || []), e]), new Map());

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
          {[...activityOpts.keys()].map((activityOptName) => (
            <div key={`activity-${activityOptName}`}>
              <Radio
                isChecked={activityOptName === activity}
                name="activity"
                onChange={() => {
                  setActivity(activityOptName);
                  setPurpose('');
                  setExplanation('');
                  onChange(activityOptName, null, null);
                }}
                label={activityOptName}
                id={`activity-${activityOptName}`}
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
              onSelect={(_, _purpose) => {
                setPurpose(_purpose as string);
                setExplanation('');
                setIsOpen(false);
                onChange(activity, _purpose as string, null);
              }}
              onToggle={() => setIsOpen((v) => !v)}
              placeholderText="- Select purpose -"
              selections={purpose.split(':')[0]}
              variant={SelectVariant.single}
            >
              {purposeOpts
                .filter(
                  (purposeOpt) =>
                    [...activityOpts.keys()].find((actName) => actName === purposeOpt.activity) === activity
                )
                .map((purposeOpt) => (
                  <SelectOption
                    key={`${[...activityOpts.keys()].find((actName) => actName === purposeOpt.activity)} - ${
                      purposeOpt.name
                    }`}
                    value={purposeOpt.name}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <span>{purposeOpt.name}</span>
                  </SelectOption>
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
          <Tooltip
            position="right"
            content={
              <div>
                Purpose for this service. Definitions{' '}
                <a
                  href="https://docs.google.com/document/d/1B5h1YWmQuOSXVQSOPebwdc6Nij09AusvcORtqvUzPqo/edit?usp=sharing"
                  target="_blank"
                >
                  here
                </a>
                .
              </div>
            }
          >
            <OutlinedQuestionCircleIcon aria-label="Purpose for this service." className="tooltip-icon-only" />
          </Tooltip>
        </div>
      </FormGroup>
    </>
  );
};

export default ActivityPurposeSelector;
