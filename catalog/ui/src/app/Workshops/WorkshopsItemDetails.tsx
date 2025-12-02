import React, { useCallback, useState, useEffect, useMemo } from 'react';
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
  MenuToggle,
  MenuToggleElement,
  FormGroup,
  Button,
  NumberInput,
} from '@patternfly/react-core';
import { Select, SelectOption, SelectList } from '@patternfly/react-core';
import CheckCircleIcon from '@patternfly/react-icons/dist/js/icons/check-circle-icon';
import OutlinedQuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/outlined-question-circle-icon';
import BetaBadge from '@app/components/BetaBadge';
import { apiPaths, patchResourceClaim, patchWorkshop, patchWorkshopProvision } from '@app/api';
import { RequestUsageCost, ResourceClaim, Workshop, WorkshopProvision, WorkshopUserAssignment } from '@app/types';
import { BABYLON_DOMAIN, DEMO_DOMAIN, getWhiteGloved, setSalesforceItems as setSalesforceItemsAnno } from '@app/util';
import SalesforceItemsList from '@app/components/SalesforceItemsList';
import SalesforceItemsEditModal from '@app/components/SalesforceItemsEditModal';
import useDebounce from '@app/utils/useDebounce';
import useSession from '@app/utils/useSession';
import EditableText from '@app/components/EditableText';
import LoadingIcon from '@app/components/LoadingIcon';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import Editor from '@app/components/Editor/Editor';
import AutoStopDestroy from '@app/components/AutoStopDestroy';
import {
  checkWorkshopCanStop,
  getWorkshopAutoStopTime,
  getWorkshopLifespan,
  isWorkshopLocked,
} from './workshops-utils';
import { ModalState } from './WorkshopsItem';
import WorkshopStatus from './WorkshopStatus';
import { useSWRConfig } from 'swr';
import CurrencyAmount from '@app/components/CurrencyAmount';
import TimeInterval from '@app/components/TimeInterval';
import { PlusCircleIcon } from '@patternfly/react-icons';
import useDebounceState from '@app/utils/useDebounceState';
import useInterfaceConfig from '@app/utils/useInterfaceConfig';

import './workshops-item-details.css';

