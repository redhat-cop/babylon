import React, { useEffect, useReducer, useState } from 'react';
import { EditorState, LexicalEditor } from 'lexical';
import { $generateHtmlFromNodes } from '@lexical/html';
import { Link } from 'react-router-dom';
import {
  DescriptionList,
  DescriptionListTerm,
  DescriptionListGroup,
  DescriptionListDescription,
  Tooltip,
  Switch,
  TextInput,
  Radio,
} from '@patternfly/react-core';
import { Select, SelectOption, SelectVariant } from '@patternfly/react-core/deprecated';
import CheckCircleIcon from '@patternfly/react-icons/dist/js/icons/check-circle-icon';
import OutlinedQuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/outlined-question-circle-icon';
import {
  apiFetch,
  apiPaths,
  checkSalesforceId,
  patchResourceClaim,
  patchWorkshop,
  patchWorkshopProvision,
} from '@app/api';
import { ResourceClaim, SfdcType, Workshop, WorkshopProvision, WorkshopUserAssignment } from '@app/types';
import { BABYLON_DOMAIN, DEMO_DOMAIN, getWhiteGloved } from '@app/util';
import useDebounce from '@app/utils/useDebounce';
import useSession from '@app/utils/useSession';
import EditableText from '@app/components/EditableText';
import LoadingIcon from '@app/components/LoadingIcon';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import Editor from '@app/components/Editor/Editor';
import AutoStopDestroy from '@app/components/AutoStopDestroy';
import { checkWorkshopCanStop, getWorkshopAutoStopTime, getWorkshopLifespan } from './workshops-utils';
import { ModalState } from './WorkshopsItem';
import WorkshopStatus from './WorkshopStatus';
import { useSWRConfig } from 'swr';

import './workshops-item-details.css';

function _reducer(
  state: { salesforce_id: string; valid: boolean; completed: boolean; salesforce_type: SfdcType },
  action: {
    type: 'set_salesforceId' | 'complete';
    salesforceId?: string;
    salesforceIdValid?: boolean;
    salesforceType?: SfdcType;
  }
) {
  switch (action.type) {
    case 'set_salesforceId':
      return {
        salesforce_id: action.salesforceId,
        valid: false,
        completed: false,
        salesforce_type: action.salesforceType,
      };
    case 'complete':
      return {
        ...state,
        valid: action.salesforceIdValid,
        completed: true,
      };
  }
}

