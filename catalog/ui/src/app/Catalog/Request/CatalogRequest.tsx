import * as React from 'react';

import {
  useSelector,
} from 'react-redux';

import {
  selectCatalogItems,
  selectUserNamespace,
} from '@app/store';

import './catalog-request.css';

import {
  useHistory,
  useRouteMatch,
} from 'react-router-dom';

import {
  ActionList,
  ActionListItem,
  Button,
  Checkbox,
  Form,
  FormGroup,
  PageSection,
  PageSectionVariants,
  TextInput,
  Title
} from '@patternfly/react-core';

import {
  createResourceClaim,
  getApiSession,
  getNamespacedCustomObject
} from '@app/api';

import {
  displayName,
} from '@app/util';

import { DefaultTermsOfService  } from './TermsOfService/Default.tsx';

export interface CatalogRequestProps {
  location?: any;
}

const CatalogRequest: React.FunctionComponent<CatalogRequestProps> = ({
  location,
}) => {
  const history = useHistory();

  const catalogRequestRouteMatch = useRouteMatch<IHostsMatchParams>('/catalog/request/:namespace/:name');
  const catalogNamespace = catalogRequestRouteMatch.params.namespace;
  const catalogItemName = catalogRequestRouteMatch.params.name;

  const catalogItems = useSelector(selectCatalogItems);
  const userNamespace = useSelector(selectUserNamespace);

  const [termsOfServiceAgreed, setTermsOfServiceAgreed] = React.useState(false);
  const [requestName, setRequestName] = React.useState('');

  const catalogItem = (
    catalogItems?.[catalogNamespace] || []
  ).find(ci => ci.metadata.name === catalogItemName);
  const requestNameValid = requestName == '' || requestName.match(/^[a-z0-9][a-z0-9\-\.]*[a-z0-9]$/);

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
          'babylon.gpte.redhat.com/catalogItemDisplayName': displayName(catalogItem),
        },
        labels: {
          'babylon.gpte.redhat.com/catalogItemName': catalogItem.metadata.name,
          'babylon.gpte.redhat.com/catalogItemNamespace': catalogItem.metadata.namespace,
        },
        namespace: namespace,
      },
      spec: {
        resources: JSON.parse(JSON.stringify(catalogItem.spec.resources)),
      }
    };
    if (requestName) {
      requestResourceClaim.metadata.name = requestName;
    } else {
      requestResourceClaim.metadata.generateName = catalogItem.metadata.name + '-';
    }

    const resourceClaim = await createResourceClaim(requestResourceClaim);

    history.push(`/services/item/${resourceClaim.metadata.namespace}/${resourceClaim.metadata.name}`);
  }

  const submitRequestEnabled = termsOfServiceAgreed && requestNameValid;

  const catalogRequestForm = catalogItem ? (
    <Form className="rhpds-catalog-request-form">
      <FormGroup label="Request Name">
        <TextInput type="text" id="name" name="name"
          placeholder={catalogItem.metadata.name + '-*'}
          onChange={(value) => setRequestName(value)}
          validated={requestName == '' ? 'default' : requestNameValid ? 'success' : 'error'}
        />
      </FormGroup>
      <DefaultTermsOfService
        agreed={termsOfServiceAgreed}
        onChange={onTermsOfServiceChange}
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
