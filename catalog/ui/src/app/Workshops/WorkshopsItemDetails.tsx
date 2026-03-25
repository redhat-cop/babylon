import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
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
  Popover,
  Label,
  LabelGroup,
  Alert,
  TextInput,
} from '@patternfly/react-core';
import { Select, SelectOption, SelectList, Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core';
import CheckCircleIcon from '@patternfly/react-icons/dist/js/icons/check-circle-icon';
import OutlinedQuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/outlined-question-circle-icon';
import {
  apiPaths,
  patchResourceClaim,
  patchWorkshop,
  patchWorkshopProvision,
  createServiceAccessConfig,
  patchServiceAccessConfig,
  deleteServiceAccessConfig,
  optionalFetcher,
  FORBIDDEN_RESPONSE,
} from '@app/api';
import { RequestUsageCost, ResourceClaim, ServiceAccessConfig, Workshop, WorkshopProvision, WorkshopUserAssignment } from '@app/types';
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
  isWorkshopStarted,
} from './workshops-utils';
import { ModalState } from './WorkshopsItem';
import WorkshopStatus from './WorkshopStatus';
import useSWR, { useSWRConfig } from 'swr';
import CurrencyAmount from '@app/components/CurrencyAmount';
import TimeInterval from '@app/components/TimeInterval';
import { PlusCircleIcon } from '@patternfly/react-icons';
import useDebounceState from '@app/utils/useDebounceState';
import useInterfaceConfig from '@app/utils/useInterfaceConfig';

import ResourcePoolSelector from '@app/components/ResourcePoolSelector';

import './workshops-item-details.css';

