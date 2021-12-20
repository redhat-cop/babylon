import React from 'react';
import { useSelector } from 'react-redux';
import { useHistory } from 'react-router-dom';

import {
  ActionList,
  ActionListItem,
  Button,
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
import { CatalogItem, CatalogNamespace, ResourceClaim } from '@app/types';
import { checkAccessControl, checkCondition, displayName } from '@app/util';

import DynamicFormInput from '@app/components/DynamicFormInput';
import LoadingIcon from '@app/components/LoadingIcon';
import TermsOfService from '@app/components/TermsOfService';

import './catalog-request.css';

interface CatalogItemRequestFormProps {
  catalogItem: CatalogItem;
  onCancel: () => void;
}

const CatalogItemRequestForm: React.FunctionComponent<CatalogItemRequestFormProps> = ({
  catalogItem,
  onCancel,
}) => {
  const history = useHistory();
  const [termsOfServiceAgreed, setTermsOfServiceAgreed] = React.useState(false);
  const [parameterState, setParameterState] = React.useState({});
  const [parameterValidationState, setParameterValidationState] = React.useState({});

  const catalogNamespace:CatalogNamespace = useSelector(
    (state) => selectCatalogNamespace(state, catalogItem.metadata.namespace)
  );

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
          variable: parameter.variable,
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

  // Initialize value to defaults
  React.useEffect(() => {
    setParameterState(parameterDefaults);
  }, [catalogItem.metadata.uid])

  return (
    <PageSection variant={PageSectionVariants.light} className="catalog-item-actions">
      <Title headingLevel="h1" size="lg">Request {displayName(catalogItem)}</Title>
      { parameters.length > 0 ? (
        <p>Request by completing the form. Default values may be provided.</p>
      ) : null }
      <Form className="catalog-request-form">
        { (formGroups).map(formGroup => {
          const invalidParameter = formGroup.parameters.find(
            parameter => (parameterValidationState[parameter.name] === false)
          );
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
