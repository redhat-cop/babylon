import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DescriptionList,
  DescriptionListTerm,
  DescriptionListGroup,
  DescriptionListDescription,
  Select,
  SelectOption,
  SelectVariant,
  Button,
} from '@patternfly/react-core';
import { patchWorkshop } from '@app/api';
import { ResourceClaim, Workshop, WorkshopProvision } from '@app/types';
import { BABYLON_DOMAIN } from '@app/util';
import EditableText from '@app/components/EditableText';
import LoadingIcon from '@app/components/LoadingIcon';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import useSession from '@app/utils/useSession';
import { CheckCircleIcon, OutlinedClockIcon, QuestionCircleIcon, StopCircleIcon } from '@patternfly/react-icons';
import LocalTimestamp from '@app/components/LocalTimestamp';
import TimeInterval from '@app/components/TimeInterval';
import { ModalState } from './WorkshopsItem';
import { checkWorkshopCanStop, getWorkshopAutoStopTime, getWorkshopLifespan } from './workshops-utils';

import './workshops-item-details.css';

const WorkshopsItemDetails: React.FC<{
  onWorkshopUpdate: (workshop: Workshop) => void;
  workshop: Workshop;
  resourceClaims?: ResourceClaim[];
  workshopProvisions?: WorkshopProvision[];
  showModal?: ({ action, resourceClaims }: ModalState) => void;
}> = ({ onWorkshopUpdate, workshopProvisions, resourceClaims, workshop, showModal }) => {
  const { isAdmin } = useSession().getSession();
  const userRegistrationValue = workshop.spec.openRegistration === false ? 'pre' : 'open';
  const workshopId = workshop.metadata.labels?.[`${BABYLON_DOMAIN}/workshop-id`];
  const [userRegistrationSelectIsOpen, setUserRegistrationSelectIsOpen] = useState(false);
  const { start: autoStartTime, end: autoDestroyTime } = getWorkshopLifespan(workshop, workshopProvisions);
  const autoStopTime = getWorkshopAutoStopTime(resourceClaims);

  async function patchWorkshopSpec(patch: {
    accessPassword?: string;
    description?: string;
    displayName?: string;
    openRegistration?: boolean;
  }): Promise<void> {
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
          {isAdmin ? <OpenshiftConsoleLink resource={workshop} /> : null}
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Workshop URL</DescriptionListTerm>
        <DescriptionListDescription>
          {workshopId ? (
            <Link to={`/workshop/${workshopId}`} target="_blank" rel="noopener">
              {window.location.protocol}
              {'//'}
              {window.location.host}/workshop/{workshopId}
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
        <DescriptionListTerm>Seats Assigned</DescriptionListTerm>
        {workshop.spec.userAssignments ? (
          <DescriptionListDescription>
            {workshop.spec.userAssignments.filter((item) => item.assignment).length} /{' '}
            {workshop.spec.userAssignments.length}
          </DescriptionListDescription>
        ) : (
          <DescriptionListDescription>-</DescriptionListDescription>
        )}
      </DescriptionListGroup>

      <DescriptionListGroup>
        <DescriptionListTerm>Status</DescriptionListTerm>
        <DescriptionListDescription>
          {autoStartTime && autoStartTime > Date.now() ? (
            <span className="workshops-item-details__status--scheduled">
              <CheckCircleIcon /> Scheduled
            </span>
          ) : checkWorkshopCanStop(resourceClaims) ? (
            <span className="workshops-item-details__status--running">
              <CheckCircleIcon /> Running
            </span>
          ) : workshopProvisions && workshopProvisions.length > 0 ? (
            <span className="workshops-item-details__status--stopped">
              <StopCircleIcon /> Stopped
            </span>
          ) : (
            <span className="workshops-item-details__status--unknown">
              <QuestionCircleIcon /> No workshop provision
            </span>
          )}
        </DescriptionListDescription>
      </DescriptionListGroup>

      {autoStartTime && autoStartTime > Date.now() ? (
        <DescriptionListGroup>
          <DescriptionListTerm>Start Date</DescriptionListTerm>
          <DescriptionListDescription>
            <Button
              key="auto-start"
              variant="control"
              onClick={() => {
                showModal ? showModal({ resourceClaims: [], action: 'scheduleStart' }) : null;
              }}
              icon={<OutlinedClockIcon />}
              iconPosition="right"
              className="workshops-item__schedule-btn"
              isDisabled={!!showModal}
            >
              <LocalTimestamp timestamp={new Date(autoStartTime).toISOString()} />
              <span style={{ padding: '0 6px' }}>
                (<TimeInterval toTimestamp={new Date(autoStartTime).toISOString()} />)
              </span>
            </Button>
          </DescriptionListDescription>
        </DescriptionListGroup>
      ) : null}

      {checkWorkshopCanStop(resourceClaims) ? (
        <DescriptionListGroup>
          <DescriptionListTerm>Auto-Stop Services</DescriptionListTerm>
          <DescriptionListDescription>
            <Button
              key="auto-stop"
              variant="control"
              icon={<OutlinedClockIcon />}
              iconPosition="right"
              onClick={() => (showModal ? showModal({ action: 'scheduleStop', resourceClaims }) : null)}
              isDisabled={!!showModal}
              className="workshops-item__schedule-btn"
            >
              <LocalTimestamp timestamp={new Date(autoStopTime).toISOString()} />
              <span style={{ padding: '0 6px' }}>
                (<TimeInterval toTimestamp={new Date(autoStopTime).toISOString()} />)
              </span>
            </Button>
          </DescriptionListDescription>
        </DescriptionListGroup>
      ) : null}

      <DescriptionListGroup>
        <DescriptionListTerm>Auto-Destroy</DescriptionListTerm>
        <DescriptionListDescription>
          <Button
            key="auto-destroy"
            variant="control"
            onClick={() => {
              showModal ? showModal({ resourceClaims, action: 'scheduleDelete' }) : null;
            }}
            icon={<OutlinedClockIcon />}
            iconPosition="right"
            isDisabled={!!showModal}
            className="workshops-item__schedule-btn"
          >
            {autoDestroyTime ? (
              <>
                <LocalTimestamp timestamp={new Date(autoDestroyTime).toISOString()} />
                <span style={{ padding: '0 6px' }}>
                  (<TimeInterval toTimestamp={new Date(autoDestroyTime).toISOString()} />)
                </span>
              </>
            ) : (
              <span style={{ marginRight: 'var(--pf-global--spacer--sm)' }}>- Not defined -</span>
            )}
          </Button>
        </DescriptionListDescription>
      </DescriptionListGroup>
    </DescriptionList>
  );
};

export default WorkshopsItemDetails;
