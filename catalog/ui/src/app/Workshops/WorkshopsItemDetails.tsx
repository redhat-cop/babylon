import React, { useState } from 'react';
import { EditorState } from 'lexical';
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
  Tooltip,
} from '@patternfly/react-core';
import CheckCircleIcon from '@patternfly/react-icons/dist/js/icons/check-circle-icon';
import StopCircleIcon from '@patternfly/react-icons/dist/js/icons/stop-circle-icon';
import QuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/question-circle-icon';
import OutlinedClockIcon from '@patternfly/react-icons/dist/js/icons/outlined-clock-icon';
import OutlinedQuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/outlined-question-circle-icon';
import { patchWorkshop } from '@app/api';
import { ResourceClaim, Workshop, WorkshopProvision } from '@app/types';
import { BABYLON_DOMAIN } from '@app/util';
import useDebounce from '@app/utils/useDebounce';
import useSession from '@app/utils/useSession';
import EditableText from '@app/components/EditableText';
import LoadingIcon from '@app/components/LoadingIcon';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import Editor from '@app/components/Editor/Editor';
import LocalTimestamp from '@app/components/LocalTimestamp';
import TimeInterval from '@app/components/TimeInterval';
import { checkWorkshopCanStop, getWorkshopAutoStopTime, getWorkshopLifespan } from './workshops-utils';
import { ModalState } from './WorkshopsItem';

import './workshops-item-details.css';

const WorkshopsItemDetails: React.FC<{
  onWorkshopUpdate: (workshop: Workshop) => void;
  workshop: Workshop;
  resourceClaims?: ResourceClaim[];
  workshopProvisions?: WorkshopProvision[];
  showModal?: ({ action, resourceClaims }: ModalState) => void;
}> = ({ onWorkshopUpdate, workshopProvisions, resourceClaims, workshop, showModal }) => {
  const { isAdmin } = useSession().getSession();
  const debouncedPatchWorkshop = useDebounce(patchWorkshop, 1000) as (...args: unknown[]) => Promise<Workshop>;
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
    if (patch.openRegistration !== null && workshop.spec.openRegistration !== patch.openRegistration) {
      onWorkshopUpdate(
        await patchWorkshop({
          name: workshop.metadata.name,
          namespace: workshop.metadata.namespace,
          patch: { spec: patch },
        })
      );
    } else {
      onWorkshopUpdate(
        await debouncedPatchWorkshop({
          name: workshop.metadata.name,
          namespace: workshop.metadata.namespace,
          patch: { spec: patch },
        })
      );
    }
  }

  return (
    <DescriptionList isHorizontal className="workshops-item-details">
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
        <DescriptionListTerm>
          Description{' '}
          <Tooltip position="right" content={<p>Custom details visible after the user accesses the Workshop.</p>}>
            <OutlinedQuestionCircleIcon
              aria-label="Custom details visible after the user accesses the Workshop."
              className="tooltip-icon-only"
            />
          </Tooltip>
        </DescriptionListTerm>
        <DescriptionListDescription>
          <Editor
            onChange={(state: EditorState) => {
              const editorState = state.toJSON();
              patchWorkshopSpec({ description: JSON.stringify(editorState) });
            }}
            placeholder="Add description"
            defaultValue={workshop.spec.description}
          />
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>
          Access Password{' '}
          <Tooltip position="right" content={<p>Password the users need to introduce to access the Workshop.</p>}>
            <OutlinedQuestionCircleIcon
              aria-label="Password the users need to introduce to access the Workshop."
              className="tooltip-icon-only"
            />
          </Tooltip>
        </DescriptionListTerm>
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
        <DescriptionListTerm>Workshop Users Assigned</DescriptionListTerm>
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
              onClick={() => (showModal ? showModal({ resourceClaims: [], action: 'scheduleStart' }) : null)}
              icon={<OutlinedClockIcon />}
              iconPosition="right"
              className="workshops-item__schedule-btn"
              isDisabled={!showModal}
            >
              <LocalTimestamp time={autoStartTime} />
              <span style={{ padding: '0 6px' }}>
                (<TimeInterval toEpochMilliseconds={autoStartTime} />)
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
              isDisabled={!showModal}
              className="workshops-item__schedule-btn"
            >
              <LocalTimestamp time={autoStopTime} />
              <span style={{ padding: '0 6px' }}>
                (<TimeInterval toEpochMilliseconds={autoStopTime} />)
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
            isDisabled={!showModal}
            className="workshops-item__schedule-btn"
          >
            {autoDestroyTime ? (
              <>
                <LocalTimestamp time={autoDestroyTime} />
                <span style={{ padding: '0 6px' }}>
                  (<TimeInterval toEpochMilliseconds={autoDestroyTime} />)
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