const WorkshopsItemDetails: React.FC<{
  onWorkshopUpdate: (workshop: Workshop) => void;
  workshop: Workshop;
  resourceClaims?: ResourceClaim[];
  workshopProvisions?: WorkshopProvision[];
  workshopUserAssignments?: WorkshopUserAssignment[];
  showModal?: ({ action, resourceClaims }: ModalState) => void;
  usageCost?: RequestUsageCost;
}> = ({
  onWorkshopUpdate,
  workshopProvisions = [],
  resourceClaims,
  workshop,
  showModal,
  workshopUserAssignments,
  usageCost,
}) => {
  const { isAdmin } = useSession().getSession();
  const { sfdc_enabled } = useInterfaceConfig();
  const { cache } = useSWRConfig();
  const whiteGloved = getWhiteGloved(workshop);
  const isLocked = isWorkshopLocked(workshop);
  const debouncedPatchWorkshop = useDebounce(patchWorkshop, 1000) as (...args: unknown[]) => Promise<Workshop>;
  const userRegistrationValue = workshop.spec.openRegistration === false ? 'pre' : 'open';
  const workshopId = workshop.metadata.labels?.[`${BABYLON_DOMAIN}/workshop-id`];
  const [userRegistrationSelectIsOpen, setUserRegistrationSelectIsOpen] = useState(false);
  const [useDirectProvisioningDate, setUseDirectProvisioningDate] = useState(false);
  const [modalEditSalesforce, setModalEditSalesforce] = useState(false);
  const opsEffortAnnotation = workshop.metadata.annotations?.[`${DEMO_DOMAIN}/ops-effort`];
  const opsEffortFromAnnotation = useMemo(() => parseInt(opsEffortAnnotation || '0', 10) || 0, [opsEffortAnnotation]);
  const [opsEffort, setOpsEffort] = useState<number>(opsEffortFromAnnotation);
  const debouncedOpsEffort = useDebounceState(opsEffort, 1000);

  const { start: autoStartTime, end: autoDestroyTime } = getWorkshopLifespan(workshop, workshopProvisions);
  const autoStopTime = getWorkshopAutoStopTime(workshop, resourceClaims);

  const onToggleClick = () => {
    setUserRegistrationSelectIsOpen(!userRegistrationSelectIsOpen);
  };

  const toggle = (toggleRef: React.Ref<MenuToggleElement>) => (
    <MenuToggle ref={toggleRef} onClick={onToggleClick} isExpanded={userRegistrationSelectIsOpen}>
      {userRegistrationValue}
    </MenuToggle>
  );

  const patchWorkshopProvisionSpec = useCallback(
    async (
      name: string,
      namespace: string,
      patch: {
        count?: number;
        concurrency?: number;
        startDelay?: number;
        parameters?: unknown;
      },
    ) => {
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
        }),
      );
    },
    [cache, workshop.metadata.name],
  );

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
        }),
      );
    } else {
      onWorkshopUpdate(
        await debouncedPatchWorkshop({
          name: workshop.metadata.name,
          namespace: workshop.metadata.namespace,
          patch: { spec: patch },
        }),
      );
    }
  }

  async function handleWhiteGloveChange(_: unknown, isChecked: boolean) {
    const patchObj = {
      metadata: {
        labels: {
          [`${DEMO_DOMAIN}/white-glove`]: String(isChecked),
        },
      },
    };
    onWorkshopUpdate(
      await patchWorkshop({
        name: workshop.metadata.name,
        namespace: workshop.metadata.namespace,
        patch: patchObj,
      }),
    );
    for (let resourceClaim of resourceClaims) {
      patchResourceClaim(resourceClaim.metadata.namespace, resourceClaim.metadata.name, patchObj);
    }
  }

  async function handleLockedChange(_: unknown, isChecked: boolean) {
    const patchObj = {
      metadata: {
        labels: {
          [`${DEMO_DOMAIN}/lock-enabled`]: String(isChecked),
        },
      },
    };
    onWorkshopUpdate(
      await patchWorkshop({
        name: workshop.metadata.name,
        namespace: workshop.metadata.namespace,
        patch: patchObj,
      }),
    );
  }

  useEffect(() => {
    setOpsEffort(opsEffortFromAnnotation);
  }, [opsEffortFromAnnotation]);

  useEffect(() => {
    if (debouncedOpsEffort !== opsEffortFromAnnotation) {
      const opsEffortValue =
        typeof debouncedOpsEffort === 'number' ? debouncedOpsEffort : Number(debouncedOpsEffort) || 0;
      const patchObj = {
        metadata: {
          annotations: {
            [`${DEMO_DOMAIN}/ops-effort`]: String(opsEffortValue),
          },
        },
      };
      patchWorkshop({
        name: workshop.metadata.name,
        namespace: workshop.metadata.namespace,
        patch: patchObj,
      }).then((updatedWorkshop) => {
        onWorkshopUpdate(updatedWorkshop);
      });
    }
  }, [
    debouncedOpsEffort,
    opsEffortFromAnnotation,
    workshop.metadata.name,
    workshop.metadata.namespace,
    onWorkshopUpdate,
  ]);

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
              <>
                <span className="services-item__status--scheduled" key="scheduled">
                  <CheckCircleIcon key="scheduled-icon" /> Scheduled
                </span>
                {resourceClaims.length > 0 ? <WorkshopStatus resourceClaims={resourceClaims} /> : null}
              </>
            ) : resourceClaims.length > 0 ? (
              <WorkshopStatus resourceClaims={resourceClaims} />
            ) : (
              <p>...</p>
            )}
          </DescriptionListDescription>
        </DescriptionListGroup>
      ) : null}

      <DescriptionListGroup>
        <DescriptionListTerm>Amount spent</DescriptionListTerm>
        <DescriptionListDescription>
          {usageCost?.total_cost ? (
            <p>
              <CurrencyAmount amount={usageCost.total_cost} />{' '}
              <span className="services-item__estimated-cost-label">
                (Last update <TimeInterval toTimestamp={usageCost.last_update} />)
              </span>
            </p>
          ) : (
            'No data available'
          )}
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
            isLocked={isLocked}
          />
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>User Registration</DescriptionListTerm>
        <DescriptionListDescription>
          <Select
            isOpen={userRegistrationSelectIsOpen}
            onSelect={(_event, selected) => {
              const selectedValue = typeof selected === 'string' ? selected : selected.toString();
              patchWorkshopSpec({ openRegistration: selectedValue === 'open' }).then(() =>
                setUserRegistrationSelectIsOpen(false),
              );
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
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--pf-t--global--spacer--md)',
                alignItems: 'flex-start',
              }}
            >
              {/* Provisioning Date first, then Ready by */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--pf-t--global--spacer--lg)' }}>
                {/* Provisioning Date */}
                <FormGroup fieldId="workshopProvisioningDate" isRequired label="Provisioning Date">
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 'var(--pf-t--global--spacer--md)',
                    }}
                  >
                    <AutoStopDestroy
                      type="auto-start"
                      variant="extended"
                      onClick={() => (showModal ? showModal({ resourceClaims: [], action: 'scheduleStart' }) : null)}
                      className="workshops-item__schedule-btn"
                      isDisabled={!showModal || useDirectProvisioningDate}
                      time={autoStartTime}
                    />
                    <Tooltip position="right" content={<p>Select when you want the workshop provisioning to start.</p>}>
                      <OutlinedQuestionCircleIcon
                        aria-label="Select when you want the workshop provisioning to start."
                        className="tooltip-icon-only"
                      />
                    </Tooltip>
                  </div>

                  {/* Provisioning Mode Toggle */}
                  {isAdmin && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--pf-t--global--spacer--sm)',
                        marginTop: 'var(--pf-t--global--spacer--md)',
                      }}
                    >
                      <Switch
                        id="provisioning-mode-switch"
                        aria-label="Set ready by date"
                        label={
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            Set ready by date
                            <BetaBadge />
                          </div>
                        }
                        isChecked={useDirectProvisioningDate}
                        hasCheckIcon
                        onChange={(_event, isChecked) => {
                          setUseDirectProvisioningDate(isChecked);
                        }}
                      />
                      <Tooltip
                        position="right"
                        content={
                          <p>
                            When enabled, allows you to specify when the workshop should be ready by (8 hours after
                            provisioning starts).
                          </p>
                        }
                      >
                        <OutlinedQuestionCircleIcon
                          aria-label="When enabled, allows you to specify when the workshop should be ready by."
                          className="tooltip-icon-only"
                        />
                      </Tooltip>
                    </div>
                  )}
                </FormGroup>

                {/* Ready by Date - Only show when switch is enabled and user is admin */}
                {isAdmin && useDirectProvisioningDate && (
                  <FormGroup fieldId="workshopReadyByDate" label="Ready by">
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 'var(--pf-t--global--spacer--md)',
                      }}
                    >
                      <AutoStopDestroy
                        type="auto-start"
                        variant="extended"
                        onClick={() => {
                          if (showModal) {
                            showModal({ resourceClaims: [], action: 'scheduleStartDate' });
                          }
                        }}
                        className="workshops-item__schedule-btn"
                        isDisabled={!showModal}
                        time={autoStartTime + 8 * 60 * 60 * 1000} // Show ready by date as 8 hours after provisioning
                      />
                      <Tooltip
                        position="right"
                        content={
                          <p>
                            Select when you&apos;d like the workshop to be ready. Provisioning will automatically begin
                            8 hours before this time.
                          </p>
                        }
                      >
                        <OutlinedQuestionCircleIcon
                          aria-label="Select when you'd like the workshop to be ready. Provisioning will automatically begin 8 hours before this time."
                          className="tooltip-icon-only"
                        />
                      </Tooltip>
                    </div>
                  </FormGroup>
                )}
              </div>
            </div>
          </DescriptionListDescription>
        </DescriptionListGroup>
      ) : null}

      {checkWorkshopCanStop(resourceClaims) || (autoStartTime && autoStartTime > Date.now()) ? (
        <DescriptionListGroup>
          <DescriptionListTerm>Auto-Stop</DescriptionListTerm>
          <DescriptionListDescription>
            <AutoStopDestroy
              type="auto-stop"
              onClick={() => (showModal && !isLocked ? showModal({ action: 'scheduleStop', resourceClaims }) : null)}
              isDisabled={isLocked || !showModal}
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
                if (showModal && !isLocked) {
                  showModal({ resourceClaims, action: 'scheduleDelete' });
                }
              }}
              time={autoDestroyTime}
              isDisabled={isLocked || !showModal}
              variant="extended"
              className="workshops-item__schedule-btn"
              notDefinedMessage="- Not defined -"
            />
          </DescriptionListDescription>
        </DescriptionListGroup>
      ) : null}

      {workshopProvisions.length > 0 && sfdc_enabled ? (
        <DescriptionListGroup>
          <DescriptionListTerm>Salesforce IDs</DescriptionListTerm>
          <DescriptionListDescription>
            <SalesforceItemsList
              items={JSON.parse(workshopProvisions[0].spec.parameters?.['salesforce_items'] || '[]')}
            />
            <Button
              variant="link"
              icon={<PlusCircleIcon />}
              onClick={() => setModalEditSalesforce(true)}
              style={{ alignSelf: 'flex-start' }}
            >
              Add Salesforce IDs
            </Button>
          </DescriptionListDescription>
        </DescriptionListGroup>
      ): null}

      {isAdmin ? (
        <DescriptionListGroup className="workshops-item-details__admin-section">
          <DescriptionListTerm>Admin Settings</DescriptionListTerm>
          <DescriptionListDescription className="workshops-item-details__admin-description">
            <div className="workshops-item-details__admin-fields">
              <div className="workshops-item-details__admin-field">
                <Switch
                  id="white-glove-switch"
                  aria-label="White-Glove Support"
                  label="White-Glove Support (for admins to tick when giving a white gloved experience)"
                  isChecked={whiteGloved}
                  hasCheckIcon
                  onChange={handleWhiteGloveChange}
                />
              </div>
              <div className="workshops-item-details__admin-field">
                <div className="workshops-item-details__group-control--single" style={{ maxWidth: 350 }}>
                  <label htmlFor="ops-effort-input">
                    Ops Effort
                  </label>
                  <NumberInput
                    id="ops-effort-input"
                    aria-label="Ops Effort"
                    min={0}
                    value={opsEffort}
                    onMinus={() => {
                      const newValue = Math.max(0, (typeof opsEffort === 'number' ? opsEffort : 0) - 1);
                      setOpsEffort(newValue);
                    }}
                    onPlus={() => {
                      const newValue = (typeof opsEffort === 'number' ? opsEffort : 0) + 1;
                      setOpsEffort(newValue);
                    }}
                    onChange={(event: React.FormEvent<HTMLInputElement>) => {
                      const inputValue = event.currentTarget.value;
                      const value = inputValue === '' ? 0 : parseInt(inputValue, 10);
                      if (!isNaN(value) && value >= 0) {
                        setOpsEffort(value);
                      }
                    }}
                  />
                  <Tooltip position="right" content={<div>Operations effort value for this workshop.</div>}>
                    <OutlinedQuestionCircleIcon
                      aria-label="Operations effort value for this workshop."
                      className="tooltip-icon-only"
                    />
                  </Tooltip>
                </div>
              </div>
            </div>
            <div
              className="workshops-item-details__admin-field"
              style={{ marginTop: 'var(--pf-t--global--spacer--md)' }}
            >
              <Switch
                id="lock-switch"
                aria-label="Locked"
                label="Locked"
                isChecked={isWorkshopLocked(workshop)}
                hasCheckIcon
                onChange={handleLockedChange}
              />
            </div>
          </DescriptionListDescription>
        </DescriptionListGroup>
      ) : null}

      {workshopProvisions.length > 0 && (
        <SalesforceItemsEditModal
          isOpen={modalEditSalesforce}
          onClose={() => setModalEditSalesforce(false)}
          items={JSON.parse(workshopProvisions[0].spec.parameters?.['salesforce_items'] || '[]')}
          onSave={async (next) => {
            await patchWorkshop({
              name: workshop.metadata.name,
              namespace: workshop.metadata.namespace,
              patch: {
                metadata: {
                  annotations: {
                    ...workshop.metadata.annotations,
                    'demo.redhat.com/salesforce-items': JSON.stringify(next),
                  },
                },
              },
            });
            for (let wp of workshopProvisions) {
              await patchWorkshopProvisionSpec(wp.metadata.name, wp.metadata.namespace, {
                parameters: {
                  ...wp.spec.parameters,
                  salesforce_items: JSON.stringify(next),
                },
              });
            }
            if (!resourceClaims || resourceClaims.length === 0) return;
            for (let rc of resourceClaims) {
              const annotations = { ...rc.metadata.annotations };
              setSalesforceItemsAnno(annotations, next);
              await patchResourceClaim(rc.metadata.namespace, rc.metadata.name, { metadata: { annotations } });
            }
          }}
          isAdmin={isAdmin}
        />
      )}
    </DescriptionList>
  );
};

export default WorkshopsItemDetails;
