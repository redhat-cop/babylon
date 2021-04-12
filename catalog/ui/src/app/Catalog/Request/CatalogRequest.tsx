import * as React from 'react';
import { useHistory, useLocation, useRouteMatch, Link } from 'react-router-dom';
import { Button, PageSection, Title } from '@patternfly/react-core';
import { getApiSession, createNamespacedCustomObject, getNamespacedCustomObject } from '@app/api';

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

  async function submitRequest(): void {
    const apiSession = await getApiSession();
    const namespace = apiSession.userNamespace.name;
    const requestResourceClaim = {
      apiVersion: 'poolboy.gpte.redhat.com/v1',
      kind: 'ResourceClaim',
      metadata: {
        labels: {
          'babylon.gpte.redhat.com/catalogitem-namespace': catalogItem.metadata.namespace,
          'babylon.gpte.redhat.com/catalogitem-name': catalogItem.metadata.name,
        }
      },
      spec: {
        resources: JSON.parse(JSON.stringify(catalogItem.spec.resources)),
      }
    };
    requestResourceClaim.metadata.generateName = catalogItem.metadata.name + '-';

    const resourceClaim = await createNamespacedCustomObject(
      'poolboy.gpte.redhat.com', 'v1', namespace, 'resourceclaims', requestResourceClaim
    );

    history.push(`/services/${resourceClaim.metadata.namespace}/${resourceClaim.metadata.name}`);
  }

  const catalogRequestForm = catalogItem ? (
    <div>
      <Button aria-label="Action" onClick={submitRequest}>
        Request
      </Button>
      <Button aria-label="Action" onClick={cancelRequest}>
        Cancel
      </Button>
    </div>
  ) : null;

  return (
    <PageSection>
      <Title headingLevel="h1" size="lg">Request {catalogItem && displayName(catalogItem)}</Title>
      {catalogRequestForm}
    </PageSection>
  );
}

export { CatalogRequest };
