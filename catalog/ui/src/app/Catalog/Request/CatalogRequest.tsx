import * as React from 'react';

import {
  useHistory,
  useRouteMatch,
} from 'react-router-dom';

import {
  useSelector,
} from 'react-redux';

import {
  ExclamationCircleIcon,
} from '@patternfly/react-icons';

import {
  selectCatalogItems,
  selectCatalogNamespaces,
  selectUserNamespace,
} from '@app/store';

import './catalog-request.css';

import {
  ActionList,
  ActionListItem,
  Button,
  Checkbox,
  Form,
  FormGroup,
  FormHelperText,
  NumberInput,
  PageSection,
  PageSectionVariants,
  Select,
  SelectOption,
  SelectVariant,
  TextInput,
  Title,
  ValidatedOptions
} from '@patternfly/react-core';

import {
  createServiceRequest,
  patchResourceClaim,
  getApiSession,
  getNamespacedCustomObject
} from '@app/api';

import {
  checkCondition,
  displayName,
  randomString,
  recursiveAssign,
} from '@app/util';

import { DynamicFormInput } from '@app/components/DynamicFormInput';
import { TermsOfService  } from '@app/components/TermsOfService';

export interface CatalogRequestProps {
  location?: any;
}

const CatalogRequest: React.FunctionComponent<CatalogRequestProps> = ({
  location,
}) => {
  const history = useHistory();

  const catalogRequestRouteMatch = useRouteMatch<any>('/catalog/request/:namespace/:name');
  const catalogNamespaceName = catalogRequestRouteMatch?.params.namespace;
  const catalogItemName = catalogRequestRouteMatch?.params.name;

  const catalogItems = useSelector(selectCatalogItems);
  const catalogNamespaces = useSelector(selectCatalogNamespaces);
  const catalogNamespace = catalogNamespaces.find(ns => ns.name == catalogNamespaceName)

  const [termsOfServiceAgreed, setTermsOfServiceAgreed] = React.useState(false);
  const [parameterState, setParameterState] = React.useState({});
  const [parameterValidationState, setParameterValidationState] = React.useState({});

  const catalogItem = (
    catalogItems?.[catalogNamespaceName] || []
  ).find(ci => ci.metadata.name === catalogItemName);

  // Enable submit if terms of service is agreed, the request id is valid, and no parameter vars are invalid
  const submitRequestEnabled = (
    (termsOfServiceAgreed || !catalogItem?.spec?.termsOfService) &&
    Object.values(parameterValidationState).find(v => v === false) !== false
  );
  const formGroups: { formGroupLabel: any; key: any; parameters: any[]; }[] = [];
  const parameters = catalogItem?.spec?.parameters || [];
  const parameterDefaults = {};

  for (const parameter of parameters) {
    const formGroupLabel = parameter.formGroup;
    parameterDefaults[parameter.name] = 'default' in (parameter.openAPIV3Schema || {}) ? parameter.openAPIV3Schema.default : parameter.value;
    if (formGroupLabel) {
      const formGroup = formGroups.find(item => item.formGroupLabel === formGroupLabel);
      if (formGroup) {
        formGroup.parameters.push(parameter);
      } else {
        formGroups.push({
          formGroupLabel: formGroupLabel,
          key: formGroupLabel,
          parameters: [parameter],
        });
      }
    } else {
      formGroups.push({
        formGroupLabel: parameter.formLabel || parameter.name,
        key: parameter.name,
        parameters: [parameter]
      });
    }
  }

  // Initialize value to defaults
  React.useEffect(() => {
    if (catalogItem) {
      setParameterState(parameterDefaults);
    }
  }, [catalogItem?.metadata?.uid])

  function cancelRequest(): void {
    if (location.state) {
      history.goBack();
    } else {
      history.push('/catalog');
    }
  }

  async function onTermsOfServiceChange(): Promise<void> {
    setTermsOfServiceAgreed(value => !value);
  }

  async function submitRequest(): Promise<void> {
    const requestParameters : any[] = [];
    for (const parameter of parameters) {
      // Only pass parameter if form parameter is not disabled
      if (!parameter.formDisableCondition || !checkCondition(parameter.formDisableCondition, parameterState)) {
        requestParameters.push({
          name: parameter.name,
          resourceIndex: parameter.resourceIndex,
          value: parameterState[parameter.name],
          variable: parameter.variable,
        })
      }
    }

    const resourceClaim = await createServiceRequest({
      catalogItem: catalogItem,
      catalogNamespace: catalogNamespace,
      parameters: requestParameters,
    });

    history.push(`/services/ns/${resourceClaim.metadata.namespace}/item/${resourceClaim.metadata.name}`);
  }

  const catalogRequestForm = (catalogItem && parameterState) ? (
    <Form className="rhpds-catalog-request-form">
      { (formGroups).map(formGroup => {
        const invalidParameter = formGroup.parameters.find(parameter => (parameterValidationState[parameter.name] === false));
        // TODO: string required but boolean is used. 
        const validated : any= invalidParameter ? false : (
          formGroup.parameters.find(parameter => (parameterValidationState[parameter.name] === true))
        ) ? true : null;
        return (
          <FormGroup
            key={formGroup.key}
            fieldId={"ID"}
            label={formGroup.formGroupLabel}
            helperText={
              <FormHelperText icon={<ExclamationCircleIcon />} isHidden={validated !== false} isError={validated === false}>{ invalidParameter?.description }</FormHelperText>
            }
            validated={validated}
          >
            { formGroup.parameters.map(parameter => (
              <DynamicFormInput
                key={parameter.name}
                isDisabled={parameter.formDisableCondition && checkCondition(parameter.formDisableCondition, parameterState)}
                parameter={parameter}
                value={parameterState[parameter.name]}
                onChange={(value: any, isValid=null) => {
                  setParameterState(state => Object.assign({}, state, {[parameter.name]: value}));
                  if (isValid !== null) {
                    setParameterValidationState(state => Object.assign({}, state, {[parameter.name]: isValid}));
                  }
                }}
              />
            )) }
          </FormGroup>
        )
      } ) }
      { catalogItem?.spec?.termsOfService ? (
        <TermsOfService
          agreed={termsOfServiceAgreed}
          onChange={onTermsOfServiceChange}
          text={catalogItem.spec.termsOfService}
        />
      ) : null }
      <ActionList>
        <ActionListItem>
          <Button
            isDisabled={!submitRequestEnabled}
            onClick={submitRequest}
          >
            Request
          </Button>
        </ActionListItem>
        <ActionListItem>
          <Button variant="secondary" onClick={cancelRequest}>
            Cancel
          </Button>
        </ActionListItem>
      </ActionList>
    </Form>
  ) : null;

  return (
    <PageSection variant={PageSectionVariants.light}>
      <Title headingLevel="h1" size="lg">Request {catalogItem && displayName(catalogItem)}</Title>
      { parameters.length > 0 ? (
        <p>Request by completing the form. Default values may be provided.</p>
      ) : null }
      {catalogRequestForm}
    </PageSection>
  );
}

export default CatalogRequest;
