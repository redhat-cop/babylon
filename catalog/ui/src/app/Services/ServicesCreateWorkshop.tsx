import React, { useEffect, useState } from 'react';
import { Form, FormGroup, TextArea, TextInput } from '@patternfly/react-core';
import { Select, SelectOption, SelectList, MenuToggle, MenuToggleElement } from '@patternfly/react-core';
import { createWorkshopForMultiuserService } from '@app/api';
import { ResourceClaim } from '@app/types';
import { displayName, randomString } from '@app/util';

const ServicesCreateWorkshop: React.FC<{
  resourceClaim?: ResourceClaim;
  setOnConfirmCb?: (_: any) => Promise<void>;
}> = ({ resourceClaim, setOnConfirmCb }) => {
  const [userRegistrationValue, setUserRegistrationValue] = useState('open');
  const [userRegistrationSelectIsOpen, setUserRegistrationSelectIsOpen] = useState(false);
  const [workshopAccessPassword, setWorkshopAccessPassword] = useState(randomString(8));
  const [workshopDescription, setWorkshopDescription] = useState('');
  const [workshopDisplayName, setWorkshopDisplayName] = useState(displayName(resourceClaim));

  const onToggleClick = () => {
    setUserRegistrationSelectIsOpen(!userRegistrationSelectIsOpen);
  };

  const toggle = (toggleRef: React.Ref<MenuToggleElement>) => (
    <MenuToggle ref={toggleRef} onClick={onToggleClick} isExpanded={userRegistrationSelectIsOpen}>
      {userRegistrationValue}
    </MenuToggle>
  );

  useEffect(() => {
    function _createWorkshopForMultiuserService() {
      return createWorkshopForMultiuserService({
        accessPassword: workshopAccessPassword,
        description: workshopDescription,
        displayName: workshopDisplayName,
        openRegistration: userRegistrationValue === 'open',
        resourceClaim: resourceClaim,
      });
    }
    setOnConfirmCb(() => _createWorkshopForMultiuserService);
  }, [
    resourceClaim,
    setOnConfirmCb,
    userRegistrationValue,
    workshopAccessPassword,
    workshopDescription,
    workshopDisplayName,
  ]);

  return (
    <Form>
      <FormGroup fieldId="workshopDisplayName" isRequired={true} label="Display Name">
        <TextInput
          id="workshopDisplayName"
          onChange={(_event, v) => setWorkshopDisplayName(v)}
          value={workshopDisplayName}
        />
      </FormGroup>
      <FormGroup fieldId="workshopAccessPassword" label="Access Password">
        <TextInput
          id="workshopAccessPassword"
          isRequired={true}
          onChange={(_event, v) => setWorkshopAccessPassword(v)}
          value={workshopAccessPassword}
        />
      </FormGroup>
      <FormGroup fieldId="workshopRegistration" label="User Registration">
        <Select
          isOpen={userRegistrationSelectIsOpen}
          onSelect={(_, selected) => {
            setUserRegistrationValue(typeof selected === 'string' ? selected : selected.toString());
            setUserRegistrationSelectIsOpen(false);
          }}
          selected={userRegistrationValue}
          onOpenChange={(isOpen) => setUserRegistrationSelectIsOpen(isOpen)}
          toggle={toggle}
        >
          <SelectList>
            <SelectOption value="open">open registration</SelectOption>
            <SelectOption value="pre">pre-registration</SelectOption>
          </SelectList>
        </Select>
      </FormGroup>
      <FormGroup fieldId="workshopDescription" label="Workshop Description">
        <TextArea
          onChange={(_event, v) => setWorkshopDescription(v)}
          value={workshopDescription}
          aria-label="Workshop Description"
        />
      </FormGroup>
    </Form>
  );
};

export default ServicesCreateWorkshop;
