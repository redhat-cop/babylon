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
  TextInput,
  Title
} from '@patternfly/react-core';

import {
  createResourceClaim,
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

import { TermsOfService  } from '@app/components/TermsOfService.tsx';

export interface CatalogRequestProps {
  location?: any;
}

const CatalogRequest: React.FunctionComponent<CatalogRequestProps> = ({
  location,
}) => {
  const history = useHistory();

  const catalogRequestRouteMatch = useRouteMatch<IHostsMatchParams>('/catalog/request/:namespace/:name');
  const catalogNamespaceName = catalogRequestRouteMatch.params.namespace;
  const catalogItemName = catalogRequestRouteMatch.params.name;

  const catalogItems = useSelector(selectCatalogItems);
  const catalogNamespaces = useSelector(selectCatalogNamespaces);
  const userNamespace = useSelector(selectUserNamespace);

  const catalogNamespace = catalogNamespaces.find(ns => ns.name == catalogNamespaceName)

  const [termsOfServiceAgreed, setTermsOfServiceAgreed] = React.useState(false);
  const [requestId, setRequestId] = React.useState(randomString(8));
  const [parameterState, setParameterState] = React.useState(null);

  const catalogItem = (
    catalogItems?.[catalogNamespaceName] || []
  ).find(ci => ci.metadata.name === catalogItemName);
  const requestIdValid = requestId.match(/^[a-z0-9]([a-z0-9\-\.]{0,8}[a-z0-9])?$/) ? 'success' : 'error';

  const submitRequestEnabled = termsOfServiceAgreed && requestIdValid != 'error';
  const formGroups = [];
  const parameters = catalogItem?.spec?.parameters || [];
  const parameterDefaults = {};

  for (const parameter of parameters) {
    const formGroupLabel = parameter.formGroup;
    parameterDefaults[parameter.name] = 'default' in parameter.openAPIV3Schema ? parameter.openAPIV3Schema.default : parameter.value;
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
  if (catalogItem && !parameterState) {
    setParameterState(parameterDefaults);
  }

  function cancelRequest(): void {
    if (location.state) {
      history.goBack();
    } else {
      history.push('/catalog');
    }
  }

  async function onTermsOfServiceChange(): void {
    setTermsOfServiceAgreed(value => !value);
  }

  async function submitRequest(): void {
    const apiSession = await getApiSession();
    const namespace = userNamespace.name;
    const requestResourceClaim = {
      apiVersion: 'poolboy.gpte.redhat.com/v1',
      kind: 'ResourceClaim',
      metadata: {
        annotations: {
          'babylon.gpte.redhat.com/catalogDisplayName': catalogNamespace?.displayName || catalogNamespaceName,
          'babylon.gpte.redhat.com/catalogItemDisplayName': displayName(catalogItem),
        },
        labels: {
          'babylon.gpte.redhat.com/catalogItemName': catalogItem.metadata.name,
          'babylon.gpte.redhat.com/catalogItemNamespace': catalogItem.metadata.namespace,
        },
        name: `${catalogItem.metadata.name}-${requestId}`,
        namespace: namespace,
      },
      spec: {
        resources: JSON.parse(JSON.stringify(catalogItem.spec.resources)),
      }
    };

    for (const [key, value] of Object.entries(catalogItem.metadata.annotations)) {
      if (key.startsWith('babylon.gpte.redhat.com/') && key.endsWith('-message-template')) {
        requestResourceClaim.metadata.annotations[key] = value;
      }
    }

    for (const parameter of parameters) {
      const varName = parameter.variable || parameter.name;
      for (const resourceIndex in requestResourceClaim.spec.resources) {
        const resource = requestResourceClaim.spec.resources[resourceIndex];
        if (parameter.resourceIndex != null && resourceIndex != parameter.resourceIndex) {
          continue;
        }
        recursiveAssign(resource, {template: {spec: {vars: {job_vars: {[varName]: parameterState[parameter.name]}}}}})
      }
    }

    const resourceClaim = await createResourceClaim(requestResourceClaim, {
      skipUpdateStore: true,
    });

    const baseUrl = window.location.href.replace(/^([^/]+\/\/[^\/]+)\/.*/, "$1");
    const name = resourceClaim.metadata.name;
    const shortName = name.substring(catalogItem.metadata.name.length + 1);

    await patchResourceClaim(namespace, name, {
      metadata: {
        annotations: {
          'babylon.gpte.redhat.com/shortName': shortName,
          'babylon.gpte.redhat.com/url': `${baseUrl}/services/item/${namespace}/${name}`,
        }
      }
    });

    history.push(`/services/item/${resourceClaim.metadata.namespace}/${resourceClaim.metadata.name}`);
  }

  const catalogRequestForm = (catalogItem && parameterState) ? (
    <Form className="rhpds-catalog-request-form">
      <FormGroup label="Request Identifier"
        helperText={
          <FormHelperText icon={<ExclamationCircleIcon />} isHidden={requestIdValid != 'failed'}>...</FormHelperText>
        }
        helperTextInvalid="Identity must start and end with a letter or number; contain only letters, numbers, hyphen, and period; and be ten characters or less."
        helperTextInvalidIcon={<ExclamationCircleIcon />}
        validated={requestIdValid}
      >
        <TextInput type="text" id="requestIdentity" name="requestIdentity"
          onChange={(value) => setRequestId(value)}
          value={requestId}
          validated={requestIdValid}
        />
      </FormGroup>
      { (formGroups).map(formGroup => (
        <FormGroup
          key={formGroup.key}
          label={formGroup.formGroupLabel}
        >
        { formGroup.parameters.map(parameter => (
          (parameter.openAPIV3Schema?.type === 'boolean') ? (
            <Checkbox
              key={parameter.name}
              id={parameter.name}
              name={parameter.name}
              label={parameter.formLabel || parameter.name}
              isChecked={parameterState[parameter.name]}
              isDisabled={parameter.formDisableCondition && checkCondition(parameter.formDisableCondition, parameterState)}
              onChange={(checked) => setParameterState(state => Object.assign({}, state, {[parameter.name]: checked}))}
            />
          ) : (parameter.openAPIV3Schema?.type === 'integer') ? (
            <NumberInput
              key={parameter.name}
              id={parameter.name}
              isDisabled={parameter.formDisableCondition && checkCondition(parameter.formDisableCondition, parameterState)}
              min={parameter.openAPIV3Schema.minmum || 0}
              max={parameter.openAPIV3Schema.maximum}
              onChange={(event) => setParameterState(state => Object.assign({}, state, {[parameter.name]: isNaN(event.target.value) ? state[parameter.name] : Number(event.target.value)}))}
              onMinus={() => setParameterState(state => Object.assign({}, state, {[parameter.name]: state[parameter.name] - 1}))}
              onPlus={() => setParameterState(state => Object.assign({}, state, {[parameter.name]: state[parameter.name] + 1}))}
              value={parameterState[parameter.name]}
            />
          ) : (
            <TextInput type="text"
              key={parameter.name}
              id={parameter.name}
              isDisabled={parameter.formDisableCondition && checkCondition(parameter.formDisableCondition, parameterState)}
              onChange={(event) => setParameterState(state => Object.assign({}, state, {[parameter.name]: event.target.value}))}
              value={parameterState[parameter.name]}
            />
          )
        )) }
        </FormGroup>
      )) }
      <TermsOfService
        agreed={termsOfServiceAgreed}
        onChange={onTermsOfServiceChange}
        text={catalogItem.spec.termsOfService}
      />
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
      <p>Request by completing the form. Default values may be provided.</p>
      {catalogRequestForm}
    </PageSection>
  );
}

export { CatalogRequest };
