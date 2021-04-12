import * as React from 'react';
import { useHistory, useLocation, useRouteMatch, Link } from 'react-router-dom';
import { Button, PageSection, Title } from '@patternfly/react-core';
import { getApiSession, listNamespacedCustomObject } from '@app/api';
import TimesIcon from '@patternfly/react-icons/dist/js/icons/times-icon';

export interface CatalogProps {
  location?: any;
}

const Catalog: React.FunctionComponent<CatalogProps> = ({
  location,
}) => {
  const history = useHistory();

  const catalogNamespaceRouteMatch = useRouteMatch<IHostsMatchParams>('/catalog/:namespace');
  const catalogItemRouteMatch = useRouteMatch<IHostsMatchParams>('/catalog/:namespace/:name');

  const catalogNamespace = (
    catalogItemRouteMatch ? catalogItemRouteMatch.params.namespace :
    catalogNamespaceRouteMatch ? catalogNamespaceRouteMatch.params.namespace : null
  );
  const catalogItemName = (
    catalogItemRouteMatch ? catalogItemRouteMatch.params.name : null
  );

  const [catalogItems, setCatalogItems] = React.useState({});

  const selectedCatalogItem = (
    catalogItemName && catalogItems[catalogNamespace]
    ? catalogItems[catalogNamespace].find(catalogItem => catalogItem.metadata.name === catalogItemName) : null
  );

  async function refreshCatalogFromNamespace(namespace): void {
    const resp = await listNamespacedCustomObject('babylon.gpte.redhat.com', 'v1', namespace.name, 'catalogitems');
    setCatalogItems((state) => {
      const copy = Object.assign({}, state);
      return Object.assign(copy, { [namespace.name]: resp.items })
    });
  }

  async function refreshCatalog(): void {
    const session = await getApiSession();
    session.catalogNamespaces.forEach(namespace => {
      refreshCatalogFromNamespace(namespace);
    })
  }

  React.useEffect(() => {
    refreshCatalog();
  }, []);

  function displayName(item): string {
    if (item.metadata.annotations && item.metadata.annotations['babylon.gpte.redhat.com/displayName']) {
      return item.metadata.annotations['babylon.gpte.redhat.com/displayName'];
    } else {
      return item.metadata.name;
    }
  }

  function requestCatalogItem(): void {
    history.push({
      pathname: `/catalog/${catalogNamespace}/${catalogItemName}/request`,
      state: { fromCatalog: true },
    });
  }

  function unselectCatalogItem(): void {
    if (location.state) {
      history.goBack();
    } else {
      history.push('/catalog');
    }
  }

  const selectedCatalogItemDisplay = selectedCatalogItem ? (
    <div>
      <span>Selected: {selectedCatalogItem.metadata.name}</span>
      <Button aria-label="Action" onClick={requestCatalogItem}>
        Request
      </Button>
      <Button variant="plain" aria-label="Action" onClick={unselectCatalogItem}>
        <TimesIcon />
      </Button>
    </div>
  ) : null;

  const filteredCatalogItems = (
    (catalogNamespace ? (catalogItems[catalogNamespace] || []) : Object.values(catalogItems).flat())
    .sort((a, b) => displayName(a) > displayName(b))
  );

  const catalogItemCards = filteredCatalogItems.map(
    catalogItem => (
      <p key={catalogItem.metadata.uid}>
        <Link
          to={{
            pathname: '/catalog/' + catalogItem.metadata.namespace + '/' + catalogItem.metadata.name,
            state: { fromCatalog: true },
          }}
        >
          {displayName(catalogItem)}
        </Link>
      </p>
    )
  );

  return (
    <PageSection>
      <Title headingLevel="h1" size="lg">Catalog Page Title</Title>
      {selectedCatalogItemDisplay}
      {catalogItemCards}
    </PageSection>
  );
}

export { Catalog };
