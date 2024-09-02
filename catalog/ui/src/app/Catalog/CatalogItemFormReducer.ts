import React from 'react';
import { checkSalesforceId } from '@app/api';
import { CatalogItem, CatalogItemSpecParameter, ServiceNamespace, TPurposeOpts } from '@app/types';
import parseDuration from 'parse-duration';
import { isAutoStopDisabled } from './catalog-utils';
import { getStageFromK8sObject } from '@app/util';

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
  serviceNamespace: ServiceNamespace;
  termsOfServiceAgreed: boolean;
  termsOfServiceRequired: boolean;
  workshop?: WorkshopProps;
  error: string;
  usePoolIfAvailable: boolean;
  useAutoDetach: boolean;
  startDate?: Date;
  stopDate?: Date;
  endDate: Date;
  activity: string;
  purpose: string;
  purposeOpts: TPurposeOpts;
  explanation?: string;
  salesforceId: {
    required: boolean;
    value?: string;
    valid: boolean;
    message?: string;
    skip?: boolean;
    type?: 'campaign' | 'cdh' | 'project' | 'opportunity';
  };
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
    | 'dates'
    | 'workshop'
    | 'usePoolIfAvailable'
    | 'useAutoDetach'
    | 'purpose'
    | 'salesforceId'
    | 'salesforceIdMessage'
    | 'serviceNamespace'
    | 'complete';
  allowServiceNamespaces?: ServiceNamespace[];
  catalogItem?: CatalogItem;
  user?: UserProps;
  parameter?: ParameterProps;
  purpose?: string;
  purposeOpts?: TPurposeOpts;
  activity?: string;
  explanation?: string;
  serviceNamespace?: ServiceNamespace;
  termsOfServiceAgreed?: boolean;
  salesforceId?: {
    required: boolean;
    value: string;
    valid: boolean;
    message?: string;
    skip?: boolean;
    type?: 'campaign' | 'cdh' | 'project' | 'opportunity';
  };
  message?: string;
  salesforceIdValid?: boolean;
  error?: string;
  parameters?: { [name: string]: FormStateParameter };
  workshop?: WorkshopProps;
  usePoolIfAvailable?: boolean;
  useAutoDetach?: boolean;
  startDate?: Date;
  stopDate?: Date;
  endDate?: Date;
};

export type FormStateParameter = {
  default?: boolean | number | string | undefined;
  isDisabled: boolean;
  isHidden: boolean;
  isRequired: boolean;
  isValid?: boolean; // isValid is specifically the result of component validation such as min/max on numeric input
  name: string;
  spec: CatalogItemSpecParameter;
  validationMessage?: string | undefined; // validationMessage and validationResult are set by checking validation condition
  validationResult?: boolean | undefined;
  value?: boolean | number | string | undefined;
};

type FormStateParameterGroup = {
  formGroupLabel: string;
  isRequired: boolean;
  key: string;
  parameters: FormStateParameter[];
};

const checkSalesforceIdRegex = /\bcheck_salesforce_id\(\s*(\w+)\s*\)/g;

