import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import {
  DescriptionList,
  DescriptionListTerm,
  DescriptionListGroup,
  DescriptionListDescription,
  Select,
  SelectOption,
  SelectVariant,
} from '@patternfly/react-core';

import { patchWorkshop } from '@app/api';
import { selectUserIsAdmin } from '@app/store';
import { Workshop } from '@app/types';
import { BABYLON_DOMAIN } from '@app/util';

import EditableText from '@app/components/EditableText';
import LoadingIcon from '@app/components/LoadingIcon';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';

interface EditableWorkshopSpecFields {
  accessPassword?: string;
  description?: string;
  displayName?: string;
  openRegistration?: boolean;
}

const WorkshopsItemDetails: React.FC<{
  onWorkshopUpdate: (workshop: Workshop) => void;
  workshop: Workshop;
}> = ({ onWorkshopUpdate, workshop }) => {
  const userIsAdmin: boolean = useSelector(selectUserIsAdmin);
  const userRegistrationValue: 'open' | 'pre' = workshop.spec.openRegistration === false ? 'pre' : 'open';
  const workshopID: string = workshop.metadata.labels?.[`${BABYLON_DOMAIN}/workshop-id`];

  const [userRegistrationSelectIsOpen, setUserRegistrationSelectIsOpen] = useState<boolean>(false);

  async function patchWorkshopSpec(patch: EditableWorkshopSpecFields): Promise<void> {
    onWorkshopUpdate(
      await patchWorkshop({
        name: workshop.metadata.name,
        namespace: workshop.metadata.namespace,
        patch: { spec: patch },
      })
    );
  }

  return (
    <DescriptionList isHorizontal>
      <DescriptionListGroup>
        <DescriptionListTerm>Name</DescriptionListTerm>
        <DescriptionListDescription>
          {workshop.metadata.name}
          {userIsAdmin ? <OpenshiftConsoleLink resource={workshop} /> : null}
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Workshop URL</DescriptionListTerm>
        <DescriptionListDescription>
          {workshopID ? (
            <Link to={`/workshop/${workshopID}`} target="_blank" rel="noopener">
              {window.location.protocol}
              {'//'}
              {window.location.host}/workshop/{workshopID}
            </Link>
          ) : (
            <LoadingIcon />
          )}
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Display Name</DescriptionListTerm>
        <DescriptionListDescription>
          <EditableText
            aria-label={`Edit Display Name`}
            onChange={(displayName: string) => patchWorkshopSpec({ displayName: displayName })}
            placeholder={workshop.metadata.name}
            value={workshop.spec.displayName}
          />
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Description</DescriptionListTerm>
        <DescriptionListDescription>
          <EditableText
            aria-label={`Edit Description`}
            componentType="TextArea"
            onChange={(description: string) => patchWorkshopSpec({ description: description })}
            placeholder="No description provided."
            value={workshop.spec.description}
          />
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>AccessPassword</DescriptionListTerm>
        <DescriptionListDescription>
          <EditableText
            aria-label={`Edit Access Password`}
            componentType="Password"
            onChange={(accessPassword: string) => patchWorkshopSpec({ accessPassword: accessPassword })}
            placeholder="- no description -"
            value={workshop.spec.accessPassword}
          />
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>User Registration</DescriptionListTerm>
        <DescriptionListDescription>
          <Select
            onToggle={(isOpen) => setUserRegistrationSelectIsOpen(isOpen)}
            selections={userRegistrationValue}
            variant={SelectVariant.single}
            isOpen={userRegistrationSelectIsOpen}
            onSelect={(event, selected) => {
              const selectedValue = typeof selected === 'string' ? selected : selected.toString();
              patchWorkshopSpec({ openRegistration: selectedValue === 'open' }).then(() =>
                setUserRegistrationSelectIsOpen(false)
              );
            }}
          >
            <SelectOption value="open">open registration</SelectOption>
            <SelectOption value="pre">pre-registration</SelectOption>
          </Select>
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>User Assignments</DescriptionListTerm>
        {workshop.spec.userAssignments ? (
          <DescriptionListDescription>
            {workshop.spec.userAssignments.filter((item) => item.assignment).length} /{' '}
            {workshop.spec.userAssignments.length}
          </DescriptionListDescription>
        ) : (
          <DescriptionListDescription>-</DescriptionListDescription>
        )}
      </DescriptionListGroup>
    </DescriptionList>
  );
};

export default WorkshopsItemDetails;
