import React from 'react';
import { checkSalesforceId } from '@app/api';
import { CatalogItem, CatalogItemSpecParameter } from '@app/types';

type ConditionValues = {
  [name: string]: boolean | number | string | string[] | undefined;
};
type UserProps = {
  groups: string[];
  isAdmin: boolean;
  roles: string[];
};
type WorkshopProps = {
  userRegistration: string;
  accessPassword: string;
  description: string;
  displayName: string;
  provisionCount: number;
  provisionConcurrency: number;
  provisionStartDelay: number;
};
type FormState = {
  user: UserProps;
  conditionChecks: {
    completed: boolean;
  };
  formGroups: FormStateParameterGroup[];
  parameters: { [name: string]: FormStateParameter };
  termsOfServiceAgreed: boolean;
  termsOfServiceRequired: boolean;
  workshop?: WorkshopProps;
  error: string;
  usePoolIfAvailable: boolean;
  startDate?: Date;
};
type ParameterProps = {
  name: string;
  isValid: boolean;
  value: boolean | number | string;
};

export type FormStateAction = {
  type:
    | 'init'
    | 'parameterUpdate'
    | 'termsOfServiceAgreed'
    | 'startDate'
    | 'workshop'
    | 'usePoolIfAvailable'
    | 'complete';
  catalogItem?: CatalogItem;
  user?: UserProps;
  parameter?: ParameterProps;
  termsOfServiceAgreed?: boolean;
  error?: string;
  parameters?: { [name: string]: FormStateParameter };
  workshop?: WorkshopProps;
  usePoolIfAvailable?: boolean;
  startDate?: Date;
};

export type FormStateParameter = {
  default?: boolean | number | string | undefined;
  isDisabled?: boolean;
  isHidden?: boolean;
  isRequired?: boolean; // isValid is specifically the result of component validation such as min/max on numeric input
  isValid?: boolean;
  name: string;
  spec: CatalogItemSpecParameter;
  validationMessage?: string | undefined; // validationMessage and validationResult are set by checking validation condition
  validationResult?: boolean | undefined;
  value?: boolean | number | string | undefined;
};

type FormStateParameterGroup = {
  formGroupLabel: string;
  isRequired?: boolean;
  key: string;
  parameters: FormStateParameter[];
};

export function checkCondition(condition: string, vars: ConditionValues): boolean {
  const checkFunction = new Function(
    Object.entries(vars)
      .map(([k, v]) => 'const ' + k + ' = ' + JSON.stringify(v) + ';')
      .join('\n') +
      'return (' +
      condition +
      ');'
  );
  const ret: boolean | Error = checkFunction();
  if (ret instanceof Error) {
    throw ret;
  } else {
    return Boolean(ret);
  }
}