const WorkshopsItemDetails: React.FC<{
  onWorkshopUpdate: (workshop: Workshop) => void;
  workshop: Workshop;
  resourceClaims?: ResourceClaim[];
  workshopProvisions?: WorkshopProvision[];
  workshopUserAssignments?: WorkshopUserAssignment[];
  showModal?: ({ action, resourceClaims }: ModalState) => void;
  usageCost?: RequestUsageCost;
  highlightAutoDestroy?: boolean;
  onHighlightAutoDestroyComplete?: () => void;
}> = ({
  onWorkshopUpdate,
  workshopProvisions = [],
  resourceClaims,
  workshop,
  showModal,
  workshopUserAssignments,
  usageCost,
  highlightAutoDestroy,
  onHighlightAutoDestroyComplete,
}) => {
  const { isAdmin, serviceNamespaces: sessionServiceNamespaces } = useSession().getSession();
  const { sfdc_enabled } = useInterfaceConfig();
  const { cache } = useSWRConfig();
  const whiteGloved = getWhiteGloved(workshop);
  const isLocked = isWorkshopLocked(workshop);
  const belongsToMultiWorkshop = !!workshop.metadata.labels?.[`${BABYLON_DOMAIN}/multiworkshop`];
  const debouncedPatchWorkshop = useDebounce(patchWorkshop, 1000) as (...args: unknown[]) => Promise<Workshop>;
  const userRegistrationValue = workshop.spec.openRegistration === false ? 'pre' : 'open';
  const workshopId = workshop.metadata.labels?.[`${BABYLON_DOMAIN}/workshop-id`];
  const [userRegistrationSelectIsOpen, setUserRegistrationSelectIsOpen] = useState(false);
  const readyByDate = workshop.spec?.lifespan?.readyBy;
  const [modalEditSalesforce, setModalEditSalesforce] = useState(false);
  const [modalAddServiceAccess, setModalAddServiceAccess] = useState(false);
  const [newServiceAccessEmail, setNewServiceAccessEmail] = useState('');
  const opsEffortAnnotation = workshop.metadata.annotations?.[`${DEMO_DOMAIN}/ops-effort`];
  const multiworkshopSource = workshop.metadata.annotations?.[`${BABYLON_DOMAIN}/multiworkshop-source`];
  
  const {
    data: serviceAccessConfigResponse,
    isLoading: serviceAccessLoading,
    mutate: mutateServiceAccessConfig,
  } = useSWR<ServiceAccessConfig | typeof FORBIDDEN_RESPONSE | null>(
    sessionServiceNamespaces.some((ns) => ns.name === workshop.metadata.namespace) ? apiPaths.SERVICE_ACCESS_CONFIG({
      namespace: workshop.metadata.namespace,
      name: workshop.metadata.name,
    }) : null,
    optionalFetcher,
  );
  const canManageCollaborators = (sessionServiceNamespaces.some((ns) => ns.name === workshop.metadata.namespace) && serviceAccessConfigResponse !== FORBIDDEN_RESPONSE) || isAdmin;
  const serviceAccessConfig = canManageCollaborators ? serviceAccessConfigResponse as ServiceAccessConfig | null : null;

  const serviceAccessUsers = useMemo(() => {
    if (!serviceAccessConfig?.spec?.users) return [];
    return serviceAccessConfig.spec.users.map((u) => u.name);
  }, [serviceAccessConfig]);
  const opsEffortFromAnnotation = useMemo(() => parseInt(opsEffortAnnotation || '0', 10) || 0, [opsEffortAnnotation]);
  const [opsEffort, setOpsEffort] = useState<number>(opsEffortFromAnnotation);
  const debouncedOpsEffort = useDebounceState(opsEffort, 1000);
  const resourcePoolAnnotation = workshop.metadata.annotations?.['poolboy.gpte.redhat.com/resource-pool-name'];
  const resourcePoolFromProvision = workshopProvisions?.[0]?.spec?.resourcePool;
  const selectedResourcePool = resourcePoolAnnotation ?? resourcePoolFromProvision;

  const { start: autoStartTime, end: autoDestroyTime } = getWorkshopLifespan(workshop, workshopProvisions);
  const autoStopTime = getWorkshopAutoStopTime(workshop, resourceClaims);

  // Ref for auto-destroy section to scroll and highlight
  const autoDestroyRef = useRef<HTMLDivElement>(null);
  const [autoDestroyHighlighted, setAutoDestroyHighlighted] = useState(false);

  // Handle highlighting auto-destroy section when triggered from parent
  useEffect(() => {
    if (highlightAutoDestroy && autoDestroyRef.current) {
      // Scroll to auto-destroy section
      autoDestroyRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Add highlight effect
      setAutoDestroyHighlighted(true);
      // Remove highlight after animation and notify parent
      const timer = setTimeout(() => {
        setAutoDestroyHighlighted(false);
        onHighlightAutoDestroyComplete?.();
      }, 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [highlightAutoDestroy, onHighlightAutoDestroyComplete]);

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

  async function handleResourcePoolChange(poolName: string | undefined) {
    const patchObj = {
      metadata: {
        annotations: {
          'poolboy.gpte.redhat.com/resource-pool-name': poolName || null,
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

  async function handleAddServiceAccessUser() {
    const email = newServiceAccessEmail.trim();
    if (!email) return;
    
    const updatedUsers = [...serviceAccessUsers, email];
    
    try {
      if (serviceAccessConfig) {
        const updatedConfig = await patchServiceAccessConfig({
          name: workshop.metadata.name,
          namespace: workshop.metadata.namespace,
          users: updatedUsers,
        });
        mutateServiceAccessConfig(updatedConfig);
      } else {
        const newConfig = await createServiceAccessConfig({
          name: workshop.metadata.name,
          namespace: workshop.metadata.namespace,
          serviceName: workshop.metadata.name,
          serviceNamespace: workshop.metadata.namespace,
          serviceKind: 'Workshop',
          users: updatedUsers,
        });
        mutateServiceAccessConfig(newConfig);
      }
    } catch (error) {
      console.error('Failed to update ServiceAccessConfig:', error);
    }
    
    setNewServiceAccessEmail('');
    setModalAddServiceAccess(false);
  }

  async function handleRemoveServiceAccessUser(emailToRemove: string) {
    const updatedUsers = serviceAccessUsers.filter((email: string) => email !== emailToRemove);
    
    try {
      if (updatedUsers.length === 0) {
        await deleteServiceAccessConfig({
          name: workshop.metadata.name,
          namespace: workshop.metadata.namespace,
        });
        mutateServiceAccessConfig(null);
      } else {
        const updatedConfig = await patchServiceAccessConfig({
          name: workshop.metadata.name,
          namespace: workshop.metadata.namespace,
          users: updatedUsers,
        });
        mutateServiceAccessConfig(updatedConfig);
      }
    } catch (error) {
      console.error('Failed to update ServiceAccessConfig:', error);
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
      {multiworkshopSource ? (
        <DescriptionListGroup>
          <DescriptionListTerm>Multi Asset Workshop</DescriptionListTerm>
          <DescriptionListDescription>
            <Link to={`/multi-workshop/${workshop.metadata.namespace}/${multiworkshopSource}`}>
              {multiworkshopSource}
            </Link>
          </DescriptionListDescription>
        </DescriptionListGroup>
      ) : null}
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
        <DescriptionListTerm>
          Amount spent{' '}
          <Popover
            triggerAction="hover"
            headerContent="How is Amount spent calculated?"
            bodyContent={
              <div>
                <p>
                  Amount spent represents an estimated cost based on the cloud provider and service backing this
                  environment. Cost calculations follow provider-specific models and are updated once per day.
                </p>
                <p>
                  <strong>Cost models by provider and service</strong>
                </p>
                <p>
                  <strong>AWS and Azure</strong>
                  <br />
                  Costs are sourced directly from the cloud account or subscription and accrue from provisioning to
                  deletion of resources.
                </p>
                <p>
                  <strong>OpenShift CNV</strong>
                  <br />
                  Costs are calculated using a fixed hourly price list, based on project usage, and accrue from
                  provisioning to deletion.
                </p>
                <p>
                  <strong>GCP</strong>
                  <br />
                  Costs are sourced directly from the associated GCP project.
                </p>
                <p>
                  The amount shown is the total accumulated cost, starting from the provision start date and time,
                  including any initial provisioning or pool-related resources.
                </p>
              </div>
            }
          >
            <OutlinedQuestionCircleIcon
              aria-label="Amount spent calculation information"
              className="tooltip-icon-only"
              style={{ cursor: 'pointer' }}
            />
          </Popover>
        </DescriptionListTerm>
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

      {canManageCollaborators ? (
        <DescriptionListGroup>
          <DescriptionListTerm>
            Share service{' '}
            <Tooltip position="right" content={<p>Users who have access to this workshop service.</p>}>
              <OutlinedQuestionCircleIcon
                aria-label="Users who have access to this workshop service."
                className="tooltip-icon-only"
              />
            </Tooltip>
          </DescriptionListTerm>
          <DescriptionListDescription>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--pf-t--global--spacer--sm)' }}>
              {serviceAccessLoading ? (
                <LoadingIcon />
              ) : serviceAccessUsers.length > 0 ? (
                <LabelGroup>
                  {serviceAccessUsers.map((email: string) => (
                    <Label
                      key={email}
                      onClose={() => handleRemoveServiceAccessUser(email)}
                      closeBtnAriaLabel={`Remove ${email}`}
                    >
                      {email}
                    </Label>
                  ))}
                </LabelGroup>
              ) : (
                <span style={{ color: 'var(--pf-t--global--color--nonstatus--gray--default)' }}>No users configured</span>
              )}
              <Button
                variant="link"
                icon={<PlusCircleIcon />}
                onClick={() => setModalAddServiceAccess(true)}
                style={{ alignSelf: 'flex-start', paddingLeft: 0 }}
              >
                Share service
              </Button>
            </div>
          </DescriptionListDescription>
        </DescriptionListGroup>
      ) : null}

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
                      onClick={() => (showModal && !isLocked ? showModal({ resourceClaims: [], action: 'scheduleStart' }) : null)}
                      className="workshops-item__schedule-btn"
                      isDisabled={isLocked || !showModal}
                      time={autoStartTime}
                    />
                    <Tooltip position="right" content={<p>Select when you want the workshop provisioning to start.</p>}>
                      <OutlinedQuestionCircleIcon
                        aria-label="Select when you want the workshop provisioning to start."
                        className="tooltip-icon-only"
                      />
                    </Tooltip>
                  </div>
                </FormGroup>

                {/* Ready by Date - Only show when ready by date is set and user is admin */}
                {isAdmin && readyByDate && (
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
                          if (showModal && !isLocked) {
                            showModal({ resourceClaims: [], action: 'scheduleReadyByDate' });
                          }
                        }}
                        className="workshops-item__schedule-btn"
                        isDisabled={isLocked || !showModal}
                        time={readyByDate} // Show ready by date as 8 hours after provisioning
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
        <div ref={autoDestroyRef}>
          <DescriptionListGroup className={autoDestroyHighlighted ? 'workshops-item-details__highlight' : ''}>
            <DescriptionListTerm>
              Auto-Destroy{' '}
              {!isWorkshopStarted(workshop, workshopProvisions) && (
                <Tooltip 
                  content="The auto-destroy date is automatically adjusted when the start date changes to maintain the workshop lifespan."
                  isVisible={autoDestroyHighlighted}
                >
                  <OutlinedQuestionCircleIcon className="workshops-item-details__info-icon" />
                </Tooltip>
              )}
            </DescriptionListTerm>
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
        </div>
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
                aria-label={belongsToMultiWorkshop ? 'Use Multi Asset Workshop settings' : 'Locked'}
                label={belongsToMultiWorkshop ? 'Use Multi Asset Workshop settings' : 'Locked'}
                isChecked={isWorkshopLocked(workshop)}
                hasCheckIcon
                onChange={handleLockedChange}
              />
              {belongsToMultiWorkshop && (
                <Tooltip position="right" content={<p>When enabled, the start, stop, and destroy dates will be determined by the Multi Asset Workshop parameters.</p>}>
                  <OutlinedQuestionCircleIcon
                    aria-label="Multi Asset Workshop settings information"
                    className="tooltip-icon-only"
                    style={{ marginLeft: 'var(--pf-t--global--spacer--sm)' }}
                  />
                </Tooltip>
              )}
            </div>
            <div
              className="workshops-item-details__admin-field"
              style={{ marginTop: 'var(--pf-t--global--spacer--md)' }}
            >
              <div className="workshops-item-details__group-control--single" style={{ maxWidth: 350 }}>
                <label htmlFor="resource-pool-selector">Resource Pool</label>
                <ResourcePoolSelector
                  disableAutoSelect
                  selectedPool={selectedResourcePool}
                  onSelect={handleResourcePoolChange}
                />
                <Tooltip
                  position="right"
                  content={<p>Select a specific resource pool for this workshop.</p>}
                >
                  <OutlinedQuestionCircleIcon
                    aria-label="Select a specific resource pool for this workshop"
                    className="tooltip-icon-only"
                  />
                </Tooltip>
              </div>
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

      <Modal
        variant="small"
        isOpen={modalAddServiceAccess}
        onClose={() => {
          setModalAddServiceAccess(false);
          setNewServiceAccessEmail('');
        }}
        aria-label="Share service"
      >
        <ModalHeader title="Share service" />
        <ModalBody>
          <Alert variant="info" isInline isPlain title="By adding a user's email, they will gain access to manage this workshop. Please use the email address associated with their account on the Demo platform." />
          <FormGroup label="Email address" isRequired fieldId="service-access-email">
            <TextInput
              id="service-access-email"
              type="email"
              value={newServiceAccessEmail}
              onChange={(_event, value) => setNewServiceAccessEmail(value)}
              placeholder="user@example.com"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newServiceAccessEmail.trim()) {
                  handleAddServiceAccessUser();
                }
              }}
            />
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button
            key="add"
            variant="primary"
            onClick={handleAddServiceAccessUser}
            isDisabled={!newServiceAccessEmail.trim()}
          >
            Add
          </Button>
          <Button
            key="cancel"
            variant="link"
            onClick={() => {
              setModalAddServiceAccess(false);
              setNewServiceAccessEmail('');
            }}
          >
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </DescriptionList>
  );
};

export default WorkshopsItemDetails;
