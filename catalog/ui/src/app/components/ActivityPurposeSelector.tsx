import React, { useEffect, useState } from 'react';
import {
  FormGroup,
  Radio,
  TextInput,
  Tooltip,
  Select,
  SelectList,
  SelectOption,
  MenuToggle,
  MenuToggleElement,
} from '@patternfly/react-core';
import OutlinedQuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/outlined-question-circle-icon';
import useSession from '@app/utils/useSession';
import { TPurposeOpts } from '@app/types';

const ActivityPurposeSelector: React.FC<{
  onChange: (activity: string, purpose: string, explanation: string) => void;
  value?: { purpose?: string; activity?: string; explanation?: string };
  purposeOpts: TPurposeOpts;
  style?: React.CSSProperties;
}> = ({ onChange, value, purposeOpts, style }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { groups } = useSession().getSession();
  const [activity, setActivity] = useState(value?.activity || '');
  const [purpose, setPurpose] = useState(value?.purpose || '');
  const [explanation, setExplanation] = useState(value?.explanation || '');

  const activityOpts = purposeOpts
    .filter((a) => !a.requiredRoles || a.requiredRoles.some((r) => groups.includes(r)))
    .reduce((entryMap, e) => entryMap.set(e.activity, [...(entryMap.get(e.activity) || []), e]), new Map());

  useEffect(() => {
    let activityName: string = null;
    let purposeName: string = null;

    if (activityOpts.size === 1) {
      activityName = [...activityOpts.values()][0][0].activity;
      setActivity(activityName);
    }

    if (purposeOpts.length === 1) {
      purposeName = purposeOpts[0].name;
      setPurpose(purposeName);
    }

    if (activityName || purposeName) {
      onChange(activityName, purposeName, null);
    }
  }, []);

  const availablePurposes = purposeOpts.filter((p) => p.activity === activity);

  const toggle = (toggleRef: React.Ref<MenuToggleElement>) => (
    <MenuToggle ref={toggleRef} onClick={() => setIsOpen((prev) => !prev)} isExpanded={isOpen}>
      {purpose || '- Select purpose -'}
    </MenuToggle>
  );

  return (
    <div style={style}>
      <FormGroup
        fieldId="activity"
        isRequired
        label="Activity"
        labelIcon={
          <Tooltip position="right" content={<div>Activity for this service.</div>}>
            <OutlinedQuestionCircleIcon
              aria-label="Activity for this service."
              className="tooltip-icon-only"
              style={{ marginLeft: 'var(--pf-v5-global--spacer--sm)' }}
            />
          </Tooltip>
        }
      >
        <div
          className="catalog-item-form__group-control--single"
          style={{
            flexDirection: 'column',
            alignItems: 'flex-start',
            paddingBottom: 'var(--pf-v5-global--spacer--md)',
          }}
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
              />
            </div>
          ))}
        </div>
      </FormGroup>

      <FormGroup fieldId="purpose" isRequired label="Purpose">
        <div className="catalog-item-form__group-control--single">
          <Select
            isOpen={isOpen}
            onSelect={(_, selectedValue) => {
              setPurpose(selectedValue as string);
              setExplanation('');
              setIsOpen(false);
              onChange(activity, selectedValue as string, null);
            }}
            onOpenChange={setIsOpen}
            selected={purpose || ''}
            toggle={toggle}
          >
            <SelectList>
              {availablePurposes.map((purposeOpt) => (
                <SelectOption key={purposeOpt.name} value={purposeOpt.name}>
                  {purposeOpt.name}
                </SelectOption>
              ))}
            </SelectList>
          </Select>

          {purposeOpts.find((p) => p.name === purpose)?.requireUserInput && (
            <div className="catalog-item-form__group-control--single">
              <TextInput
                aria-label="Specify purpose"
                placeholder="Specify purpose"
                onChange={(_event, _explanation) => {
                  setExplanation(_explanation);
                  onChange(activity, purpose, _explanation);
                }}
                value={explanation}
              />
            </div>
          )}

          <Tooltip
            position="right"
            content={
              <div>
                Purpose for this service. Definitions{' '}
                <a
                  href="https://docs.google.com/document/d/1B5h1YWmQuOSXVQSOPebwdc6Nij09AusvcORtqvUzPqo/edit?usp=sharing"
                  target="_blank"
                  rel="noreferrer"
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
    </div>
  );
};

export default ActivityPurposeSelector;
