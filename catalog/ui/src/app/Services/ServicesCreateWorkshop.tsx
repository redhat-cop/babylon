import React, { useCallback } from 'react';
import { useState } from 'react';
import { Form, FormGroup, Select, SelectOption, SelectVariant, TextArea, TextInput } from '@patternfly/react-core';
import { createWorkshopForMultiuserService } from '@app/api';
import { ResourceClaim } from '@app/types';
import { displayName, randomString } from '@app/util';

const ServicesCreateWorkshop: React.FC<{
  resourceClaim?: ResourceClaim;
  setOnConfirmCb?: (_: any) => Promise<void>;
}> = ({ resourceClaim, setOnConfirmCb }) => {
  const [userRegistrationValue, setUserRegistrationValue] = useState<string>('open');
  const [userRegistrationSelectIsOpen, setUserRegistrationSelectIsOpen] = useState<boolean>(false);
  const [workshopAccessPassword, setWorkshopAccessPassword] = useState<string>(randomString(8));
  const [workshopDescription, setWorkshopDescription] = useState<string>('');
  const [workshopDisplayName, setWorkshopDisplayName] = useState<string>(displayName(resourceClaim));

  useCallback(async () => {
    setOnConfirmCb(
      await createWorkshopForMultiuserService({
        accessPassword: workshopAccessPassword,
        description: workshopDescription,
        displayName: workshopDisplayName,
        openRegistration: userRegistrationValue === 'open',
        resourceClaim: resourceClaim,
      })
    );
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
        <TextInput id="workshopDisplayName" onChange={(v) => setWorkshopDisplayName(v)} value={workshopDisplayName} />
      </FormGroup>
      <FormGroup fieldId="workshopAccessPassword" label="Access Password">
        <TextInput
          id="workshopAccessPassword"
          isRequired={true}
          onChange={(v) => setWorkshopAccessPassword(v)}
          value={workshopAccessPassword}
        />
      </FormGroup>
      <FormGroup fieldId="workshopRegistration" label="User Registration">
        <Select
          onToggle={(isOpen) => setUserRegistrationSelectIsOpen(isOpen)}
          selections={userRegistrationValue}
          variant={SelectVariant.single}
          isOpen={userRegistrationSelectIsOpen}
          onSelect={(_, selected) => {
            setUserRegistrationValue(typeof selected === 'string' ? selected : selected.toString());
            setUserRegistrationSelectIsOpen(false);
          }}
        >
          <SelectOption value="open">open registration</SelectOption>
          <SelectOption value="pre">pre-registration</SelectOption>
        </Select>
      </FormGroup>
      <FormGroup fieldId="workshopDescription" label="Workshop Description">
        <TextArea
          onChange={(v) => setWorkshopDescription(v)}
          value={workshopDescription}
          aria-label="Workshop Description"
        />
      </FormGroup>
    </Form>
  );
};

export default ServicesCreateWorkshop;
