import React from 'react';
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
  Title,
} from '@patternfly/react-core';
import {
  ExclamationCircleIcon,
} from '@patternfly/react-icons';

import { createServiceRequest } from '@app/api';
import { selectCatalogNamespace, selectUserIsAdmin } from '@app/store';
import { CatalogItem, CatalogItemSpecParameter, CatalogNamespace, ResourceClaim } from '@app/types';
import { checkAccessControl, checkCondition, displayName } from '@app/util';

import DynamicFormInput from '@app/components/DynamicFormInput';
import LoadingIcon from '@app/components/LoadingIcon';
import TermsOfService from '@app/components/TermsOfService';

import './catalog-request.css';

interface CatalogItemRequestFormProps {
  catalogItem: CatalogItem;
  onCancel: () => void;
}

interface ParameterFormGroup {
  formGroupLabel: string;
  isRequired?: boolean;
  key: string;
  parameters: any[];
}

const CatalogItemRequestForm: React.FunctionComponent<CatalogItemRequestFormProps> = ({
  catalogItem,
  onCancel,
}) => {
  const history = useHistory();
  const [termsOfServiceAgreed, setTermsOfServiceAgreed] = React.useState<boolean>(false);
  const [parameterFormGroups, setParameterFormGroups] = React.useState<ParameterFormGroup[]>(undefined);
  const [parameterDefaults, setParameterDefaults] = React.useState<any>(undefined);
  const [parameterState, setParameterState] = React.useState<any>(undefined);
  const [parameterValidationState, setParameterValidationState] = React.useState({});

  const catalogNamespace:CatalogNamespace = useSelector(
    (state) => selectCatalogNamespace(state, catalogItem.metadata.namespace)
  );

  const parameters = catalogItem.spec.parameters || [];

  // Enable submit if:
  // - terms of service is agreed
  // - no parameter vars are invalid
  // - all required parameters have values
  const submitRequestEnabled : boolean = (
    (parameterState ? true : false) &&
    (termsOfServiceAgreed || !catalogItem.spec.termsOfService) &&
    Object.values(parameterValidationState).find(v => v === false) !== false &&
    (parameters.find(parameter => parameter.required && parameterState[parameter.name] === null) ? false : true)
  );

  function onTermsOfServiceChange(agreed: boolean): void {
    setTermsOfServiceAgreed(agreed);
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
        })
      }
    }

    const resourceClaim = await createServiceRequest({
      catalogItem: catalogItem,
      catalogNamespace: catalogNamespace,
      parameters: requestParameters,
    });

    history.push(`/services/${resourceClaim.metadata.namespace}/${resourceClaim.metadata.name}`);
  }

  // Initialize form groups for parameters and default vaules
  React.useEffect(() => {
    const defaults : {[key:string]: any} = {};
    const formGroups : ParameterFormGroup[] = [];
    for (const parameter of parameters) {
      // Parameter default can be in OpenAPI schema or simply as value.
      if (parameter.openAPIV3Schema.default !== undefined) {
        defaults[parameter.name] = parameter.openAPIV3Schema.default;
      } else {
        defaults[parameter.name] = parameter.value || null;
      }

      if (parameter.formGroup) {
        const formGroup = formGroups.find(item => item.formGroupLabel === parameter.formGroup);
        if (formGroup) {
          formGroup.parameters.push(parameter);
        } else {
          formGroups.push({
            formGroupLabel: parameter.formGroup,
            key: parameter.formGroup,
            parameters: [parameter],
          });
        }
      } else {
        formGroups.push({
          formGroupLabel: parameter.formLabel || parameter.name,
          isRequired: parameter.required,
          key: parameter.name,
          parameters: [parameter]
        });
      }
    }

    setParameterDefaults(defaults);
    setParameterFormGroups(formGroups);
    setParameterState(defaults);
  }, [catalogItem.metadata.uid])

  if (!parameterState) {
    return (
      <PageSection>
        <EmptyState variant="full">
          <EmptyStateIcon icon={LoadingIcon} />
        </EmptyState>
      </PageSection>
    );
  }

  return (
    <PageSection variant={PageSectionVariants.light} className="catalog-item-actions">
      <Title headingLevel="h1" size="lg">Request {displayName(catalogItem)}</Title>
      { parameters.length > 0 ? (
        <p>Request by completing the form. Default values may be provided.</p>
      ) : null }
      <Form className="catalog-request-form">
        { (parameterFormGroups).map(formGroup => {
          const invalidParameter = formGroup.parameters.find(
            parameter => (parameterValidationState[parameter.name] === false)
          );
          const validated : 'default' | 'error' | 'success' | 'warning' = invalidParameter ? 'error' : (
            formGroup.parameters.find(parameter => (parameterValidationState[parameter.name] === true))
          ) ? 'success' : 'default';
          return (
            <FormGroup
              key={formGroup.key}
              fieldId={"ID"}
              isRequired={formGroup.isRequired}
              label={formGroup.formGroupLabel}
              helperText={
                <FormHelperText
                  icon={<ExclamationCircleIcon />}
                  isError={validated === 'error'}
                  isHidden={validated !== 'error'}
                >{ invalidParameter?.description }</FormHelperText>
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
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </ActionListItem>
        </ActionList>
      </Form>
    </PageSection>
  );
}

export default CatalogItemRequestForm;