// Because salesforce checks are asynchronous they need to be resolved before checking the condition logic
async function _checkCondition(
  condition: string,
  vars: ConditionValues,
  debouncedApiFetch: (path: string) => Promise<unknown>
): Promise<boolean> {
  const checkSalesforceIdRegex = /\bcheck_salesforce_id\(\s*(\w+)\s*\)/g;
  const checkSalesforceIds: string[] = [];
  condition.replace(checkSalesforceIdRegex, (match, name) => {
    checkSalesforceIds.push(name);
    return match;
  });
  const checkResults: boolean[] = [];
  for (const name of checkSalesforceIds) {
    checkResults.push(await checkSalesforceId(vars[name] as string, debouncedApiFetch));
  }
  return checkCondition(
    condition.replace(checkSalesforceIdRegex, () => (checkResults.shift() ? 'true' : 'false')),
    vars
  );
}
export async function checkConditionsInFormState(
  initialState: FormState,
  dispatchFn: React.Dispatch<FormStateAction>,
  debouncedApiFetch: (path: string) => Promise<unknown>
): Promise<void> {
  const parameters = Object.assign({}, initialState.parameters);
  const conditionValues: ConditionValues = {
    user_groups: initialState.user.groups,
    user_is_admin: initialState.user.isAdmin,
    user_roles: initialState.user.roles,
  };

  for (const [name, parameterState] of Object.entries(parameters)) {
    conditionValues[name] = parameterState.value;
  }

  try {
    for (const [name, parameterState] of Object.entries(parameters)) {
      const parameterSpec: CatalogItemSpecParameter = parameterState.spec;

      if (parameterSpec.formDisableCondition) {
        parameterState.isDisabled = await _checkCondition(
          parameterSpec.formDisableCondition,
          conditionValues,
          debouncedApiFetch
        );
      } else {
        parameterState.isDisabled = false;
      }

      if (parameterSpec.formHideCondition) {
        parameterState.isHidden = await _checkCondition(
          parameterSpec.formHideCondition,
          conditionValues,
          debouncedApiFetch
        );
      } else {
        parameterState.isHidden = false;
      }

      if (parameterSpec.formRequireCondition) {
        parameterState.isRequired = await _checkCondition(
          parameterSpec.formRequireCondition,
          conditionValues,
          debouncedApiFetch
        );
      } else {
        parameterState.isRequired = parameterSpec.required;
      }

      if (parameterSpec.validation) {
        if (parameterState.value || parameterSpec.required) {
          try {
            parameterState.validationResult = await _checkCondition(
              parameterSpec.validation,
              conditionValues,
              debouncedApiFetch
            );
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
    dispatchFn({
      type: 'complete',
      parameters,
      error: '',
    });
  } catch (error) {
    dispatchFn({ error: `Failed evaluating condition in form ${error}`, parameters, type: 'complete' });
  }
}

function reduceFormStateInit(catalogItem: CatalogItem, { isAdmin, groups, roles }): FormState {
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
    user: {
      isAdmin,
      roles,
      groups,
    },
    conditionChecks: {
      completed: false,
    },
    formGroups: formGroups,
    parameters: parameters,
    termsOfServiceAgreed: false,
    termsOfServiceRequired: catalogItem.spec.termsOfService ? true : false,
    workshop: null,
    error: '',
    usePoolIfAvailable: true,
  };
}

function reduceFormStateComplete(
  state: FormState,
  { error = '', parameters }: { error: string; parameters: { [name: string]: FormStateParameter } }
): FormState {
  return {
    ...state,
    ...(parameters ? { parameters } : {}),
    error,
    conditionChecks: {
      completed: true,
    },
  };
}

function reduceFormStateParameterUpdate(
  initialState: FormState,
  parameter: { name: string; value: boolean | number | string; isValid: boolean }
): FormState {
  const parameters = Object.assign({}, initialState.parameters);
  Object.assign(parameters[parameter.name], {
    value: parameter.value,
    isValid: parameter.isValid,
  });
  return {
    ...initialState,
    parameters,
    conditionChecks: {
      completed: false,
    },
  };
}

function reduceFormStateTermsOfServiceAgreed(initialState: FormState, termsOfServiceAgreed: boolean): FormState {
  return {
    ...initialState,
    termsOfServiceAgreed,
  };
}

function reduceFormStateWorkshop(initialState: FormState, workshop: WorkshopProps = null): FormState {
  return {
    ...initialState,
    workshop,
  };
}

function reduceFormStateUsePoolIfAvailable(initialState: FormState, usePoolIfAvailable = true): FormState {
  return {
    ...initialState,
    usePoolIfAvailable,
  };
}

function reduceFormStateStartDate(initialState: FormState, startDate: Date): FormState {
  const minThreshold = Date.now() + 900000; // 15 mins
  if (startDate && startDate.getTime() > minThreshold) {
    return {
      ...initialState,
      startDate,
    };
  }
  return {
    ...initialState,
    startDate: null,
  };
}

export function reduceFormState(state: FormState, action: FormStateAction): FormState {
  switch (action.type) {
    case 'init':
      return reduceFormStateInit(action.catalogItem, action.user);
    case 'parameterUpdate':
      return reduceFormStateParameterUpdate(state, {
        name: action.parameter.name,
        value: action.parameter.value,
        isValid: action.parameter.isValid,
      });
    case 'startDate':
      return reduceFormStateStartDate(state, action.startDate);
    case 'termsOfServiceAgreed':
      return reduceFormStateTermsOfServiceAgreed(state, action.termsOfServiceAgreed);
    case 'workshop':
      return reduceFormStateWorkshop(state, action.workshop);
    case 'usePoolIfAvailable':
      return reduceFormStateUsePoolIfAvailable(state, action.usePoolIfAvailable);
    case 'complete':
      return reduceFormStateComplete(state, { error: action.error, parameters: action.parameters });
    default:
      throw new Error(`Invalid FormStateAction type: ${action.type}`);
  }
}

export function checkEnableSubmit(state: FormState): boolean {
  if (!state.conditionChecks.completed) {
    return false;
  }
  if (state.termsOfServiceRequired && !state.termsOfServiceAgreed) {
    return false;
  }
  for (const parameter of Object.values(state.parameters)) {
    if (!parameter.isDisabled && !parameter.isHidden) {
      if (parameter.value === undefined || parameter.value === null) {
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
  if (state.workshop) {
    if (!state.workshop.displayName) {
      return false;
    }
  }
  return true;
}
