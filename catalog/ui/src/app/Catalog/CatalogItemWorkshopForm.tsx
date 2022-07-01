import React, { useEffect, useReducer, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useHistory } from 'react-router-dom';

import {
  ActionList,
  ActionListItem,
  Button,
  EmptyState,
  EmptyStateIcon,
  Form,
  FormGroup,
  FormHelperText,
  PageSection,
  PageSectionVariants,
  Select,
  SelectOption,
  SelectVariant,
  TextArea,
  TextInput,
  Title,
} from '@patternfly/react-core';
import { ExclamationCircleIcon } from '@patternfly/react-icons';

import { checkSalesforceId, createWorkshop, createWorkshopProvision } from '@app/api';
import { selectUserGroups, selectUserIsAdmin, selectUserRoles, selectWorkshopNamespaces } from '@app/store';
import { CatalogItem, CatalogItemSpecParameter, ServiceNamespace, Workshop } from '@app/types';
import { ConditionValues, checkCondition, displayName, randomString } from '@app/util';

import DynamicFormInput from '@app/components/DynamicFormInput';
import LoadingIcon from '@app/components/LoadingIcon';
import PatientNumberInput from '@app/components/PatientNumberInput';

import './catalog-item-workshop-form.css';

interface FormState {
  conditionChecks: {
    canceled: boolean;
    complete: boolean;
    running: boolean;
  };
  formGroups: FormStateParameterGroup[];
  initComplete: boolean;
  parameters: { [name: string]: FormStateParameter };
}

interface FormStateAction {
  type: 'checkConditionsComplete' | 'init' | 'parameterUpdate';
  catalogItem?: CatalogItem;
  parameterIsValid?: boolean;
  parameterName?: string;
  parameterValue?: boolean | number | string | undefined;
}

interface FormStateParameter {
  default?: boolean | number | string | undefined;
  isDisabled?: boolean;
  isHidden?: boolean;
  isRequired?: boolean;
  // isValid is specifically the result of component validation such as min/max on numeric input
  isValid?: boolean;
  name: string;
  spec: CatalogItemSpecParameter;
  // validationMessage and validationResult are set by checking validation condition
  validationMessage?: string | undefined;
  validationResult?: boolean | undefined;
  value?: boolean | number | string | undefined;
}

interface FormStateParameterGroup {
  formGroupLabel: string;
  isRequired?: boolean;
  key: string;
  parameters: FormStateParameter[];
}

function cancelFormStateConditionChecks(state: FormState): void {
  if (state) {
    state.conditionChecks.canceled = true;
  }
}

// Because salesforce checks are asynchronous they need to be resolved before checking the condition logic
async function _checkCondition(condition: string, vars: ConditionValues): Promise<boolean> {
  const checkSalesforceIdRegex = /\bcheck_salesforce_id\(\s*(\w+)\s*\)/g;
  const checkSalesforceIds: string[] = [];
  condition.replace(checkSalesforceIdRegex, (match, name) => {
    checkSalesforceIds.push(name);
    return match;
  });
  const checkResults: boolean[] = [];
  for (const name of checkSalesforceIds) {
    checkResults.push(await checkSalesforceId(vars[name] as string));
  }
  return checkCondition(
    condition.replace(checkSalesforceIdRegex, () => (checkResults.shift() ? 'true' : 'false')),
    vars
  );
}

async function checkConditionsInFormState(
  state: FormState,
  userGroups: string[],
  userIsAdmin: boolean,
  userRoles: string[]
): Promise<void> {
  state.conditionChecks.running = true;

  const conditionValues: ConditionValues = {
    user_groups: userGroups,
    user_is_admin: userIsAdmin,
    user_roles: userRoles,
  };

  for (const [name, parameterState] of Object.entries(state.parameters)) {
    conditionValues[name] = parameterState.value;
  }

  for (const [name, parameterState] of Object.entries(state.parameters)) {
    const parameterSpec: CatalogItemSpecParameter = parameterState.spec;

    if (parameterSpec.formDisableCondition) {
      parameterState.isDisabled = await _checkCondition(parameterSpec.formDisableCondition, conditionValues);
      if (state.conditionChecks.canceled) {
        return;
      }
    } else {
      parameterState.isDisabled = false;
    }

    if (parameterSpec.formHideCondition) {
      parameterState.isHidden = await _checkCondition(parameterSpec.formHideCondition, conditionValues);
      if (state.conditionChecks.canceled) {
        return;
      }
    } else {
      parameterState.isHidden = false;
    }

    if (parameterSpec.formRequireCondition) {
      parameterState.isRequired = await _checkCondition(parameterSpec.formRequireCondition, conditionValues);
      if (state.conditionChecks.canceled) {
        return;
      }
    } else {
      parameterState.isRequired = parameterSpec.required;
    }

    if (parameterSpec.validation) {
      if (parameterState.value || parameterSpec.required) {
        try {
          parameterState.validationResult = await _checkCondition(parameterSpec.validation, conditionValues);
          if (state.conditionChecks.canceled) {
            return;
          }
          parameterState.validationMessage = undefined;
        } catch (error) {
          parameterState.validationResult = false;
          if (error instanceof Error) {
            parameterState.validationMessage = error.message;
          } else {
            parameterState.validationMessage = String(error);
          }
        }
      } else {
        // No value, so skip validation
        parameterState.validationMessage = undefined;
        parameterState.validationResult = undefined;
      }
    }
  }
}

