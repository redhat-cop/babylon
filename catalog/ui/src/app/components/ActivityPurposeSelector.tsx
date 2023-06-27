import React, { useState } from 'react';
import { FormGroup, Radio, Select, SelectOption, SelectVariant, TextInput, Tooltip } from '@patternfly/react-core';
import OutlinedQuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/outlined-question-circle-icon';
import useSession from '@app/utils/useSession';

export const ActivityOpts = [
  { name: 'Customer Facing', id: 1 },
  { name: 'Partner Facing', id: 2 },
  { name: 'Practice / Enablement', id: 3 },
  { name: 'Brand Event', id: 4, requiredRoles: [] },
  { name: 'Asset Development', id: 5, requiredRoles: ['rhpds-devs', 'rhpds-admins'] },
  { name: 'Admin', id: 6, requiredRoles: ['rhpds-admins'] },
];
export const PurposeOpts = [
  {
    name: 'Show a demo to a customer',
    description: 'Showing a product/solution to a customer or prospect',
    activityId: 1,
    id: 1,
    sfdcRequired: true,
  },
  {
    name: 'Conduct a hands on workshop for one customer',
    description: 'Performing a hands on activity with an individual customer or prospect',
    activityId: 1,
    id: 2,
    sfdcRequired: true,
  },
  {
    name: 'Build a proof of concept for a customer',
    description: 'Using an environment to build and show a customer or prospect the capabilities of Red Hat solutions',
    activityId: 1,
    id: 3,
    sfdcRequired: true,
  },
  {
    name: 'Conduct a Marketing event with multiple customers',
    description: 'Performing a demo or workshop for a Marketing event for multiple customers (tied to a campaign ID)',
    activityId: 1,
    id: 4,
    sfdcRequired: true,
  },
  {
    name: 'Other',
    description:
      'Only select this option if the current purpose fields do not meet your needs. You will be prompted to add a description of your purpose in a text field so that we may better understand your reason for utilizing our platform',
    activityId: 1,
    id: 5,
    requireUserInput: true,
    sfdcRequired: true,
  },
  {
    name: 'Conduct a demo to a Partner',
    description: 'Showing a product/solution to a Partner',
    activityId: 2,
    id: 6,
    sfdcRequired: true,
  },
  {
    name: 'Conduct a demo with a Partner',
    description: 'Showing a product/solution to a customer/prospect with a Partner',
    activityId: 2,
    id: 7,
    sfdcRequired: false,
  },
  {
    name: 'Conduct an enablement workshop to Partners',
    description: 'Performing a hands on activity with Partners',
    activityId: 2,
    id: 8,
    sfdcRequired: false,
  },
  {
    name: 'Assist a Partner with a proof of concept',
    description:
      'Using an environment to build and show a customer or prospect the capabilities of Red Hat solutions with a Partner',
    activityId: 2,
    id: 9,
    sfdcRequired: false,
  },
  {
    name: 'Assist a Partner with running an event for multiple customers',
    description:
      'Assist a Partner in performing a demo or workshop for multiple customers who share common business challenges',
    activityId: 2,
    id: 10,
    sfdcRequired: true,
  },
  {
    name: 'Other',
    description:
      'Only select this option if the current purpose fields do not meet your needs. You will be prompted to add a description of your purpose in a text field so that we may better understand your reason for utilizing our platform',
    activityId: 2,
    id: 11,
    requireUserInput: true,
    sfdcRequired: true,
  },
  {
    name: 'Practice for a demo',
    description: 'Setting up and practicing with an environment to be able to perform a customer demo',
    activityId: 3,
    id: 12,
    sfdcRequired: true,
  },
  {
    name: 'Practice for a workshop',
    description: 'Setting up and practicing with an environment to be able to conduct a customer workshop',
    activityId: 3,
    id: 13,
    sfdcRequired: true,
  },
  {
    name: 'Learning about the product',
    description: 'Exploring Red Hat products in an active terminal to better understand their business value',
    activityId: 3,
    id: 14,
    sfdcRequired: false,
  },
  {
    name: 'Trying out a technical solution',
    description: 'Setting up an environment to test a potential product solution for a business challenge',
    activityId: 3,
    id: 15,
    sfdcRequired: false,
  },
  {
    name: 'Preparing for a customer service engagement',
    description: 'For consultants to set up and practice with an environment for a service solution',
    activityId: 3,
    id: 16,
    sfdcRequired: false,
  },
  {
    name: 'Conduct internal training/enablement',
    description: 'Using an environment to train team members/perform an internal Red Hat training',
    activityId: 3,
    id: 17,
    sfdcRequired: false,
  },
  {
    name: 'Other',
    description:
      'Only select this option if the current purpose fields do not meet your needs. You will be prompted to add a description of your purpose in a text field so that we may better understand your reason for utilizing our platform',
    activityId: 3,
    id: 18,
    requireUserInput: true,
    sfdcRequired: true,
  },
  { name: 'Tech Exchange', activityId: 4, id: 19, sfdcRequired: false },
  { name: 'Summit', activityId: 4, id: 20, sfdcRequired: false },
  { name: 'AnsibleFest', activityId: 4, id: 21, sfdcRequired: false },
  { name: 'Other', activityId: 4, id: 22, requireUserInput: true, sfdcRequired: false },
  {
    name: 'Developing a custom demo',
    description:
      'For use when existing Red Hat Demo Platform assets do not meet your customer’s needs and you need to develop a custom demo to show a product’s business value; use when you anticipate the demo becoming an Enterprise Standard asset for the Demo Platform team to maintain and support (this means developing your code with AgnosticD/V)',
    activityId: 5,
    id: 23,
    sfdcRequired: false,
  },
  {
    name: 'Developing a community demo',
    description:
      'For use when existing Red Hat Demo Platform assets do not meet your customer’s needs and you do not wish to develop your custom demo using AgnosticD/V; by developing a community demo, you agree to maintain the code in your own git repo. The Demo Platform team will maintain the base asset used to develop your community demo',
    activityId: 5,
    id: 24,
    sfdcRequired: false,
  },
  {
    name: 'Other',
    description:
      'Only select this option if the current purpose fields do not meet your needs. You will be prompted to add a description of your purpose in a text field so that we may better understand your reason for utilizing our platform',
    activityId: 5,
    id: 25,
    requireUserInput: true,
    sfdcRequired: false,
  },
  { name: 'Asset Development', description: '', activityId: 6, id: 26, sfdcRequired: false },
  { name: 'Asset Maintenance', description: '', activityId: 6, id: 27, sfdcRequired: false },
  { name: 'QA', description: '', activityId: 6, id: 28, sfdcRequired: false },
  {
    name: 'Other',
    description:
      'Only select this option if the current purpose fields do not meet your needs. You will be prompted to add a description of your purpose in a text field so that we may better understand your reason for utilizing our platform',
    activityId: 6,
    id: 29,
    requireUserInput: true,
    sfdcRequired: false,
  },
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
                    setExplanation('');
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
                setExplanation('');
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
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span>{purposeOpt.name}</span>
                  {purposeOpt.description ? (
                    <Tooltip position="right" content={<div>{purposeOpt.description}</div>}>
                      <OutlinedQuestionCircleIcon aria-label={purposeOpt.description} className="tooltip-icon-only" />
                    </Tooltip>
                  ) : null}
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
          <Tooltip position="right" content={<div>Purpose for this service.</div>}>
            <OutlinedQuestionCircleIcon aria-label="Purpose for this service." className="tooltip-icon-only" />
          </Tooltip>
        </div>
      </FormGroup>
    </>
  );
};

export default ActivityPurposeSelector;
