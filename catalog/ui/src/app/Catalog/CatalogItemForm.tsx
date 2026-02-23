import React, { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
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
  Checkbox,
  Form,
  FormGroup,
  FormHelperText,
  PageSection,
  Switch,
  TextInput,
  Title,
  Tooltip,
} from '@patternfly/react-core';
import { Select, SelectOption, SelectList, MenuToggle, MenuToggleElement } from '@patternfly/react-core';
import OutlinedQuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/outlined-question-circle-icon';
import BetaBadge from '@app/components/BetaBadge';
import useSWRImmutable from 'swr/immutable';
import useSWR from 'swr';
import {
  apiFetch,
  apiPaths,
  checkCatalogItemAvailability,
  createServiceRequest,
  CreateServiceRequestParameterValues,
  createWorkshop,
  createWorkshopProvision,
  fetcher,
  saveExternalItemRequest,
  silentFetcher,
} from '@app/api';
import {
  AvailabilityCheckResponse,
  CatalogItem,
  CatalogItemIncident,
  SandboxCloudSelector,
  TPurposeOpts,
} from '@app/types';
import { checkAccessControl, displayName, getStageFromK8sObject, isLabDeveloper, randomString, READY_BY_LEAD_TIME_MS } from '@app/util';
import Editor from '@app/components/Editor/Editor';
import useSession from '@app/utils/useSession';
import useDebounce from '@app/utils/useDebounce';
import PatientNumberInput from '@app/components/PatientNumberInput';
import DynamicFormInput from '@app/components/DynamicFormInput';
import ActivityPurposeSelector from '@app/components/ActivityPurposeSelector';
import ProjectSelector from '@app/components/ProjectSelector';
import TermsOfService from '@app/components/TermsOfService';
import SalesforceItemsField from '@app/components/SalesforceItemsField';
import { reduceFormState, checkEnableSubmit, checkConditionsInFormState } from './CatalogItemFormReducer';
import AutoStopDestroy from '@app/components/AutoStopDestroy';
import CatalogItemFormAutoStopDestroyModal, { TDates, TDatesTypes } from './CatalogItemFormAutoStopDestroyModal';
import { formatCurrency, getEstimatedCost, getStatus, isAutoStopDisabled } from './catalog-utils';
import ErrorBoundaryPage from '@app/components/ErrorBoundaryPage';
import SearchSalesforceIdModal from '@app/components/SearchSalesforceIdModal';
import useInterfaceConfig from '@app/utils/useInterfaceConfig';
import useSystemStatus from '@app/utils/useSystemStatus';
import DateTimePicker from '@app/components/DateTimePicker';

import './catalog-item-form.css';

