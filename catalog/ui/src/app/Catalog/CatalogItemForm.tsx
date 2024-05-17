import React, { useEffect, useMemo, useReducer, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import parseDuration from 'parse-duration';
import { EditorState } from 'lexical/LexicalEditorState';
import { LexicalEditor } from 'lexical/LexicalEditor';
import { $generateHtmlFromNodes } from '@lexical/html';
import {
  ActionList,
  ActionListItem,
  Alert,
  AlertGroup,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Form,
  FormGroup,
  FormHelperText,
  PageSection,
  PageSectionVariants,
  Select,
  SelectOption,
  SelectVariant,
  Switch,
  TextInput,
  Title,
  Tooltip,
} from '@patternfly/react-core';
import OutlinedQuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/outlined-question-circle-icon';
import ExclamationCircleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-circle-icon';
import OutlinedCalendarAltIcon from '@patternfly/react-icons/dist/js/icons/outlined-calendar-alt-icon';
import useSWRImmutable from 'swr/immutable';
import {
  apiFetch,
  apiPaths,
  createServiceRequest,
  CreateServiceRequestParameterValues,
  createWorkshop,
  createWorkshopProvision,
  fetcher,
  openWorkshopSupportTicket,
} from '@app/api';
import { CatalogItem, TPurposeOpts } from '@app/types';
import { displayName, isLabDeveloper, randomString } from '@app/util';
import Editor from '@app/components/Editor/Editor';
import useSession from '@app/utils/useSession';
import useDebounce from '@app/utils/useDebounce';
import PatientNumberInput from '@app/components/PatientNumberInput';
import DynamicFormInput from '@app/components/DynamicFormInput';
import ActivityPurposeSelector from '@app/components/ActivityPurposeSelector';
import ProjectSelector from '@app/components/ProjectSelector';
import TermsOfService from '@app/components/TermsOfService';
import { reduceFormState, checkEnableSubmit, checkConditionsInFormState } from './CatalogItemFormReducer';
import AutoStopDestroy from '@app/components/AutoStopDestroy';
import CatalogItemFormAutoStopDestroyModal, { TDates, TDatesTypes } from './CatalogItemFormAutoStopDestroyModal';
import { formatCurrency, getEstimatedCost, isAutoStopDisabled } from './catalog-utils';
import ErrorBoundaryPage from '@app/components/ErrorBoundaryPage';
import useImpersonateUser from '@app/utils/useImpersonateUser';

import './catalog-item-form.css';

const CatalogItemFormData: React.FC<{ catalogItemName: string; catalogNamespaceName: string }> = ({
  catalogItemName,
  catalogNamespaceName,
}) => {
  const navigate = useNavigate();
  const debouncedApiFetch = useDebounce(apiFetch, 1000);
  const [autoStopDestroyModal, openAutoStopDestroyModal] = useState<TDatesTypes>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { isAdmin, groups, roles, serviceNamespaces, userNamespace, email } = useSession().getSession();
  const { userImpersonated } = useImpersonateUser();
  let userEmail = email;
  if (userImpersonated) {
    userEmail = userImpersonated;
  }
  const { data: catalogItem } = useSWRImmutable<CatalogItem>(
    apiPaths.CATALOG_ITEM({ namespace: catalogNamespaceName, name: catalogItemName }),
    fetcher
  );
  const _displayName = displayName(catalogItem);
  const estimatedCost = useMemo(() => getEstimatedCost(catalogItem), []);
  const [userRegistrationSelectIsOpen, setUserRegistrationSelectIsOpen] = useState(false);
  const workshopInitialProps = useMemo(
    () => ({
      userRegistration: 'open',
      accessPassword: randomString(8),
      description: '<p></p>',
      displayName: _displayName,
      provisionCount: 1,
      provisionConcurrency: catalogItem.spec.multiuser ? 1 : 10,
      provisionStartDelay: 30,
    }),
    [catalogItem]
  );
  const purposeOpts: TPurposeOpts = catalogItem.spec.parameters
    ? catalogItem.spec.parameters.find((p) => p.name === 'purpose')?.openAPIV3Schema['x-form-options'] || []
    : [];
  const workshopUiDisabled = catalogItem.spec.workshopUiDisabled || false;
  const [formState, dispatchFormState] = useReducer(
    reduceFormState,
    reduceFormState(null, {
      type: 'init',
      catalogItem,
      serviceNamespace: userNamespace,
      user: { groups, roles, isAdmin },
      purposeOpts,
    })
  );
  let maxAutoDestroyTime = Math.min(
    parseDuration(catalogItem.spec.lifespan?.maximum),
    parseDuration(catalogItem.spec.lifespan?.relativeMaximum)
  );
  let maxAutoStopTime = parseDuration(catalogItem.spec.runtime?.maximum);
  if (formState.parameters['open_environment']?.value === true) {
    maxAutoDestroyTime = parseDuration('365d');
    maxAutoStopTime = maxAutoDestroyTime;
  }
  const purposeObj =
    purposeOpts.length > 0 ? purposeOpts.find((p) => formState.purpose && formState.purpose.startsWith(p.name)) : null;
  const submitRequestEnabled = checkEnableSubmit(formState) && !isLoading;

  useEffect(() => {
    if (!formState.conditionChecks.completed) {
      checkConditionsInFormState(formState, dispatchFormState, debouncedApiFetch);
    }
  }, [dispatchFormState, formState, debouncedApiFetch]);

  async function submitRequest(
    {
      scheduled,
    }: {
      scheduled: { startDate: Date; endDate: Date; stopDate: Date; createTicket?: boolean };
    } = { scheduled: null }
  ): Promise<void> {
    if (!submitRequestEnabled) {
      throw new Error('submitRequest called when submission should be disabled!');
    }
    if (isLoading) {
      return null;
    }
    setIsLoading(true);
    const parameterValues: CreateServiceRequestParameterValues = {};
    for (const parameterState of Object.values(formState.parameters)) {
      // Add parameters for request that have values and are not disabled or hidden
      if (
        parameterState.value !== undefined &&
        !parameterState.isDisabled &&
        !parameterState.isHidden &&
        !(parameterState.value === '' && !parameterState.isRequired)
      ) {
        parameterValues[parameterState.name] = parameterState.value;
      }
    }
    parameterValues['purpose'] = formState.purpose;
    parameterValues['purpose_activity'] = formState.activity;
    parameterValues['purpose_explanation'] = formState.explanation;
    if (formState.salesforceId.value) {
      parameterValues['salesforce_id'] = formState.salesforceId.value;
    }

    if (formState.workshop) {
      const {
        accessPassword,
        description,
        displayName,
        userRegistration,
        provisionConcurrency,
        provisionCount,
        provisionStartDelay,
      } = formState.workshop;
      const workshop = await createWorkshop({
        accessPassword,
        description,
        displayName,
        catalogItem: catalogItem,
        openRegistration: userRegistration === 'open',
        serviceNamespace: formState.serviceNamespace,
        ...(scheduled !== null ? { stopDate: scheduled.stopDate } : { stopDate: formState.stopDate }),
        ...(scheduled !== null ? { endDate: scheduled.endDate } : { endDate: formState.endDate }),
        ...(scheduled !== null ? { startDate: scheduled.startDate } : {}),
      });
      const redirectUrl = `/workshops/${workshop.metadata.namespace}/${workshop.metadata.name}`;
      await createWorkshopProvision({
        catalogItem: catalogItem,
        concurrency: provisionConcurrency,
        count: provisionCount,
        parameters: parameterValues,
        startDelay: provisionStartDelay,
        workshop: workshop,
      });
      if (scheduled !== null) {
        try {
          if (scheduled.createTicket) {
            await openWorkshopSupportTicket(workshop, {
              number_of_attendees: provisionCount,
              sfdc: formState.salesforceId.value,
              name: catalogItemName,
              event_name: displayName,
              url: `${window.location.origin}${redirectUrl}`,
              start_date: scheduled.startDate,
              end_date: scheduled.endDate,
              email: userEmail,
            });
          }
        } catch {}
      }
      navigate(redirectUrl);
    } else {
      const resourceClaim = await createServiceRequest({
        catalogItem,
        catalogNamespaceName: catalogNamespaceName,
        groups,
        isAdmin,
        parameterValues,
        serviceNamespace: formState.serviceNamespace,
        usePoolIfAvailable: formState.usePoolIfAvailable,
        useAutoDetach: formState.useAutoDetach,
        stopDate: formState.stopDate,
        endDate: formState.endDate,
        ...(scheduled !== null
          ? {
              start: {
                date: formState.startDate,
                type: 'resource',
                autoStop: new Date(
                  scheduled.startDate.getTime() + parseDuration(catalogItem.spec.runtime?.default || '4h')
                ),
              },
            }
          : {}),
      });

      navigate(`/services/${resourceClaim.metadata.namespace}/${resourceClaim.metadata.name}`);
    }
    setIsLoading(false);
  }

  if (catalogItem.spec.externalUrl) {
    window.open(catalogItem.spec.externalUrl);
    return null;
  }
  
  return (
    <PageSection variant={PageSectionVariants.light} className="catalog-item-form">
      <CatalogItemFormAutoStopDestroyModal
        type={autoStopDestroyModal}
        autoStopDate={formState.stopDate}
        autoDestroyDate={formState.endDate}
        autoStartDate={formState.startDate}
        isAutoStopDisabled={isAutoStopDisabled(catalogItem)}
        maxStartTimestamp={!!formState.workshop || !catalogItem.spec.lifespan ? null : Date.now() + maxAutoDestroyTime}
        maxRuntimeTimestamp={isAdmin ? maxAutoDestroyTime : maxAutoStopTime}
        defaultRuntimeTimestamp={
          new Date(Date.now() + parseDuration(catalogItem.spec.runtime?.default)) > formState.endDate
            ? parseDuration('4h')
            : parseDuration(catalogItem.spec.runtime?.default)
        }
        maxDestroyTimestamp={maxAutoDestroyTime}
        isWorkshopEnabled={!!formState.workshop}
        onConfirm={(dates: TDates) =>
          autoStopDestroyModal === 'schedule'
            ? submitRequest({
                scheduled: {
                  startDate: dates.startDate,
                  stopDate: dates.stopDate,
                  endDate: dates.endDate,
                  createTicket: dates.createTicket,
                },
              })
            : autoStopDestroyModal === 'auto-destroy'
            ? dispatchFormState({ type: 'dates', endDate: dates.endDate })
            : autoStopDestroyModal === 'auto-stop'
            ? dispatchFormState({ type: 'dates', stopDate: dates.stopDate })
            : null
        }
        onClose={() => openAutoStopDestroyModal(null)}
        title={_displayName}
      />
      <Breadcrumb>
        <BreadcrumbItem
          render={({ className }) => (
            <Link to="/catalog" className={className}>
              Catalog
            </Link>
          )}
        />
        <BreadcrumbItem
          render={({ className }) => (
            <Link
              to={`/catalog?item=${catalogItem.metadata.namespace}/${catalogItem.metadata.name}`}
              className={className}
            >
              {_displayName}
            </Link>
          )}
        />
      </Breadcrumb>
      <Title headingLevel="h1" size="lg">
        Order {_displayName}
      </Title>
      <p>Order by completing the form. Default values may be provided.</p>
      {formState.error ? <p className="error">{formState.error}</p> : null}
      <Form className="catalog-item-form__form">
        {isAdmin || serviceNamespaces.length > 1 ? (
          <FormGroup key="service-namespace" fieldId="service-namespace" label="Create Request in Project">
            <ProjectSelector
              currentNamespaceName={formState.serviceNamespace.name}
              onSelect={(namespace) => {
                dispatchFormState({
                  type: 'serviceNamespace',
                  serviceNamespace: namespace,
                });
              }}
              isPlain={false}
              hideLabel={true}
            />{' '}
            <Tooltip position="right" content={<div>Create service request in specified project namespace.</div>}>
              <OutlinedQuestionCircleIcon
                aria-label="Create service request in specified project namespace."
                className="tooltip-icon-only"
              />
            </Tooltip>
          </FormGroup>
        ) : null}

        {purposeOpts.length > 0 ? (
          <>
            <ActivityPurposeSelector
              value={{ purpose: formState.purpose, activity: formState.activity }}
              purposeOpts={purposeOpts}
              onChange={(activity: string, purpose: string, explanation: string) => {
                dispatchFormState({
                  type: 'purpose',
                  activity,
                  purpose,
                  explanation,
                });
              }}
            />

            <FormGroup
              fieldId="salesforce_id"
              isRequired={formState.salesforceId.required}
              label={
                <span>
                  Salesforce ID{' '}
                  <span
                    style={{
                      fontSize: 'var(--pf-global--FontSize--xs)',
                      color: 'var(--pf-global--palette--black-600)',
                      fontStyle: 'italic',
                      fontWeight: 400,
                    }}
                  >
                    (Opportunity ID, Campaign ID or Project ID)
                  </span>
                </span>
              }
              helperTextInvalid={
                <FormHelperText icon={<ExclamationCircleIcon />} isError isHidden={false}>
                  {!formState.salesforceId.valid && formState.conditionChecks.completed
                    ? formState.salesforceId.message
                    : purposeObj && purposeObj.sfdcRequired
                    ? 'A valid Salesforce ID is required for the selected activity / purpose'
                    : null}
                </FormHelperText>
              }
              validated={
                formState.salesforceId.valid
                  ? 'success'
                  : formState.salesforceId.value &&
                    formState.salesforceId.required &&
                    formState.conditionChecks.completed
                  ? 'error'
                  : 'default'
              }
            >
              <div className="catalog-item-form__group-control--single">
                <TextInput
                  type="text"
                  key="salesforce_id"
                  id="salesforce_id"
                  onChange={(value) =>
                    dispatchFormState({
                      type: 'salesforceId',
                      salesforceId: { ...formState.salesforceId, value, valid: false },
                    })
                  }
                  value={formState.salesforceId.value || ''}
                  validated={
                    formState.salesforceId.value && formState.salesforceId.valid
                      ? 'success'
                      : formState.salesforceId.value && formState.conditionChecks.completed
                      ? 'error'
                      : 'default'
                  }
                />
                <Tooltip position="right" content={<div>Salesforce Opportunity ID, Campaign ID or Project ID.</div>}>
                  <OutlinedQuestionCircleIcon
                    aria-label="Salesforce Opportunity ID, Campaign ID or Project ID."
                    className="tooltip-icon-only"
                  />
                </Tooltip>
              </div>
            </FormGroup>
          </>
        ) : null}
        {formState.formGroups.map((formGroup, formGroupIdx) => {
          // do not render form group if all parameters for formGroup are hidden
          if (formGroup.parameters.every((parameter) => parameter.isHidden)) {
            return null;
          }
          // check if there is an invalid parameter in the form group
          const invalidParameter = formGroup.parameters.find(
            (parameter) =>
              !parameter.isDisabled && (parameter.isValid === false || parameter.validationResult === false)
          );
          // status is error if found an invalid parameter
          // status is success if all form group parameters are validated.
          const status: 'default' | 'error' | 'success' | 'warning' = invalidParameter
            ? 'error'
            : formGroup.parameters.every((parameter) => parameter.isValid && parameter.validationResult)
            ? 'success'
            : 'default';

          return (
            <FormGroup
              key={formGroup.key}
              fieldId={formGroup.parameters.length === 1 ? `${formGroup.key}-${formGroupIdx}` : null}
              isRequired={formGroup.isRequired}
              label={formGroup.formGroupLabel}
              helperTextInvalid={
                invalidParameter?.validationMessage ? (
                  <FormHelperText
                    icon={<ExclamationCircleIcon />}
                    isError={status === 'error'}
                    isHidden={status !== 'error'}
                  >
                    {invalidParameter.validationMessage}
                  </FormHelperText>
                ) : null
              }
              validated={status}
            >
              {formGroup.parameters
                ? formGroup.parameters
                    .filter((p) => !p.isHidden)
                    .map((parameterState) => (
                      <div
                        className={`catalog-item-form__group-control--${
                          formGroup.parameters.length > 1 ? 'multi' : 'single'
                        }`}
                        key={parameterState.spec.name}
                      >
                        <DynamicFormInput
                          id={formGroup.parameters.length === 1 ? `${formGroup.key}-${formGroupIdx}` : null}
                          isDisabled={parameterState.isDisabled}
                          parameter={parameterState.spec}
                          validationResult={parameterState.validationResult}
                          value={parameterState.value}
                          onChange={(value: boolean | number | string, isValid = true) => {
                            dispatchFormState({
                              type: 'parameterUpdate',
                              parameter: { name: parameterState.spec.name, value, isValid },
                            });
                          }}
                        />
                        {parameterState.spec.description ? (
                          <Tooltip position="right" content={<div>{parameterState.spec.description}</div>}>
                            <OutlinedQuestionCircleIcon
                              aria-label={parameterState.spec.description}
                              className="tooltip-icon-only"
                            />
                          </Tooltip>
                        ) : null}
                      </div>
                    ))
                : null}
            </FormGroup>
          );
        })}

        {isAutoStopDisabled(catalogItem) ? null : (
          <FormGroup key="auto-stop" fieldId="auto-stop" label="Auto-stop">
            <div className="catalog-item-form__group-control--single">
              <AutoStopDestroy
                type="auto-stop"
                onClick={() => openAutoStopDestroyModal('auto-stop')}
                className="catalog-item-form__auto-stop-btn"
                time={formState.stopDate ? formState.stopDate.getTime() : null}
                variant="extended"
                destroyTimestamp={formState.endDate.getTime()}
              />
            </div>
          </FormGroup>
        )}

        <FormGroup key="auto-destroy" fieldId="auto-destroy" label="Auto-destroy">
          <div className="catalog-item-form__group-control--single">
            <AutoStopDestroy
              type="auto-destroy"
              onClick={() => openAutoStopDestroyModal('auto-destroy')}
              className="catalog-item-form__auto-destroy-btn"
              time={formState.endDate.getTime()}
              variant="extended"
              destroyTimestamp={formState.endDate.getTime()}
            />
          </div>
        </FormGroup>

        {!workshopUiDisabled ? (
          <FormGroup key="workshop-switch" fieldId="workshop-switch">
            <div className="catalog-item-form__group-control--single">
              <Switch
                id="workshop-switch"
                aria-label="Enable workshop user interface"
                label={
                  <span style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                    Enable workshop user interface{' '}
                    <span
                      style={{
                        backgroundColor: '#faeae8',
                        borderRadius: '10px',
                        color: '#7d1007',
                        fontStyle: 'italic',
                        fontWeight: 300,
                        fontSize: '12px',
                        padding: '0 8px',
                        marginLeft: '8px',
                      }}
                    >
                      Beta
                    </span>
                  </span>
                }
                isChecked={!!formState.workshop}
                hasCheckIcon
                onChange={(isChecked) =>
                  dispatchFormState({
                    type: 'workshop',
                    workshop: isChecked ? workshopInitialProps : null,
                  })
                }
              />
              <Tooltip
                position="right"
                isContentLeftAligned
                content={
                  catalogItem.spec.multiuser ? (
                    <p>Setup a user interface for the workshop attendees to access their credentials.</p>
                  ) : (
                    <ul>
                      <li>- Provision independent services for each attendee in the workshop.</li>
                      <li>- Setup a user interface for the workshop attendees to access their credentials.</li>
                    </ul>
                  )
                }
              >
                <OutlinedQuestionCircleIcon
                  aria-label="Setup a user interface for the attendees to access their credentials"
                  className="tooltip-icon-only"
                />
              </Tooltip>
            </div>
          </FormGroup>
        ) : null}

        {formState.workshop ? (
          <div className="catalog-item-form__workshop-form">
            <FormGroup fieldId="workshopDisplayName" isRequired label="Display Name">
              <div className="catalog-item-form__group-control--single">
                <TextInput
                  id="workshopDisplayName"
                  onChange={(v) =>
                    dispatchFormState({ type: 'workshop', workshop: { ...formState.workshop, displayName: v } })
                  }
                  value={formState.workshop.displayName}
                />
                <Tooltip position="right" content={<p>Title shown in the workshop user interface.</p>}>
                  <OutlinedQuestionCircleIcon
                    aria-label="Title shown in the workshop user interface"
                    className="tooltip-icon-only"
                  />
                </Tooltip>
              </div>
            </FormGroup>
            <FormGroup fieldId="workshopAccessPassword" label="Password">
              <div className="catalog-item-form__group-control--single">
                <TextInput
                  id="workshopAccessPassword"
                  onChange={(v) =>
                    dispatchFormState({ type: 'workshop', workshop: { ...formState.workshop, accessPassword: v } })
                  }
                  value={formState.workshop.accessPassword}
                />
                <Tooltip
                  position="right"
                  content={<p>Password to access credentials, if left empty no password will be required.</p>}
                >
                  <OutlinedQuestionCircleIcon
                    aria-label="Password to access credentials, if left empty no password will be required"
                    className="tooltip-icon-only"
                  />
                </Tooltip>
              </div>
            </FormGroup>
            <FormGroup fieldId="workshopRegistration" label="User Registration" className="select-wrapper">
              <div className="catalog-item-form__group-control--single">
                <Select
                  onToggle={(isOpen) => setUserRegistrationSelectIsOpen(isOpen)}
                  selections={formState.workshop.userRegistration}
                  variant={SelectVariant.single}
                  isOpen={userRegistrationSelectIsOpen}
                  onSelect={(_, selected) => {
                    dispatchFormState({
                      type: 'workshop',
                      workshop: {
                        ...formState.workshop,
                        userRegistration: typeof selected === 'string' ? selected : selected.toString(),
                      },
                    });
                    setUserRegistrationSelectIsOpen(false);
                  }}
                >
                  <SelectOption value="open">open registration</SelectOption>
                  <SelectOption value="pre">pre-registration</SelectOption>
                </Select>
                <Tooltip
                  position="right"
                  isContentLeftAligned
                  content={
                    <ul>
                      <li>- Open registration: Only the password will be required to access the credentials.</li>
                      <li>
                        - Pre-registration: Emails need to be provided before the attendees can access their
                        credentials, an email and password will be required to access the credentials.
                      </li>
                    </ul>
                  }
                >
                  <OutlinedQuestionCircleIcon aria-label="Type of registration" className="tooltip-icon-only" />
                </Tooltip>
              </div>
            </FormGroup>
            <FormGroup fieldId="workshopDescription" label="Description">
              <div className="catalog-item-form__group-control--single">
                <Editor
                  onChange={(_: EditorState, editor: LexicalEditor) => {
                    editor.update(() => {
                      const html = $generateHtmlFromNodes(editor, null);
                      dispatchFormState({
                        type: 'workshop',
                        workshop: { ...formState.workshop, description: html },
                      });
                    });
                  }}
                  placeholder="Add description"
                  aria-label="Description"
                  defaultValue={formState.workshop.description}
                />
                <Tooltip position="right" content={<p>Description text visible in the user access page.</p>}>
                  <OutlinedQuestionCircleIcon
                    aria-label="Description text visible in the user access page."
                    className="tooltip-icon-only"
                  />
                </Tooltip>
              </div>
            </FormGroup>
            {catalogItem.spec.multiuser ? null : (
              <>
                <FormGroup key="provisionCount" fieldId="workshopProvisionCount" label="Workshop User Count">
                  <div className="catalog-item-form__group-control--single">
                    <PatientNumberInput
                      min={0}
                      max={200}
                      onChange={(v) =>
                        dispatchFormState({ type: 'workshop', workshop: { ...formState.workshop, provisionCount: v } })
                      }
                      value={formState.workshop.provisionCount}
                    />
                    <Tooltip position="right" content={<p>Number of independent services for the workshop.</p>}>
                      <OutlinedQuestionCircleIcon
                        aria-label="Number of independent services for the workshop"
                        className="tooltip-icon-only"
                      />
                    </Tooltip>
                  </div>
                  {estimatedCost && formState.workshop.provisionCount > 1 ? (
                    <AlertGroup style={{ marginTop: 'var(--pf-global--spacer--sm)' }}>
                      <Alert
                        title={
                          <p>
                            Estimated hourly cost for this workshop user count:{' '}
                            <b>{formatCurrency(formState.workshop.provisionCount * estimatedCost)}</b>
                          </p>
                        }
                        variant="info"
                        isInline
                      />
                    </AlertGroup>
                  ) : null}
                </FormGroup>
                {isAdmin ? (
                  <>
                    <FormGroup
                      key="provisionConcurrency"
                      fieldId="workshopProvisionConcurrency"
                      label="Provision Concurrency (only visible to admins)"
                    >
                      <div className="catalog-item-form__group-control--single">
                        <PatientNumberInput
                          min={1}
                          max={30}
                          onChange={(v) =>
                            dispatchFormState({
                              type: 'workshop',
                              workshop: { ...formState.workshop, provisionConcurrency: v },
                            })
                          }
                          value={formState.workshop.provisionConcurrency}
                        />
                      </div>
                    </FormGroup>
                    <FormGroup
                      key="provisionStartDelay"
                      fieldId="workshopProvisionStartDelay"
                      label="Provision Start Interval (only visible to admins)"
                    >
                      <div className="catalog-item-form__group-control--single">
                        <PatientNumberInput
                          min={15}
                          max={600}
                          onChange={(v) =>
                            dispatchFormState({
                              type: 'workshop',
                              workshop: { ...formState.workshop, provisionStartDelay: v },
                            })
                          }
                          value={formState.workshop.provisionStartDelay}
                        />
                      </div>
                    </FormGroup>
                  </>
                ) : null}
              </>
            )}
          </div>
        ) : isAdmin ? (
          <>
            <FormGroup key="pooling-switch" fieldId="pooling-switch">
              <div className="catalog-item-form__group-control--single">
                <Switch
                  id="pooling-switch"
                  aria-label="Use pool if available"
                  label="Use pool if available (only visible to admins)"
                  isChecked={formState.usePoolIfAvailable}
                  hasCheckIcon
                  onChange={(isChecked) =>
                    dispatchFormState({
                      type: 'usePoolIfAvailable',
                      usePoolIfAvailable: isChecked,
                    })
                  }
                />
              </div>
            </FormGroup>
            <FormGroup key="auto-detach-switch" fieldId="auto-detach-switch">
              <div className="catalog-item-form__group-control--single">
                <Switch
                  id="auto-detach-switch"
                  aria-label="Keep instance if provision fails"
                  label="Keep instance if provision fails (only visible to admins)"
                  isChecked={!formState.useAutoDetach}
                  hasCheckIcon
                  onChange={(isChecked) =>
                    dispatchFormState({
                      type: 'useAutoDetach',
                      useAutoDetach: !isChecked,
                    })
                  }
                />
              </div>
            </FormGroup>
          </>
        ) : null}

        {catalogItem.spec.termsOfService ? (
          <TermsOfService
            agreed={formState.termsOfServiceAgreed}
            onChange={(agreed) => {
              dispatchFormState({
                type: 'termsOfServiceAgreed',
                termsOfServiceAgreed: agreed,
              });
            }}
            text={catalogItem.spec.termsOfService}
          />
        ) : null}

        <ActionList>
          <ActionListItem>
            <Button
              isAriaDisabled={!submitRequestEnabled}
              isDisabled={!submitRequestEnabled}
              onClick={() => submitRequest()}
            >
              Order
            </Button>
          </ActionListItem>

          {isAdmin || isLabDeveloper(groups) /*|| formState.workshop */ ? (
            <ActionListItem>
              <Button
                isAriaDisabled={!submitRequestEnabled}
                isDisabled={!submitRequestEnabled}
                onClick={() => {
                  dispatchFormState({
                    type: 'dates',
                    startDate: new Date(),
                  });
                  openAutoStopDestroyModal('schedule');
                }}
                icon={<OutlinedCalendarAltIcon />}
              >
                Schedule
              </Button>
            </ActionListItem>
          ) : null}

          <ActionListItem>
            <Button variant="secondary" onClick={() => navigate(-1)}>
              Cancel
            </Button>
          </ActionListItem>
        </ActionList>
      </Form>
    </PageSection>
  );
};

const CatalogItemForm: React.FC = () => {
  const { namespace: catalogNamespaceName, name: catalogItemName } = useParams();
  return (
    <ErrorBoundaryPage namespace={catalogNamespaceName} name={catalogItemName} type="Catalog item">
      <CatalogItemFormData catalogItemName={catalogItemName} catalogNamespaceName={catalogNamespaceName} />
    </ErrorBoundaryPage>
  );
};

export default CatalogItemForm;
