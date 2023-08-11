import React, { useState } from 'react';
import { EditorState, LexicalEditor } from 'lexical';
import { $generateHtmlFromNodes } from '@lexical/html';
import { Link } from 'react-router-dom';
import {
  DescriptionList,
  DescriptionListTerm,
  DescriptionListGroup,
  DescriptionListDescription,
  Select,
  SelectOption,
  SelectVariant,
  Tooltip,
  Switch,
} from '@patternfly/react-core';
import CheckCircleIcon from '@patternfly/react-icons/dist/js/icons/check-circle-icon';
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
import AutoStopDestroy from '@app/components/AutoStopDestroy';
import { getMostRelevantResourceAndTemplate } from '@app/Services/service-utils';
import ServiceStatus from '@app/Services/ServiceStatus';
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
  const autoStopTime = getWorkshopAutoStopTime(workshop, resourceClaims);

  async function patchWorkshopSpec(patch: {
    accessPassword?: string;
    description?: string;
    displayName?: string;
    openRegistration?: boolean;
    labUserInterface?: { redirect?: boolean };
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
          <Tooltip position="right" content={<p>Description text visible in the user access page.</p>}>
            <OutlinedQuestionCircleIcon
              aria-label="Description text visible in the user access page."
              className="tooltip-icon-only"
            />
          </Tooltip>
        </DescriptionListTerm>
        <DescriptionListDescription>
          <Editor
            onChange={(_: EditorState, editor: LexicalEditor) => {
              editor.update(() => {
                const html = $generateHtmlFromNodes(editor, null);
                patchWorkshopSpec({ description: html });
              });
            }}
            placeholder="Add description"
            defaultValue={workshop.spec.description}
          />
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>
          Redirect Users{' '}
          <Tooltip position="right" content={<p>Upon login redirect to the Lab User Interface if is defined</p>}>
            <OutlinedQuestionCircleIcon
              aria-label="Upon login redirect to the Lab User Interface if is defined"
              className="tooltip-icon-only"
            />
          </Tooltip>
        </DescriptionListTerm>
        <DescriptionListDescription>
          <Switch
            id="workshops-items-details__redirect"
            aria-label="Redirect"
            isChecked={workshop.spec.labUserInterface?.redirect === true}
            onChange={(v) => patchWorkshopSpec({ labUserInterface: { redirect: v } })}
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

      {resourceClaims ? (
        <DescriptionListGroup>
          <DescriptionListTerm>Status</DescriptionListTerm>
          <DescriptionListDescription>
            {autoStartTime && autoStartTime > Date.now() ? (
              <span className="services-item__status--scheduled" key="scheduled">
                <CheckCircleIcon key="scheduled-icon" /> Scheduled
              </span>
            ) : resourceClaims.length > 0 ? (
              <ServiceStatus
                creationTime={Date.parse(resourceClaims[0].metadata.creationTimestamp)}
                resource={getMostRelevantResourceAndTemplate(resourceClaims[0]).resource}
                resourceTemplate={getMostRelevantResourceAndTemplate(resourceClaims[0]).template}
                resourceClaim={resourceClaims[0]}
                summary={resourceClaims[0].status?.summary}
              />
            ) : (
              <p>...</p>
            )}
          </DescriptionListDescription>
        </DescriptionListGroup>
      ) : null}

      {autoStartTime && autoStartTime > Date.now() ? (
        <DescriptionListGroup>
          <DescriptionListTerm>Start Date</DescriptionListTerm>
          <DescriptionListDescription>
            <AutoStopDestroy
              type="auto-start"
              variant="extended"
              onClick={() => (showModal ? showModal({ resourceClaims: [], action: 'scheduleStart' }) : null)}
              className="workshops-item__schedule-btn"
              isDisabled={!showModal}
              time={autoStartTime}
            />
          </DescriptionListDescription>
        </DescriptionListGroup>
      ) : null}

      {checkWorkshopCanStop(resourceClaims) ? (
        <DescriptionListGroup>
          <DescriptionListTerm>Auto-Stop</DescriptionListTerm>
          <DescriptionListDescription>
            <AutoStopDestroy
              type="auto-stop"
              onClick={() => (showModal ? showModal({ action: 'scheduleStop', resourceClaims }) : null)}
              isDisabled={!showModal}
              time={autoStopTime}
              variant="extended"
              className="workshops-item__schedule-btn"
              destroyTimestamp={autoDestroyTime}
            />
          </DescriptionListDescription>
        </DescriptionListGroup>
      ) : null}

      {resourceClaims ? (
        <DescriptionListGroup>
          <DescriptionListTerm>Auto-Destroy</DescriptionListTerm>
          <DescriptionListDescription>
            <AutoStopDestroy
              type="auto-destroy"
              onClick={() => {
                if (showModal) {
                  showModal({ resourceClaims, action: 'scheduleDelete' });
                }
              }}
              time={autoDestroyTime}
              isDisabled={!showModal}
              variant="extended"
              className="workshops-item__schedule-btn"
              notDefinedMessage="- Not defined -"
            />
          </DescriptionListDescription>
        </DescriptionListGroup>
      ) : null}
    </DescriptionList>
  );
};

export default WorkshopsItemDetails;