function checkEnableSubmit(state: FormState): boolean {
  if (!state || !state.conditionChecks.complete) {
    return false;
  }
  for (const parameter of Object.values(state.parameters)) {
    if (!parameter.isDisabled && !parameter.isHidden) {
      if (parameter.value === undefined) {
        if (parameter.isRequired) {
          return false;
        }
      } else if (
        parameter.isValid === false ||
        (parameter.validationResult === false && !(parameter.value === '' && !parameter.isRequired))
      ) {
        return false;
      }
    }
  }
  return true;
}

function reduceFormState(state: FormState, action: FormStateAction): FormState {
  switch (action.type) {
    case 'checkConditionsComplete':
      return reduceCheckConditionsComplete(state);
    case 'init':
      cancelFormStateConditionChecks(state);
      return reduceFormStateInit(action);
    case 'parameterUpdate':
      cancelFormStateConditionChecks(state);
      return reduceFormStateParameterUpdate(state, action);
    default:
      throw new Error(`Invalid FormStateAction type: ${action.type}`);
  }
}

function reduceCheckConditionsComplete(state: FormState): FormState {
  return {
    ...state,
    conditionChecks: {
      canceled: false,
      complete: true,
      running: false,
    },
    initComplete: true,
  };
}

function reduceFormStateInit(action: FormStateAction): FormState {
  const catalogItem: CatalogItem = action.catalogItem;
  const formGroups: FormStateParameterGroup[] = [];
  const parameters: { [name: string]: FormStateParameter } = {};

  for (const parameterSpec of catalogItem.spec.parameters || []) {
    const defaultValue: boolean | number | string | undefined =
      parameterSpec.openAPIV3Schema?.default !== undefined
        ? parameterSpec.openAPIV3Schema.default
        : parameterSpec.value;
    const parameterState: FormStateParameter = {
      default: defaultValue,
      name: parameterSpec.name,
      spec: parameterSpec,
      value: defaultValue,
    };
    parameters[parameterSpec.name] = parameterState;

    if (parameterSpec.formGroup) {
      const formGroup = formGroups.find((item) => item.key === parameterSpec.formGroup);
      if (formGroup) {
        formGroup.parameters.push(parameterState);
      } else {
        formGroups.push({
          formGroupLabel: parameterSpec.formGroup,
          key: parameterSpec.formGroup,
          parameters: [parameterState],
        });
      }
    } else {
      formGroups.push({
        formGroupLabel: parameterSpec.formLabel || parameterSpec.name,
        isRequired: parameterSpec.required,
        key: parameterSpec.name,
        parameters: [parameterState],
      });
    }
  }

  return {
    conditionChecks: {
      canceled: false,
      complete: false,
      running: false,
    },
    formGroups: formGroups,
    initComplete: false,
    parameters: parameters,
  };
}

function reduceFormStateParameterUpdate(state: FormState, action: FormStateAction): FormState {
  Object.assign(state.parameters[action.parameterName], {
    value: action.parameterValue,
    isValid: action.parameterIsValid,
  });
  return {
    ...state,
    conditionChecks: {
      canceled: false,
      complete: false,
      running: false,
    },
    initComplete: true,
  };
}

