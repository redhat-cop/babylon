import * as React from 'react';
import './catalog-request.css';

import { useHistory, useLocation, useRouteMatch, Link } from 'react-router-dom';
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
  createNamespacedCustomObject,
  getApiSession,
  getNamespacedCustomObject
} from '@app/api';

import { DefaultTermsOfService  } from './TermsOfService/Default.tsx';

export interface CatalogRequestProps {
  location?: any;
}

const CatalogRequest: React.FunctionComponent<CatalogRequestProps> = ({
  location,
}) => {
  const history = useHistory();

  const catalogRequestRouteMatch = useRouteMatch<IHostsMatchParams>('/catalog/:namespace/:name/request');
  const catalogNamespace = catalogRequestRouteMatch.params.namespace;
  const catalogItemName = catalogRequestRouteMatch.params.name;

  const [catalogItem, setCatalogItem] = React.useState(null);
  const [termsOfServiceAgreed, setTermsOfServiceAgreed] = React.useState(false);
  const [requestName, setRequestName] = React.useState('');

  const requestNameValid = requestName == '' || requestName.match(/^[a-z0-9][a-z0-9\-\.]*[a-z0-9]$/);

  async function loadCatalogItem(): void {
    const resp = await getNamespacedCustomObject('babylon.gpte.redhat.com', 'v1', catalogNamespace, 'catalogitems', catalogItemName);
    setCatalogItem(resp);
  }

  React.useEffect(() => {
    loadCatalogItem();
  }, []);

  function displayName(item): string {
    if (item.metadata.annotations && item.metadata.annotations['babylon.gpte.redhat.com/displayName']) {
      return item.metadata.annotations['babylon.gpte.redhat.com/displayName'];
    } else {
      return item.metadata.name;
    }
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
    const namespace = apiSession.userNamespace.name;
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
        }
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

    const resourceClaim = await createNamespacedCustomObject(
      'poolboy.gpte.redhat.com', 'v1', namespace, 'resourceclaims', requestResourceClaim
    );

    history.push(`/services/${resourceClaim.metadata.namespace}/${resourceClaim.metadata.name}`);
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