const CatalogItemFormData: React.FC<{ catalogItemName: string; catalogNamespaceName: string }> = ({
  catalogItemName,
  catalogNamespaceName,
}) => {
  const navigate = useNavigate();
  const debouncedApiFetch = useDebounce(apiFetch, 1000);
  const [autoStopDestroyModal, openAutoStopDestroyModal] = useState<TDatesTypes>(null);
  const [searchSalesforceIdModal, openSearchSalesforceIdModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [availabilityData, setAvailabilityData] = useState<AvailabilityCheckResponse | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [useDirectProvisioningDate, setUseDirectProvisioningDate] = useState(false);
  const prevSandboxParametersRef = React.useRef<Record<string, unknown>>({});
  const { isAdmin, groups, roles, serviceNamespaces, userNamespace, email } = useSession().getSession();
  const { sfdc_enabled } = useInterfaceConfig();
  const { isWorkshopOrderingBlocked, workshopOrderingBlockedMessage, isServiceOrderingBlocked, serviceOrderingBlockedMessage } = useSystemStatus();
  const { data: catalogItem } = useSWRImmutable<CatalogItem>(
    apiPaths.CATALOG_ITEM({ namespace: catalogNamespaceName, name: catalogItemName }),
    fetcher,
  );
  const stage = getStageFromK8sObject(catalogItem);
  const asset_uuid = catalogItem.metadata.labels?.['gpte.redhat.com/asset-uuid'];
  const { data: catalogItemIncident } = useSWR<CatalogItemIncident>(
    asset_uuid ? apiPaths.CATALOG_ITEM_LAST_INCIDENT({ stage, asset_uuid }) : null,
    silentFetcher,
    {
      shouldRetryOnError: false,
      suspense: false,
    },
  );

  const _displayName = displayName(catalogItem);
  const estimatedCost = useMemo(() => getEstimatedCost(catalogItem), [catalogItem]);
  const [userRegistrationSelectIsOpen, setUserRegistrationSelectIsOpen] = useState(false);
  const workshopInitialProps = useMemo(
    () => ({
      userRegistration: 'open',
      accessPassword: randomString(8),
      description: '<p></p>',
      displayName: _displayName,
      provisionCount: 1,
      provisionConcurrency: catalogItem.spec.workshopUserMode === 'multi' ? 1 : 10,
      provisionStartDelay: 30,
    }),
    [_displayName, catalogItem.spec.workshopUserMode === 'multi'],
  );

  const onToggleClick = () => {
    setUserRegistrationSelectIsOpen(!userRegistrationSelectIsOpen);
  };

  const toggle = (toggleRef: React.Ref<MenuToggleElement>) => (
    <MenuToggle ref={toggleRef} onClick={onToggleClick} isExpanded={userRegistrationSelectIsOpen}>
      {formState.workshop.userRegistration}
    </MenuToggle>
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
      sfdc_enabled,
    }),
  );
  let maxAutoDestroyTime = Math.min(
    parseDuration(catalogItem.spec.lifespan?.maximum),
    parseDuration(catalogItem.spec.lifespan?.relativeMaximum),
  );
  let maxAutoStopTime = parseDuration(catalogItem.spec.runtime?.maximum);
  const purposeObj =
    purposeOpts.length > 0 ? purposeOpts.find((p) => formState.purpose && formState.purpose.startsWith(p.name)) : null;
  const incident = getStatus(catalogItemIncident);
  // Check if ordering is blocked by system status (workshop or service ordering)
  const isOrderingBlocked = formState.workshop 
    ? (isWorkshopOrderingBlocked && !isAdmin) 
    : (isServiceOrderingBlocked && !isAdmin);
  const orderingBlockedMessage = formState.workshop 
    ? workshopOrderingBlockedMessage 
    : serviceOrderingBlockedMessage;
  const submitRequestEnabled =
    isOrderingBlocked ? false : (incident && incident.disabled && !isAdmin ? false : checkEnableSubmit(formState) && !isLoading);

  useEffect(() => {
    if (!formState.conditionChecks.completed) {
      checkConditionsInFormState(formState, dispatchFormState, debouncedApiFetch);
    }
  }, [dispatchFormState, formState, debouncedApiFetch]);

  const checkAvailability = useCallback(async () => {
    // Extract sandbox cloud selectors from catalog item parameters
    const sandboxCloudSelectors: (SandboxCloudSelector & { parameterName: string })[] = [];
    for (const parameter of catalogItem.spec.parameters || []) {
      if (parameter.sandboxCloudSelectors) {
        sandboxCloudSelectors.push(
          ...parameter.sandboxCloudSelectors.map((selector) => ({
            ...selector,
            parameterName: parameter.name,
          })),
        );
      }
    }

    // If no sandbox cloud selectors, don't call the endpoint
    if (sandboxCloudSelectors.length === 0) {
      setAvailabilityData(null);
      return undefined;
    }
    setAvailabilityLoading(true);

    try {
      // Build resources array based on sandbox cloud selectors and current form state
      const resources = sandboxCloudSelectors.map((selector) => {
        const annotations: Record<string, string> = {};
        // Add the annotation from the selector if it exists
        if (selector.annotation) {
          // Get the value from form state for this parameter
          const parameterState = formState.parameters[selector.parameterName];
          if (parameterState && parameterState.value !== undefined) {
            annotations[selector.annotation] = String(parameterState.value);
          }
        }

        const resource = {
          kind: selector.kind,
          annotations,
        };
        return resource;
      });
      const result = await checkCatalogItemAvailability(catalogItem.metadata.name, resources);
      setAvailabilityData(result);
    } catch {
      setAvailabilityData({
        overallAvailable: false,
        overallMessage: 'Failed to check availability',
        results: [],
      });
    } finally {
      setAvailabilityLoading(false);
    }
  }, [catalogItem, formState.parameters]);

  // Get parameter names that have sandbox cloud selectors
  const getParametersWithSandboxSelectors = useCallback(() => {
    const parameterNames = [];
    for (const parameter of catalogItem.spec.parameters || []) {
      if (parameter.sandboxCloudSelectors) {
        parameterNames.push(parameter.name);
      }
    }
    return parameterNames;
  }, [catalogItem.spec.parameters]);

  // Trigger availability check when sandbox selector parameters change
  useEffect(() => {
    const parametersWithSelectors = getParametersWithSandboxSelectors();

    if (parametersWithSelectors.length === 0) {
      setAvailabilityData(null);
      prevSandboxParametersRef.current = {};
      return undefined;
    }

    // Get current values of parameters with sandbox selectors
    const currentSandboxParams: Record<string, unknown> = {};
    let hasRelevantValues = false;

    parametersWithSelectors.forEach((paramName) => {
      const paramState = formState.parameters[paramName];
      const currentValue = paramState?.value;
      currentSandboxParams[paramName] = currentValue;
      if (currentValue !== undefined && currentValue !== '' && currentValue !== null) {
        hasRelevantValues = true;
      }
    });

    // Check if any sandbox selector parameter values have actually changed
    const prevParams = prevSandboxParametersRef.current;
    const shouldTrigger = parametersWithSelectors.some((paramName) => {
      return currentSandboxParams[paramName] !== prevParams[paramName];
    });
    // Update the ref with current values AFTER checking for changes
    prevSandboxParametersRef.current = currentSandboxParams;

    if (shouldTrigger) {
      if (hasRelevantValues) {
        checkAvailability();
        return undefined;
      } else {
        setAvailabilityData(null);
        return undefined;
      }
    }
    return undefined;
  }, [formState.parameters, getParametersWithSandboxSelectors, checkAvailability]);

  async function submitRequest(): Promise<void> {
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

    if (catalogItem.spec.externalUrl) {
      await saveExternalItemRequest({
        asset_uuid: catalogItem.metadata.labels['gpte.redhat.com/asset-uuid'],
        requester: formState.serviceNamespace.requester || email,
        purpose: formState.purpose,
        purposeActivity: formState.activity,
        purposeExplanation: formState.explanation,
        salesforceId: formState.salesforceItems?.[0]?.id,
        salesType: formState.salesforceItems?.[0]?.type,
        stage: getStageFromK8sObject(catalogItem),
      });
      setIsLoading(false);
      window.open(catalogItem.spec.externalUrl, '_blank');
      return null;
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
        stopDate: formState.stopDate,
        endDate: formState.endDate,
        startDate: formState.startDate,
        readyByDate: useDirectProvisioningDate && formState.startDate 
          ? new Date(formState.startDate.getTime() + READY_BY_LEAD_TIME_MS) 
          : undefined,
        email,
        parameterValues,
        skippedSfdc: formState.salesforceId.skip,
        whiteGloved: formState.whiteGloved,
        salesforceItems: formState.salesforceItems,
      });
      const redirectUrl = `/workshops/${workshop.metadata.namespace}/${workshop.metadata.name}`;
      await createWorkshopProvision({
        catalogItem: catalogItem,
        concurrency: provisionConcurrency,
        count: provisionCount,
        parameters: {
          ...parameterValues,
          salesforce_items: JSON.stringify(formState.salesforceItems),
        },
        startDelay: provisionStartDelay,
        workshop: workshop,
        useAutoDetach: formState.useAutoDetach,
        usePoolIfAvailable: formState.usePoolIfAvailable,
      });
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
        startDate: formState.startDate,
        stopDate: formState.stopDate,
        endDate: formState.endDate,
        email,
        skippedSfdc: formState.salesforceId.skip,
        whiteGloved: formState.whiteGloved,
        salesforceItems: formState.salesforceItems,
      });

      navigate(`/services/${resourceClaim.metadata.namespace}/${resourceClaim.metadata.name}`);
    }
    setIsLoading(false);
  }

  if ('deny' === checkAccessControl(catalogItem.spec.accessControl, groups, isAdmin)) {
    return <Navigate to="/" replace />;
  }

  return (
    <PageSection hasBodyWrapper={false} className="catalog-item-form">
      <CatalogItemFormAutoStopDestroyModal
        type={autoStopDestroyModal}
        autoStopDate={formState.stopDate}
        autoDestroyDate={formState.endDate}
        isAutoStopDisabled={isAutoStopDisabled(catalogItem)}
        maxRuntimeTimestamp={isAdmin ? maxAutoDestroyTime : maxAutoStopTime}
        defaultRuntimeTimestamp={
          new Date(Date.now() + parseDuration(catalogItem.spec.runtime?.default)) > formState.endDate
            ? parseDuration('4h')
            : parseDuration(catalogItem.spec.runtime?.default)
        }
        maxDestroyTimestamp={
          isAdmin
            ? null
            : formState.workshop
              ? formState.startDate.getTime() - Date.now() + parseDuration('5d')
              : maxAutoDestroyTime
        }
        onConfirm={(dates: TDates) =>
          autoStopDestroyModal === 'auto-destroy'
            ? dispatchFormState({ type: 'dates', endDate: dates.endDate })
            : autoStopDestroyModal === 'auto-stop'
              ? dispatchFormState({ type: 'dates', stopDate: dates.stopDate })
              : null
        }
        onClose={() => openAutoStopDestroyModal(null)}
        title={_displayName}
      />
      <SearchSalesforceIdModal
        isOpen={searchSalesforceIdModal}
        onClose={() => openSearchSalesforceIdModal(false)}
        defaultSfdcType={formState.salesforceItems?.[formState.salesforceItems.length - 1]?.type || null}
        onSubmitCb={(value: string, type: 'campaign' | 'project' | 'opportunity') =>
          dispatchFormState({
            type: 'salesforceItems',
            salesforceItems: [{ id: value, type }],
          })
        }
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
        {(isAdmin || serviceNamespaces.length > 1) && !catalogItem.spec.externalUrl ? (
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
            />
            <Tooltip position="right" content={<div>Create service request in specified project namespace.</div>}>
              <OutlinedQuestionCircleIcon
                aria-label="Create service request in specified project namespace."
                className="tooltip-icon-only"
                style={{ marginLeft: 'var(--pf-t--global--spacer--md)' }}
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
              style={purposeOpts.length === 1 ? { display: 'none' } : {}}
            />

            {sfdc_enabled ? (
              <FormGroup
                fieldId="salesforce_id"
                label={
                  <span>
                    Salesforce IDs{' '}
                    <span
                      style={{
                        fontSize: 'var(--pf-t--global--font--size--xs)',
                        color:
                          'var(--pf-t--color--gray--60)',
                        fontStyle: 'italic',
                        fontWeight: 400,
                      }}
                    >
                      (Opportunity ID, Campaign ID or Project ID)
                    </span>
                  </span>
                }
                style={purposeOpts.length === 1 && formState.salesforceId.required ? { display: 'none' } : {}}
                isRequired={formState.salesforceId.required && !formState.salesforceId.skip}
              >
                <div>
                  <SalesforceItemsField
                    standalone={false}
                    fieldId="salesforce_id"
                    items={formState.salesforceItems || []}
                    onChange={(items) => {
                      dispatchFormState({
                        type: 'salesforceItems',
                        salesforceItems: items,
                      });
                    }}
                    isRequired={formState.salesforceId.required && !formState.salesforceId.skip}
                  />
                  {formState.conditionChecks.completed && !formState.salesforceId.skip && (!formState.salesforceItems || formState.salesforceItems.length === 0) && purposeObj && purposeObj.sfdcRequired ? (
                    <FormHelperText>
                      A valid Salesforce ID is required for the selected activity / purpose
                    </FormHelperText>
                  ) : null}
                  <div>
                    <div className="catalog-item-form__group-control--single" style={{ paddingTop: '16px' }}>
                      <Checkbox
                        id="skip-salesforce-id"
                        name="skip-salesforce-id"
                        label="I'll provide the Salesforce ID within 48 hours."
                        isChecked={formState.salesforceId.skip}
                        isDisabled={
                          // Disable if there are any Salesforce items
                          (formState.salesforceItems && formState.salesforceItems.length > 0)
                        }
                        onChange={(_event: unknown, checked: boolean) =>
                          dispatchFormState({
                            type: 'skipSalesforceId',
                            skipSalesforceId: checked,
                          })
                        }
                      />
                      <Tooltip
                        position="right"
                        content={
                          <div>
                            By checking this box, you agree to provide the required number within 48 hours, in alignment
                            with Red Hat&apos;s Code of Ethics. It is your responsibility to ensure the accuracy and timely
                            submission of this information, as it is essential for the integrity and compliance of our
                            processes.
                          </div>
                        }
                      >
                        <OutlinedQuestionCircleIcon
                          aria-label="By checking this box, you agree to provide the required number within 48 hours, in alignment with Red Hat's Code of Ethics. It is your responsibility to ensure the accuracy and timely submission of this information, as it is essential for the integrity and compliance of our processes."
                          className="tooltip-icon-only"
                        />
                      </Tooltip>
                    </div>
                  </div>
                </div>
              </FormGroup>
            ) : null}
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
              !parameter.isDisabled && (parameter.isValid === false || parameter.validationResult === false),
          );

          return (
            <FormGroup
              key={formGroup.key}
              fieldId={formGroup.parameters.length === 1 ? `${formGroup.key}-${formGroupIdx}` : null}
              isRequired={formGroup.isRequired}
              label={formGroup.formGroupLabel}
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
                          isGroup={formGroup.parameters.length > 1}
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
              {invalidParameter?.validationMessage ? (
                <FormHelperText>{invalidParameter.validationMessage}</FormHelperText>
              ) : null}
            </FormGroup>
          );
        })}

        {!workshopUiDisabled && !catalogItem.spec.externalUrl ? (
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
                onChange={(_event, isChecked) => {
                  dispatchFormState({
                    type: 'workshop',
                    workshop: isChecked ? workshopInitialProps : null,
                  });
                  if (isChecked) {
                    dispatchFormState({
                      type: 'usePoolIfAvailable',
                      usePoolIfAvailable: false,
                    });
                  }
                  if (!formState.startDate) {
                    dispatchFormState({
                      type: 'dates',
                      startDate: new Date(Date.now()), // Provisioning start date is current time
                    });
                  }
                }}
              />
              <Tooltip
                position="right"
                isContentLeftAligned
                content={
                  catalogItem.spec.workshopUserMode === 'multi' ? (
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

        {!formState.workshop && !catalogItem.spec.externalUrl ? (
          <FormGroup fieldId="serviceStartDate" isRequired label="Start Provisioning Date">
            <div className="catalog-item-form__group-control--single">
              <DateTimePicker
                defaultTimestamp={Date.now()}
                onSelect={(d: Date) =>
                  dispatchFormState({
                    type: 'initDates',
                    catalogItem,
                    startDate: d,
                  })
                }
                minDate={Date.now()}
              />
              <Tooltip position="right" content={<p>Select the date you&apos;d like the service to start provisioning.</p>}>
                <OutlinedQuestionCircleIcon
                  aria-label="Select the date you'd like the service to start provisioning."
                  className="tooltip-icon-only"
                />
              </Tooltip>
            </div>
          </FormGroup>
        ) : null}

        {!isAutoStopDisabled(catalogItem) && !formState.workshop && !catalogItem.spec.externalUrl ? (
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
        ) : null}

        {!formState.workshop && !catalogItem.spec.externalUrl ? (
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
        ) : null}

        {formState.workshop ? (
          <div className="catalog-item-form__workshop-form">
            {/* Workshop Dates FormGroup - Start Date and Provisioning Date side by side */}
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
                <FormGroup 
                  fieldId="provisioningDate" 
                  isRequired 
                  label="Provisioning Date"
                >
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 'var(--pf-t--global--spacer--md)',
                    }}
                  >
                    <DateTimePicker
                      key={`provisioning-${useDirectProvisioningDate}`}
                      defaultTimestamp={formState.startDate?.getTime() || Date.now()}
                      forceUpdateTimestamp={formState.startDate?.getTime()}
                      isDisabled={useDirectProvisioningDate}
                      onSelect={(d: Date) => {
                        dispatchFormState({
                          type: 'dates',
                          startDate: d,
                          stopDate: new Date(
                            d.getTime() +
                              parseDuration(
                                formState.activity?.startsWith('Customer Facing')
                                  ? '365d'
                                  : catalogItem.spec.runtime?.default || catalogItem.spec.lifespan?.default || '30h'
                              ),
                          ),
                          endDate: new Date(
                            d.getTime() +
                              parseDuration(
                                catalogItem.spec.lifespan?.default || '30h'
                              )
                          ),
                        });
                      }}
                      minDate={Date.now()}
                    />
                    <Tooltip
                      position="right"
                      content={
                        <p>
                          Select when you want the workshop provisioning to start.
                        </p>
                      }
                    >
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
                            When enabled, allows you to specify when the workshop should be ready by (8 hours after provisioning starts).
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
                  <FormGroup 
                    fieldId="readyByDate" 
                    label="Ready by"
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 'var(--pf-t--global--spacer--md)',
                      }}
                    >
                      <DateTimePicker
                        key={`ready-by-${useDirectProvisioningDate}`}
                        defaultTimestamp={
                          formState.startDate
                            ? formState.startDate.getTime() + READY_BY_LEAD_TIME_MS // Show actual start date (8 hours after provisioning)
                            : Date.now() + READY_BY_LEAD_TIME_MS
                        }
                        forceUpdateTimestamp={formState.startDate?.getTime() + READY_BY_LEAD_TIME_MS}
                        onSelect={(d: Date) => {
                          // Calculate provisioning date as 8 hours BEFORE ready by date
                          const provisioningDate = new Date(d.getTime() - READY_BY_LEAD_TIME_MS);
                          dispatchFormState({
                            type: 'dates',
                            startDate: provisioningDate, // Internal API still uses provisioning date as startDate
                            stopDate: new Date(
                              d.getTime() +
                                parseDuration(
                                  formState.activity?.startsWith('Customer Facing')
                                    ? '365d'
                                    : catalogItem.spec.runtime?.default || catalogItem.spec.lifespan?.default || '30h'
                                ),
                            ),
                            endDate: new Date(
                              d.getTime() +
                                parseDuration(
                                  catalogItem.spec.lifespan?.default || '30h'
                                )
                            ),
                          });
                        }}
                        minDate={Date.now() + READY_BY_LEAD_TIME_MS} // Minimum must account for 8-hour provisioning lead time
                      />
                      <Tooltip
                        position="right"
                        content={
                          <p>
                            Select when you&apos;d like the workshop to be ready. Provisioning will automatically begin 8 hours before this time.
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
            {!isAutoStopDisabled(catalogItem) ? (
              <FormGroup key="auto-stop" fieldId="auto-stop" isRequired label="Auto-stop">
                <div className="catalog-item-form__group-control--single">
                  <AutoStopDestroy
                    type="auto-stop"
                    onClick={() => openAutoStopDestroyModal('auto-stop')}
                    className="catalog-item-form__auto-stop-btn"
                    time={formState.stopDate.getTime()}
                    variant="extended"
                    destroyTimestamp={formState.endDate.getTime()}
                  />
                </div>
              </FormGroup>
            ) : null}
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
            <FormGroup fieldId="workshopDisplayName" isRequired label="Display Name">
              <div className="catalog-item-form__group-control--single">
                <TextInput
                  id="workshopDisplayName"
                  onChange={(_event, v) =>
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
                  onChange={(_event, v) =>
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
                  selected={formState.workshop.userRegistration}
                  onOpenChange={(isOpen) => setUserRegistrationSelectIsOpen(isOpen)}
                  toggle={toggle}
                >
                  <SelectList>
                    <SelectOption value="open">open registration</SelectOption>
                    <SelectOption value="pre">pre-registration</SelectOption>
                  </SelectList>
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
            {catalogItem.spec.workshopUserMode === 'multi' ? null : (
              <>
                <FormGroup key="provisionCount" fieldId="workshopProvisionCount" label="Workshop User Count">
                  <div className="catalog-item-form__group-control--single">
                    <PatientNumberInput
                      min={0}
                      max={catalogItem.spec.workshopUiMaxInstances || 30}
                      adminModifier={true}
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
                    <AlertGroup style={{ marginTop: 'var(--pf-t--global--spacer--sm)' }}>
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
        ) : null}

        {isAdmin && !catalogItem.spec.externalUrl ? (
          <FormGroup fieldId="white-glove" isRequired>
            <div className="catalog-item-form__group-control--single">
              <Switch
                id="white-glove-switch"
                aria-label="White-Glove Support"
                label="White-Glove Support (for admins to tick when giving a white gloved experience)"
                isChecked={formState.whiteGloved}
                hasCheckIcon
                onChange={(_event, isChecked) => {
                  dispatchFormState({
                    type: 'whiteGloved',
                    whiteGloved: isChecked,
                  });
                }}
              />
            </div>
          </FormGroup>
        ) : null}

        {isAdmin && !catalogItem.spec.externalUrl ? (
          <FormGroup key="pooling-switch" fieldId="pooling-switch">
            <div className="catalog-item-form__group-control--single">
              <Switch
                id="pooling-switch"
                aria-label="Use pool if available"
                label="Use pool if available (only visible to admins)"
                isChecked={formState.usePoolIfAvailable}
                hasCheckIcon
                onChange={(_event, isChecked) =>
                  dispatchFormState({
                    type: 'usePoolIfAvailable',
                    usePoolIfAvailable: isChecked,
                  })
                }
              />
            </div>
          </FormGroup>
        ) : null}

        {(isAdmin || isLabDeveloper(groups)) && !catalogItem.spec.externalUrl ? (
          <FormGroup key="auto-detach-switch" fieldId="auto-detach-switch">
            <div className="catalog-item-form__group-control--single">
              <Switch
                id="auto-detach-switch"
                aria-label="Keep instance if provision fails"
                label="Keep instance if provision fails (only visible to admins)"
                isChecked={!formState.useAutoDetach}
                hasCheckIcon
                onChange={(_event, isChecked) => {
                  dispatchFormState({
                    type: 'useAutoDetach',
                    useAutoDetach: !isChecked,
                  });
                }}
              />
            </div>
          </FormGroup>
        ) : null}

        {catalogItem.spec.termsOfService ? (
          <TermsOfService
            agreed={formState.termsOfServiceAgreed}
            onChange={(ev, agreed) => {
              dispatchFormState({
                type: 'termsOfServiceAgreed',
                termsOfServiceAgreed: agreed,
              });
            }}
            text={catalogItem.spec.termsOfService}
          />
        ) : null}

        <div>
          {isOrderingBlocked && (
            <AlertGroup style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}>
              <Alert variant="warning" title={formState.workshop ? "Workshop Ordering Temporarily Disabled" : "Service Ordering Temporarily Disabled"} isInline>
                <p>{orderingBlockedMessage || (formState.workshop 
                  ? "Workshop ordering is temporarily disabled. Please try again later." 
                  : "Service ordering is temporarily disabled. Please try again later.")}</p>
              </Alert>
            </AlertGroup>
          )}

          {availabilityLoading && (
            <AlertGroup style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}>
              <Alert variant="info" title="Checking availability..." isInline>
                <p>Checking resource availability for this catalog item...</p>
              </Alert>
            </AlertGroup>
          )}

          {availabilityData && !availabilityLoading && (
            <AlertGroup style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}>
              <Alert
                variant={availabilityData.overallAvailable ? 'success' : 'danger'}
                title={`Resource Availability: ${availabilityData.overallAvailable ? 'Available' : 'Not Available'}`}
                isInline
              >
                <p>{availabilityData.overallMessage}</p>
              </Alert>
            </AlertGroup>
          )}
        </div>

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