const CatalogItemWorkshopForm: React.FC<{
  catalogItem: CatalogItem;
  onCancel: () => void;
}> = ({ catalogItem, onCancel }) => {
  const history = useHistory();
  const componentWillUnmount = useRef(false);
  const [formState, dispatchFormState] = useReducer(reduceFormState, undefined);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [userRegistrationValue, setUserRegistrationValue] = useState<string>('open');
  const [userRegistrationSelectIsOpen, setUserRegistrationSelectIsOpen] = useState<boolean>(false);
  const [workshopAccessPassword, setWorkshopAccessPassword] = useState<string>(randomString(8));
  const [workshopDescription, setWorkshopDescription] = useState<string>('');
  const [workshopDisplayName, setWorkshopDisplayName] = useState<string>(displayName(catalogItem));
  const [workshopProvisionCount, setWorkshopProvisionCount] = useState<number>(catalogItem.spec.multiuser ? 1 : 20);
  const [workshopProvisionConcurrency, setWorkshopProvisionConcurrency] = useState<number>(
    catalogItem.spec.multiuser ? 1 : 10
  );
  const [workshopProvisionStartDelay, setWorkshopProvisionStartDelay] = useState<number>(30);
  const userGroups: string[] = useSelector(selectUserGroups);
  const userIsAdmin: boolean = useSelector(selectUserIsAdmin);
  const userRoles: string[] = useSelector(selectUserRoles);
  const workshopNamespaces: ServiceNamespace[] = useSelector(selectWorkshopNamespaces);

  const submitRequestEnabled: boolean = checkEnableSubmit(formState);

  async function submitRequest(): Promise<void> {
    if (!submitRequestEnabled) {
      throw 'submitRequest called when submission should be disabled!';
    }
    const parameterValues: any = {};
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

    const workshop: Workshop = await createWorkshop({
      accessPassword: workshopAccessPassword,
      catalogItem: catalogItem,
      description: workshopDescription,
      displayName: workshopDisplayName,
      openRegistration: userRegistrationValue === 'open',
      // FIXME - Allow selecting service namespace
      serviceNamespace: workshopNamespaces[0],
    });

    await createWorkshopProvision({
      catalogItem: catalogItem,
      concurrency: workshopProvisionConcurrency,
      count: workshopProvisionCount,
      parameters: parameterValues,
      startDelay: workshopProvisionStartDelay,
      workshop: workshop,
    });

    history.push(`/workshops/${workshop.metadata.namespace}/${workshop.metadata.name}`);
  }

  async function checkConditions(): Promise<void> {
    try {
      await checkConditionsInFormState(formState, userGroups, userIsAdmin, userRoles);
      dispatchFormState({
        type: 'checkConditionsComplete',
      });
    } catch (error) {
      setErrorMessage(`Failed evaluating condition in form ${error}`);
    }
  }

  // First render and detect unmount
  useEffect(() => {
    return () => {
      componentWillUnmount.current = true;
    };
  }, []);

  // Initialize form groups for parameters and default vaules
  React.useEffect(() => {
    setErrorMessage(undefined);
    dispatchFormState({
      type: 'init',
      catalogItem: catalogItem,
    });
  }, [catalogItem.metadata.uid]);

  React.useEffect(() => {
    if (formState) {
      if (!formState.conditionChecks.complete) {
        checkConditions();
      }
      return () => {
        if (componentWillUnmount.current) {
          cancelFormStateConditionChecks(formState);
        }
      };
    } else {
      return null;
    }
  }, [formState]);

  if (!formState?.initComplete) {
    return (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={LoadingIcon} />
        </EmptyState>
      </PageSection>
    );
  }

  return (
    <>
      <PageSection key="title" variant={PageSectionVariants.light} className="catalog-item-workshop-form-title">
        <Title headingLevel="h2" size="lg">
          Request Workshop with {displayName(catalogItem)}
        </Title>
      </PageSection>
      <PageSection
        key="parameters"
        variant={PageSectionVariants.light}
        className="catalog-item-workshop-form-parameters"
      >
        <Title headingLevel="h3" size="lg">
          Service Parameters
        </Title>
        {formState.formGroups.length > 0 ? (
          <p>Parameters provided in this form will be used for provisioning services for the workshop.</p>
        ) : null}
        {errorMessage ? <p className="error">{errorMessage}</p> : null}
        <Form className="catalog-request-form">
          {formState.formGroups.map((formGroup, formGroupIdx) => {
            // do not render form group if all parameters for formGroup are hidden
            if (!formGroup.parameters.find((parameter) => !parameter.isHidden)) {
              return null;
            }
            // check if there is an invalid parameter in the form group
            const invalidParameter: FormStateParameter = formGroup.parameters.find(
              (parameter) =>
                !parameter.isDisabled && (parameter.isValid === false || parameter.validationResult === false)
            );
            // validated is error if found an invalid parameter
            // validated is success if all form group parameters are validated.
            const validated: 'default' | 'error' | 'success' | 'warning' = invalidParameter
              ? 'error'
              : formGroup.parameters.find(
                  (parameter) => parameter.isValid !== true && parameter.validationResult !== true
                )
              ? 'default'
              : 'success';
            return (
              <FormGroup
                key={formGroup.key}
                fieldId={formGroup.parameters.length == 1 ? `${formGroup.key}-${formGroupIdx}` : null}
                isRequired={formGroup.isRequired}
                label={formGroup.formGroupLabel}
                helperTextInvalid={
                  <FormHelperText
                    icon={<ExclamationCircleIcon />}
                    isError={validated === 'error'}
                    isHidden={validated !== 'error'}
                  >
                    {invalidParameter ? invalidParameter.validationMessage || invalidParameter.spec.description : null}
                  </FormHelperText>
                }
                validated={validated}
              >
                {formGroup.parameters.map((parameterState) => {
                  const parameterSpec: CatalogItemSpecParameter = parameterState.spec;
                  return (
                    <DynamicFormInput
                      key={parameterSpec.name}
                      id={formGroup.parameters.length == 1 ? `${formGroup.key}-${formGroupIdx}` : null}
                      isDisabled={parameterState.isDisabled}
                      parameter={parameterSpec}
                      validationResult={parameterState.validationResult}
                      value={parameterState.value}
                      onChange={(value: boolean | number | string, isValid?: boolean) => {
                        dispatchFormState({
                          type: 'parameterUpdate',
                          parameterName: parameterSpec.name,
                          parameterValue: value,
                          parameterIsValid: isValid,
                        });
                      }}
                    />
                  );
                })}
              </FormGroup>
            );
          })}
        </Form>
      </PageSection>
      <PageSection
        key="actions"
        variant={PageSectionVariants.light}
        className="catalog-item-workshop-form-workshop-config"
      >
        <Form className="catalog-request-form">
          <FormGroup fieldId="workshopDisplayName" isRequired={true} label="Display Name">
            <TextInput
              id="workshopDisplayName"
              onChange={(v) => setWorkshopDisplayName(v)}
              value={workshopDisplayName}
            />
          </FormGroup>
          <FormGroup fieldId="workshopAccessPassword" label="Access Password">
            <TextInput
              id="workshopAccessPassword"
              isRequired={true}
              onChange={(v) => setWorkshopAccessPassword(v)}
              value={workshopAccessPassword}
            />
          </FormGroup>
          <FormGroup fieldId="workshopRegistration" label="User Registration">
            <Select
              onToggle={(isOpen) => setUserRegistrationSelectIsOpen(isOpen)}
              selections={userRegistrationValue}
              variant={SelectVariant.single}
              isOpen={userRegistrationSelectIsOpen}
              onSelect={(event, selected) => {
                setUserRegistrationValue(typeof selected === 'string' ? selected : selected.toString());
                setUserRegistrationSelectIsOpen(false);
              }}
            >
              <SelectOption value="open">open registration</SelectOption>
              <SelectOption value="pre">pre-registration</SelectOption>
            </Select>
          </FormGroup>
          <FormGroup fieldId="workshopDescription" label="Workshop Description">
            <TextArea
              onChange={(v) => setWorkshopDescription(v)}
              value={workshopDescription}
              aria-label="Workshop Description"
            />
          </FormGroup>
          {catalogItem.spec.multiuser
            ? null
            : [
                <FormGroup key="provisionCount" fieldId="workshopProvisionCount" label="Provision Count">
                  <PatientNumberInput
                    min={0}
                    max={200}
                    onChange={setWorkshopProvisionCount}
                    value={workshopProvisionCount}
                  />
                </FormGroup>,
                <FormGroup
                  key="provisionConcurrency"
                  fieldId="workshopProvisionConcurrency"
                  label="Provision Concurrency"
                >
                  <PatientNumberInput
                    min={1}
                    max={20}
                    onChange={setWorkshopProvisionConcurrency}
                    value={workshopProvisionConcurrency}
                  />
                </FormGroup>,
                <FormGroup
                  key="provisionStartDelay"
                  fieldId="workshopProvisionStartDelay"
                  label="Provision Start Interval"
                >
                  <PatientNumberInput
                    min={15}
                    max={600}
                    onChange={setWorkshopProvisionStartDelay}
                    value={workshopProvisionStartDelay}
                  />
                </FormGroup>,
              ]}
        </Form>
      </PageSection>
      <PageSection key="actions" variant={PageSectionVariants.light} className="catalog-item-workshop-form-actions">
        <ActionList>
          <ActionListItem>
            <Button isDisabled={!submitRequestEnabled} onClick={submitRequest}>
              Request Workshop
            </Button>
          </ActionListItem>
          <ActionListItem>
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </ActionListItem>
        </ActionList>
      </PageSection>
    </>
  );
};

export default CatalogItemWorkshopForm;
