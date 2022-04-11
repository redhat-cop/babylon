import React from 'react';
import { useState } from 'react';
import {
  Button,
  Form,
  FormGroup,
  Select,
  SelectOption,
  SelectVariant,
  TextArea,
  TextInput,
  Modal,
  ModalVariant,
} from '@patternfly/react-core';
import { createWorkshopForMultiuserService } from '@app/api';
import { ResourceClaim, Workshop } from '@app/types';
import { displayName, randomString } from '@app/util';

export interface ServicesCreateWorkshopModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: ({ resourceClaim: ResourceClaim, workshop: Workshop }) => void;
  resourceClaim?: ResourceClaim;
}

const ServicesCreateWorkshopModal: React.FunctionComponent<ServicesCreateWorkshopModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  resourceClaim,
}) => {
  const [userRegistrationValue, setUserRegistrationValue] = useState<string>('open');
  const [userRegistrationSelectIsOpen, setUserRegistrationSelectIsOpen] = useState<boolean>(false);
  const [workshopAccessPassword, setWorkshopAccessPassword] = useState<string>(randomString(8));
  const [workshopDescription, setWorkshopDescription] = useState<string>('');
  const [workshopDisplayName, setWorkshopDisplayName] = useState<string>(displayName(resourceClaim));

  async function onConfirm(): Promise<void> {
    onCreate(
      await createWorkshopForMultiuserService({
        accessPassword: workshopAccessPassword,
        description: workshopDescription,
        displayName: workshopDisplayName,
        openRegistration: userRegistrationValue === 'open',
        resourceClaim: resourceClaim,
      })
    );
  }

  return (
    <Modal
      className="services-create-workshop-modal"
      variant={ModalVariant.large}
      title={`Create workshop for ${displayName(resourceClaim)}`}
      isOpen={isOpen}
      onClose={onClose}
      actions={[
        <Button key="confirm" variant="primary" onClick={onConfirm}>
          Create Workshop
        </Button>,
        <Button key="cancel" variant="link" onClick={onClose}>
          Cancel
        </Button>,
      ]}
    >
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
            onSelect={(event, selected) => {
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
    </Modal>
  );
};

export default ServicesCreateWorkshopModal;