const WorkshopsItemDetails: React.FC<{
  onWorkshopUpdate: (workshop: Workshop) => void;
  workshop: Workshop;
  resourceClaims?: ResourceClaim[];
  workshopProvisions?: WorkshopProvision[];
  workshopUserAssignments?: WorkshopUserAssignment[];
  showModal?: ({ action, resourceClaims }: ModalState) => void;
}> = ({ onWorkshopUpdate, workshopProvisions = [], resourceClaims, workshop, showModal, workshopUserAssignments }) => {
  const { isAdmin } = useSession().getSession();
  const debouncedApiFetch = useDebounce(apiFetch, 1000);
  const { cache } = useSWRConfig();
  const whiteGloved = getWhiteGloved(workshop);
  const debouncedPatchWorkshop = useDebounce(patchWorkshop, 1000) as (...args: unknown[]) => Promise<Workshop>;
  const userRegistrationValue = workshop.spec.openRegistration === false ? 'pre' : 'open';
  const workshopId = workshop.metadata.labels?.[`${BABYLON_DOMAIN}/workshop-id`];
  const [userRegistrationSelectIsOpen, setUserRegistrationSelectIsOpen] = useState(false);
  const { start: autoStartTime, end: autoDestroyTime } = getWorkshopLifespan(workshop, workshopProvisions);
  const autoStopTime = getWorkshopAutoStopTime(workshop, resourceClaims);

  const [salesforceObj, dispatchSalesforceObj] = useReducer(_reducer, {
    salesforce_id: workshopProvisions[0]?.spec.parameters?.salesforce_id || '',
    valid: !!workshopProvisions[0]?.spec.parameters?.salesforce_id,
    completed: workshopProvisions[0]?.spec.parameters?.salesforce_id ? false : true,
    salesforce_type: (workshopProvisions[0]?.spec.parameters?.sales_type as SfdcType) || null,
  });

  useEffect(() => {
    if (!salesforceObj.completed) {
      checkSalesforceId(salesforceObj.salesforce_id, debouncedApiFetch, salesforceObj.salesforce_type).then(
        ({ valid, message }: { valid: boolean; message?: string }) =>
          dispatchSalesforceObj({ type: 'complete', salesforceIdValid: valid })
      );
    } else {
      for (let workshopProvision of workshopProvisions) {
        if (
          workshopProvision.spec.parameters?.salesforce_id !== salesforceObj.salesforce_id ||
          workshopProvision.spec.parameters?.sales_type !== salesforceObj.salesforce_type
        ) {
          patchWorkshopProvisionSpec(workshopProvision.metadata.name, workshopProvision.metadata.namespace, {
            parameters: {
              ...workshopProvision.spec.parameters,
              salesforce_id: salesforceObj.salesforce_id,
              sales_type: salesforceObj.salesforce_type,
            },
          });
          for (let resourceClaim of resourceClaims) {
            if (
              resourceClaim.metadata.annotations?.[`${DEMO_DOMAIN}/salesforce-id`] !== salesforceObj.salesforce_id ||
              resourceClaim.metadata.annotations?.[`${DEMO_DOMAIN}/sales-type`] !== salesforceObj.salesforce_type
            ) {
              patchResourceClaim(resourceClaim.metadata.namespace, resourceClaim.metadata.name, {
                metadata: {
                  annotations: {
                    [`${DEMO_DOMAIN}/salesforce-id`]: salesforceObj.salesforce_id,
                    [`${DEMO_DOMAIN}/sales-type`]: salesforceObj.salesforce_type,
                  },
                },
              });
            }
          }
        }
      }
    }
  }, [dispatchSalesforceObj, salesforceObj, debouncedApiFetch]);

  async function patchWorkshopProvisionSpec(
    name: string,
    namespace: string,
    patch: {
      count?: number;
      concurrency?: number;
      startDelay?: number;
      parameters?: any;
    }
  ) {
    await patchWorkshopProvision({
      name,
      namespace,
      patch: { spec: patch },
    });
    cache.delete(
      apiPaths.WORKSHOP_PROVISIONS({
        workshopName: workshop.metadata.name,
        namespace,
        limit: 'ALL',
      })
    );
  }

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

  async function handleWhiteGloveChange(_: any, isChecked: boolean) {
    const patchObj = {
      metadata: {
        annotations: {
          [`${DEMO_DOMAIN}/white-glove`]: String(isChecked),
        },
      },
    };
    onWorkshopUpdate(
      await patchWorkshop({
        name: workshop.metadata.name,
        namespace: workshop.metadata.namespace,
        patch: patchObj,
      })
    );
    for (let resourceClaim of resourceClaims) {
      patchResourceClaim(resourceClaim.metadata.namespace, resourceClaim.metadata.name, patchObj);
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

      {resourceClaims ? (
        <DescriptionListGroup>
          <DescriptionListTerm>Status</DescriptionListTerm>
          <DescriptionListDescription>
            {autoStartTime && autoStartTime > Date.now() ? (
              <span className="services-item__status--scheduled" key="scheduled">
                <CheckCircleIcon key="scheduled-icon" /> Scheduled
              </span>
            ) : resourceClaims.length > 0 ? (
              <WorkshopStatus resourceClaims={resourceClaims} />
            ) : (
              <p>...</p>
            )}
          </DescriptionListDescription>
        </DescriptionListGroup>
      ) : null}

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
            onChange={(_event, v) => patchWorkshopSpec({ labUserInterface: { redirect: v } })}
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
            onToggle={(_event, isOpen) => setUserRegistrationSelectIsOpen(isOpen)}
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
        {workshopUserAssignments ? (
          <DescriptionListDescription>
            {workshopUserAssignments.filter((item) => item.spec.assignment).length} / {workshopUserAssignments.length}
          </DescriptionListDescription>
        ) : (
          <DescriptionListDescription>-</DescriptionListDescription>
        )}
      </DescriptionListGroup>

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

      {checkWorkshopCanStop(resourceClaims) || (autoStartTime && autoStartTime > Date.now()) ? (
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

      {workshopProvisions.length > 0 ? (
        <DescriptionListGroup>
          <DescriptionListTerm>Salesforce ID</DescriptionListTerm>

          <div>
            <div className="workshops-item__group-control--single" style={{ padding: '8px' }}>
              <Radio
                isChecked={'campaign' === salesforceObj.salesforce_type}
                name="sfdc-type"
                onChange={() =>
                  dispatchSalesforceObj({
                    ...salesforceObj,
                    salesforceType: 'campaign',
                    type: 'set_salesforceId',
                    salesforceId: salesforceObj.salesforce_id,
                  })
                }
                label="Campaign"
                id="sfdc-type-campaign"
              ></Radio>
              <Radio
                isChecked={'cdh' === salesforceObj.salesforce_type}
                name="sfdc-type"
                onChange={() => {
                  dispatchSalesforceObj({
                    ...salesforceObj,
                    salesforceType: 'cdh',
                    type: 'set_salesforceId',
                    salesforceId: salesforceObj.salesforce_id,
                  });
                }}
                label="CDH"
                id="sfdc-type-cdh"
              ></Radio>
              <Radio
                isChecked={'opportunity' === salesforceObj.salesforce_type}
                name="sfdc-type"
                onChange={() => {
                  dispatchSalesforceObj({
                    ...salesforceObj,
                    type: 'set_salesforceId',
                    salesforceType: 'opportunity',
                    salesforceId: salesforceObj.salesforce_id,
                  });
                }}
                label="Opportunity"
                id="sfdc-type-opportunity"
              ></Radio>
              <Radio
                isChecked={'project' === salesforceObj.salesforce_type}
                name="sfdc-type"
                onChange={() =>
                  dispatchSalesforceObj({
                    ...salesforceObj,
                    type: 'set_salesforceId',
                    salesforceType: 'project',
                    salesforceId: salesforceObj.salesforce_id,
                  })
                }
                label="Project"
                id="sfdc-type-project"
              ></Radio>
              <Tooltip
                position="right"
                content={<div>Salesforce ID type: Opportunity ID, Campaign ID, CDH Party or Project ID.</div>}
              >
                <OutlinedQuestionCircleIcon
                  aria-label="Salesforce ID type: Opportunity ID, Campaign ID, CDH Party or Project ID."
                  className="tooltip-icon-only"
                />
              </Tooltip>
            </div>
            <div className="workshops-item__group-control--single" style={{ maxWidth: 300, paddingBottom: '16px' }}>
              <TextInput
                type="text"
                key="salesforce_id"
                id="salesforce_id"
                onChange={(_event: any, value: string) =>
                  dispatchSalesforceObj({
                    ...salesforceObj,
                    type: 'set_salesforceId',
                    salesforceId: value,
                    salesforceType: salesforceObj.salesforce_type,
                  })
                }
                value={salesforceObj.salesforce_id}
                validated={
                  salesforceObj.salesforce_id
                    ? salesforceObj.completed && salesforceObj.valid
                      ? 'success'
                      : salesforceObj.completed
                      ? 'error'
                      : 'default'
                    : 'default'
                }
              />
              <Tooltip
                position="right"
                content={<div>Salesforce Opportunity ID, Campaign ID, CDH Party or Project ID.</div>}
              >
                <OutlinedQuestionCircleIcon
                  aria-label="Salesforce Opportunity ID, Campaign ID, CDH Party or Project ID."
                  className="tooltip-icon-only"
                />
              </Tooltip>
            </div>
          </div>
        </DescriptionListGroup>
      ) : null}

      {isAdmin ? (
        <DescriptionListGroup>
          <DescriptionListTerm> </DescriptionListTerm>
          <DescriptionListDescription>
            <Switch
              id="white-glove-switch"
              aria-label="White-Glove Support"
              label="White-Glove Support (for admins to tick when giving a white gloved experience)"
              isChecked={whiteGloved}
              hasCheckIcon
              onChange={handleWhiteGloveChange}
            />
          </DescriptionListDescription>
        </DescriptionListGroup>
      ) : null}
    </DescriptionList>
  );
};

export default WorkshopsItemDetails;