export function checkCondition(condition: string, vars: ConditionValues): boolean {
  const checkFunction = new Function(
    Object.entries(vars)
      .map(([k, v]) => 'const ' + k + ' = ' + JSON.stringify(v) + ';')
      .join('\n') +
      'return (' +
      condition +
      ');',
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
  debouncedApiFetch: (path: string) => Promise<unknown>,
  dispatchFn: React.Dispatch<FormStateAction>,
): Promise<boolean> {
  const checkSalesforceIds: string[] = [];
  condition.replace(checkSalesforceIdRegex, (match, name) => {
    checkSalesforceIds.push(name);
    return match;
  });
  const checkResults: boolean[] = [];
  for (const name of checkSalesforceIds) {
    const { valid, message } = await checkSalesforceId(
      vars[name] as string,
      debouncedApiFetch,
      vars['sales_type'] as 'string',
    );
    dispatchFn({
      type: 'salesforceIdMessage',
      message,
    });
    checkResults.push(valid);
  }
  return checkCondition(
    condition.replace(checkSalesforceIdRegex, () => (checkResults.shift() ? 'true' : 'false')),
    vars,
  );
}
export async function checkConditionsInFormState(
  initialState: FormState,
  dispatchFn: React.Dispatch<FormStateAction>,
  debouncedApiFetch: (path: string) => Promise<unknown>,
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
  conditionValues['salesforce_id'] = initialState.salesforceId.value;
  let salesforceIdValid = initialState.salesforceId.valid;

  try {
    if (initialState.salesforceId.value) {
      salesforceIdValid = await _checkCondition(
        'check_salesforce_id(salesforce_id)',
        { salesforce_id: initialState.salesforceId.value, sales_type: initialState.salesforceId.type },
        debouncedApiFetch,
        dispatchFn,
      );
    }
    for (const [, parameterState] of Object.entries(parameters)) {
      const parameterSpec: CatalogItemSpecParameter = parameterState.spec;

      if (parameterSpec.formDisableCondition) {
        parameterState.isDisabled = await _checkCondition(
          parameterSpec.formDisableCondition,
          conditionValues,
          debouncedApiFetch,
          dispatchFn,
        );
      }

      if (parameterSpec.formHideCondition) {
        parameterState.isHidden = await _checkCondition(
          parameterSpec.formHideCondition,
          conditionValues,
          debouncedApiFetch,
          dispatchFn,
        );
      }

      if (parameterSpec.formRequireCondition) {
        parameterState.isRequired = await _checkCondition(
          parameterSpec.formRequireCondition,
          conditionValues,
          debouncedApiFetch,
          dispatchFn,
        );
      }

      if (parameterSpec.validation) {
        if (parameterState.value || parameterSpec.required) {
          try {
            parameterState.validationResult = await _checkCondition(
              parameterSpec.validation,
              conditionValues,
              debouncedApiFetch,
              dispatchFn,
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
      salesforceIdValid,
      error: '',
    });
  } catch (error) {
    dispatchFn({ error: `Failed evaluating condition in form ${error}`, parameters, type: 'complete' });
  }
}

function reduceFormStateInit(
  catalogItem: CatalogItem,
  serviceNamespace: ServiceNamespace,
  { isAdmin, groups, roles },
  purposeOpts: TPurposeOpts,
): FormState {
  const formGroups: FormStateParameterGroup[] = [];
  const parameters: { [name: string]: FormStateParameter } = {};
  const stage = getStageFromK8sObject(catalogItem);

  for (const parameterSpec of catalogItem.spec.parameters || []) {
    if (parameterSpec.name === 'purpose' || parameterSpec.name === 'salesforce_id') continue; // Disable agnosticV purpose / salesforce_id
    const defaultValue: boolean | number | string | undefined =
      parameterSpec.openAPIV3Schema?.default !== undefined
        ? parameterSpec.openAPIV3Schema.default
        : parameterSpec.value;
    const parameterState: FormStateParameter = {
      default: defaultValue,
      name: parameterSpec.name,
      spec: parameterSpec,
      value: defaultValue,
      isHidden: false,
      isDisabled: false,
      isRequired: parameterSpec.required || false,
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
          isRequired: false,
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
    serviceNamespace: serviceNamespace,
    termsOfServiceAgreed: false,
    termsOfServiceRequired: catalogItem.spec.termsOfService ? true : false,
    workshop: null,
    error: '',
    usePoolIfAvailable: true,
    useAutoDetach: true,
    activity: null,
    purpose: null,
    purposeOpts,
    explanation: null,
    salesforceId: {
      required: false,
      value: null,
      valid: false,
      skip: false,
      message: '',
    },
    stopDate: isAutoStopDisabled(catalogItem)
      ? null
      : new Date(Date.now() + parseDuration(catalogItem.spec.runtime?.default || '4h')),
    endDate: new Date(Date.now() + parseDuration(catalogItem.spec.lifespan?.default || '2d')),
  };
}

function reduceFormStateComplete(
  state: FormState,
  {
    error = '',
    salesforceIdValid,
    parameters,
  }: { error: string; salesforceIdValid: boolean; parameters: { [name: string]: FormStateParameter } },
): FormState {
  return {
    ...state,
    ...(parameters ? { parameters } : {}),
    error,
    salesforceId: {
      ...state.salesforceId,
      valid: salesforceIdValid,
    },
    conditionChecks: {
      completed: true,
    },
  };
}

function reduceFormStateParameterUpdate(
  initialState: FormState,
  parameter: { name: string; value: boolean | number | string; isValid: boolean },
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
  const isSalesforceIdRequired = salesforceIdRequired({ ...initialState, workshop });
  const salesforceId = { ...initialState.salesforceId, required: isSalesforceIdRequired };
  return {
    ...initialState,
    salesforceId,
    workshop,
  };
}

function reduceFormStateUsePoolIfAvailable(initialState: FormState, usePoolIfAvailable = true): FormState {
  return {
    ...initialState,
    usePoolIfAvailable,
  };
}

function reduceFormStateUseAutoDetach(initialState: FormState, useAutoDetach = true): FormState {
  return {
    ...initialState,
    useAutoDetach,
  };
}

function reduceFormStateDates(initialState: FormState, _startDate: Date, _stopDate: Date, _endDate: Date): FormState {
  const minThreshold = Date.now() + 900000; // 15 mins
  let stopDate = _stopDate;
  let endDate = _endDate;
  let startDate = _startDate;
  if (!_stopDate) {
    stopDate = initialState.stopDate;
  }
  if (!_endDate) {
    endDate = initialState.endDate;
  }
  if (!_startDate) {
    startDate = initialState.startDate;
  }
  if (_startDate && _startDate.getTime() > minThreshold) {
    return {
      ...initialState,
      stopDate,
      endDate,
      startDate: _startDate,
    };
  }
  return {
    ...initialState,
    startDate,
    stopDate,
    endDate,
  };
}

function reduceFormStateServiceNamespace(initialState: FormState, serviceNamespace: ServiceNamespace): FormState {
  return {
    ...initialState,
    serviceNamespace: serviceNamespace,
  };
}

function reduceFormStatePurpose(
  initialState: FormState,
  activity: string,
  purpose: string,
  explanation: string,
): FormState {
  return {
    ...initialState,
    salesforceId: {
      ...initialState.salesforceId,
      required: salesforceIdRequired({ ...initialState, purpose }),
    },
    activity,
    purpose,
    explanation,
  };
}

function salesforceIdRequired(state: FormState): boolean {
  if (state.purpose) {
    const p = state.purposeOpts.find((p) => state.activity === p.activity && state.purpose.startsWith(p.name));
    if (p.sfdcRequired) return true;
  }
  if (state.user.isAdmin) return false;
  if (state.workshop && state.workshop.provisionCount > 1) return true;
  return false;
}

function reduceFormStateSalesforceId(
  initialState: FormState,
  salesforceId: { required: boolean; value: string; valid: boolean },
): FormState {
  return {
    ...initialState,
    salesforceId: {
      ...initialState.salesforceId,
      ...salesforceId,
    },
    conditionChecks: {
      completed: false,
    },
  };
}

function reduceFormStateSalesforceIdMessage(initialState: FormState, message: string): FormState {
  return {
    ...initialState,
    salesforceId: {
      ...initialState.salesforceId,
      message,
    },
  };
}

export function reduceFormState(state: FormState, action: FormStateAction): FormState {
  switch (action.type) {
    case 'init':
      return reduceFormStateInit(action.catalogItem, action.serviceNamespace, action.user, action.purposeOpts);
    case 'parameterUpdate':
      return reduceFormStateParameterUpdate(state, {
        name: action.parameter.name,
        value: action.parameter.value,
        isValid: action.parameter.isValid,
      });
    case 'purpose':
      return reduceFormStatePurpose(state, action.activity, action.purpose, action.explanation);
    case 'salesforceId':
      return reduceFormStateSalesforceId(state, action.salesforceId);
    case 'salesforceIdMessage':
      return reduceFormStateSalesforceIdMessage(state, action.message);
    case 'serviceNamespace':
      return reduceFormStateServiceNamespace(state, action.serviceNamespace);
    case 'dates':
      return reduceFormStateDates(state, action.startDate, action.stopDate, action.endDate);
    case 'termsOfServiceAgreed':
      return reduceFormStateTermsOfServiceAgreed(state, action.termsOfServiceAgreed);
    case 'workshop':
      return reduceFormStateWorkshop(state, action.workshop);
    case 'usePoolIfAvailable':
      return reduceFormStateUsePoolIfAvailable(state, action.usePoolIfAvailable);
    case 'useAutoDetach':
      return reduceFormStateUseAutoDetach(state, action.useAutoDetach);
    case 'complete':
      return reduceFormStateComplete(state, {
        error: action.error,
        salesforceIdValid: action.salesforceIdValid,
        parameters: action.parameters,
      });
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

  if (state.purposeOpts.length > 0) {
    if (!state.purpose || !state.activity) {
      return false;
    }
    if (!state.salesforceId.skip && state.salesforceId.required && !state.salesforceId.valid) {
      return false;
    }
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
