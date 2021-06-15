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
  displayName,
  randomString,
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

  const catalogItem = (
    catalogItems?.[catalogNamespaceName] || []
  ).find(ci => ci.metadata.name === catalogItemName);
  const requestIdValid = requestId.match(/^[a-z0-9]([a-z0-9\-\.]{0,8}[a-z0-9])?$/) ? 'success' : 'error';

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

  const submitRequestEnabled = termsOfServiceAgreed && requestIdValid != 'error';

  const catalogRequestForm = catalogItem ? (
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
