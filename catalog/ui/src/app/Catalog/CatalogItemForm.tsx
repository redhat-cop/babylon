import React, { useEffect, useMemo, useReducer, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import parseDuration from 'parse-duration';
import { EditorState } from 'lexical/LexicalEditorState';
import { LexicalEditor } from 'lexical/LexicalEditor';
import { $generateHtmlFromNodes } from '@lexical/html';
import {
  ActionList,
  ActionListItem,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  EmptyState,
  EmptyStateBody,
  EmptyStateIcon,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
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
import InfoIcon from '@patternfly/react-icons/dist/js/icons/info-icon';
import OutlinedQuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/outlined-question-circle-icon';
import ExclamationCircleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-circle-icon';
import OutlinedCalendarAltIcon from '@patternfly/react-icons/dist/js/icons/outlined-calendar-alt-icon';
import ExclamationTriangleIcon from '@patternfly/react-icons/dist/js/icons/exclamation-triangle-icon';
import useSWR from 'swr';
import {
  apiFetch,
  apiPaths,
  createServiceRequest,
  CreateServiceRequestParameterValues,
  createWorkshop,
  createWorkshopProvision,
  fetcher,
} from '@app/api';
import { CatalogItem } from '@app/types';
import { ErrorBoundary } from 'react-error-boundary';
import { displayName, isLabDeveloper, randomString } from '@app/util';
import DateTimePicker from '@app/components/DateTimePicker';
import Editor from '@app/components/Editor/Editor';
import useSession from '@app/utils/useSession';
import useDebounce from '@app/utils/useDebounce';
import PatientNumberInput from '@app/components/PatientNumberInput';
import Modal, { useModal } from '@app/Modal/Modal';
import DynamicFormInput from '@app/components/DynamicFormInput';
import ActivityPurposeSelector from '@app/components/ActivityPurposeSelector';
import ServiceNamespaceSelect from '@app/components/ServiceNamespaceSelect';
import TermsOfService from '@app/components/TermsOfService';
import { reduceFormState, checkEnableSubmit, checkConditionsInFormState } from './CatalogItemFormReducer';
import Footer from '@app/components/Footer';
import { getStage } from './catalog-utils';

import './catalog-item-form.css';

const ScheduleModal: React.FC<{ defaultTimestamp: number; onSelect: (date: Date) => void; maxDate?: number }> = ({
  defaultTimestamp,
  onSelect,
  maxDate,
}) => {
  const now = Date.now();
  return (
    <Form className="catalog-item-form__schedule-form" isHorizontal>
      <FormGroup fieldId="schedule-field" label="Start Date">
        <DateTimePicker
          defaultTimestamp={defaultTimestamp}
          onSelect={(date) => onSelect(date)}
          minDate={now}
          maxDate={maxDate}
        />
      </FormGroup>
    </Form>
  );
};

const CatalogItemFormData: React.FC<{ catalogItemName: string; catalogNamespaceName: string }> = ({
  catalogItemName,
  catalogNamespaceName,
}) => {
  const navigate = useNavigate();
  const debouncedApiFetch = useDebounce(apiFetch, 1000);
  const [scheduleModal, openScheduleModal] = useModal();
  const { isAdmin, groups, roles, serviceNamespaces, workshopNamespaces, userNamespace } = useSession().getSession();
  const { data: catalogItem } = useSWR<CatalogItem>(
    apiPaths.CATALOG_ITEM({ namespace: catalogNamespaceName, name: catalogItemName }),
    fetcher
  );
  const [userRegistrationSelectIsOpen, setUserRegistrationSelectIsOpen] = useState(false);
  const workshopInitialProps = useMemo(
    () => ({
      userRegistration: 'open',
      accessPassword: randomString(8),
      description: '',
      displayName: displayName(catalogItem),
      provisionCount: 1,
      provisionConcurrency: catalogItem.spec.multiuser ? 1 : 10,
      provisionStartDelay: 30,
    }),
    [catalogItem]
  );
  const workshopUiDisabled = catalogItem.spec.workshopUiDisabled || false;
  const stage = getStage(catalogItem);
  const [formState, dispatchFormState] = useReducer(
    reduceFormState,
    reduceFormState(null, {
      type: 'init',
      catalogItem,
      serviceNamespace: userNamespace,
      user: { groups, roles, isAdmin },
    })
  );
  const submitRequestEnabled = checkEnableSubmit(formState);

  useEffect(() => {
    if (!formState.conditionChecks.completed) {
      checkConditionsInFormState(formState, dispatchFormState, debouncedApiFetch);
    }
  }, [dispatchFormState, formState, debouncedApiFetch]);

  async function submitRequest({ scheduled = false }): Promise<void> {
    if (!submitRequestEnabled) {
      throw new Error('submitRequest called when submission should be disabled!');
    }
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
    const [activity] = formState.purpose.split('-').map((x) => x.trim());
    parameterValues['purpose_activity'] = activity;
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
      });
      await createWorkshopProvision({
        catalogItem: catalogItem,
        concurrency: provisionConcurrency,
        count: provisionCount,
        parameters: parameterValues,
        startDelay: provisionStartDelay,
        workshop: workshop,
        ...(scheduled && formState.startDate ? { start: { date: formState.startDate, type: 'lifespan' } } : {}),
      });

      navigate(`/workshops/${workshop.metadata.namespace}/${workshop.metadata.name}`);
    } else {
      const resourceClaim = await createServiceRequest({
        catalogItem,
        catalogNamespaceName: catalogNamespaceName,
        groups,
        parameterValues,
        serviceNamespace: formState.serviceNamespace,
        usePoolIfAvailable: formState.usePoolIfAvailable,
        ...(scheduled && formState.startDate
          ? {
              start: {
                date: formState.startDate,
                type: 'resource',
                autoStop: new Date(
                  formState.startDate.getTime() + parseDuration(catalogItem.spec.runtime?.default || '4h')
                ),
              },
            }
          : {}),
      });

      navigate(`/services/${resourceClaim.metadata.namespace}/${resourceClaim.metadata.name}`);
    }
  }

  return (
    <PageSection variant={PageSectionVariants.light} className="catalog-item-form">
      <Modal
        ref={scheduleModal}
        onConfirm={() => submitRequest({ scheduled: true })}
        title="Schedule for"
        confirmText="Schedule"
      >
        <ScheduleModal
          defaultTimestamp={formState.startDate?.getTime() || Date.now()}
          onSelect={(date) =>
            dispatchFormState({
              type: 'startDate',
              startDate: date,
            })
          }
          maxDate={
            formState.workshop || !catalogItem.spec.lifespan
              ? null
              : Math.min(
                  Date.now() + parseDuration(catalogItem.spec.lifespan.maximum),
                  Date.now() + parseDuration(catalogItem.spec.lifespan.relativeMaximum)
                )
          }
        />
        {formState.workshop ? (
          <HelperText style={{ marginTop: 'var(--pf-global--spacer--sm)' }}>
            <HelperTextItem icon={<InfoIcon />}>
              Services will launch at the specified date and take some time to be available.
            </HelperTextItem>
          </HelperText>
        ) : null}
      </Modal>
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
              {displayName(catalogItem)}
            </Link>
          )}
        />
      </Breadcrumb>
      <Title headingLevel="h1" size="lg">
        Order {displayName(catalogItem)}
      </Title>
      <p>Order by completing the form. Default values may be provided.</p>
      {formState.error ? <p className="error">{formState.error}</p> : null}
      <Form className="catalog-item-form__form">
        {isAdmin ||
        (formState.workshop && workshopNamespaces.length > 1) ||
        (!formState.workshop && serviceNamespaces.length > 1) ? (
          <FormGroup key="service-namespace" fieldId="service-namespace" label="Create Request in Project">
            <ServiceNamespaceSelect
              currentNamespaceName={formState.serviceNamespace.name}
              onSelect={(namespace) => {
                dispatchFormState({
                  type: 'serviceNamespace',
                  serviceNamespace: namespace,
                });
              }}
            />{' '}
            <Tooltip position="right" content={<div>Create service request in specified project namespace.</div>}>
              <OutlinedQuestionCircleIcon
                aria-label="Create service request in specified project namespace."
                className="tooltip-icon-only"
              />
            </Tooltip>
          </FormGroup>
        ) : null}

        {stage !== 'event' ? (
          <>
            <ActivityPurposeSelector
              value={formState.purpose}
              onChange={(purpose: string) => {
                dispatchFormState({
                  type: 'purpose',
                  purpose,
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
                    (Opportunity ID, Campaign ID, CDH Party or Project ID)
                  </span>
                </span>
              }
              helperTextInvalid={
                <FormHelperText icon={<ExclamationCircleIcon />} isError isHidden={false}>
                  {formState.purpose && formState.purpose.startsWith('Customer Activity')
                    ? 'A valid Salesforce ID is required for all Customer Facing Events'
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
            </FormGroup>
          </>
        ) : (
          <ActivityPurposeSelector
            value={formState.purpose || 'Event'}
            isEvent
            onChange={(purpose: string, sfdc: string) => {
              dispatchFormState({
                type: 'purpose',
                purpose,
              });
              sfdc
                ? dispatchFormState({
                    type: 'salesforceId',
                    salesforceId: { ...formState.salesforceId, value: sfdc, valid: false },
                  })
                : dispatchFormState({
                    type: 'salesforceId',
                    salesforceId: { required: false, value: null, valid: false },
                  });
            }}
          />
        )}
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
                ))}
            </FormGroup>
          );
        })}

        {!workshopUiDisabled && (isAdmin || workshopNamespaces.length > 0) ? (
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
                    allowServiceNamespaces: isAdmin ? null : isChecked ? workshopNamespaces : serviceNamespaces,
                    serviceNamespace: isChecked ? workshopNamespaces[0] : userNamespace,
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
                          max={20}
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
              onClick={() => submitRequest({ scheduled: false })}
            >
              Order
            </Button>
          </ActionListItem>
          {isAdmin || isLabDeveloper(groups) ? (
            <ActionListItem>
              <Button
                isAriaDisabled={!submitRequestEnabled}
                isDisabled={!submitRequestEnabled}
                onClick={() => {
                  dispatchFormState({
                    type: 'startDate',
                    startDate: new Date(),
                  });
                  openScheduleModal();
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
    <ErrorBoundary
      onError={(err) => window['newrelic'] && window['newrelic'].noticeError(err)}
      fallbackRender={() => (
        <>
          <PageSection>
            <EmptyState variant="full">
              <EmptyStateIcon icon={ExclamationTriangleIcon} />
              <Title headingLevel="h1" size="lg">
                Catalog item not found.
              </Title>
              <EmptyStateBody>
                CatalogItem {catalogItemName} was not found in {catalogNamespaceName}
              </EmptyStateBody>
            </EmptyState>
          </PageSection>
          <Footer />
        </>
      )}
    >
      <CatalogItemFormData catalogItemName={catalogItemName} catalogNamespaceName={catalogNamespaceName} />
      <Footer />
    </ErrorBoundary>
  );
};

export default CatalogItemForm;
