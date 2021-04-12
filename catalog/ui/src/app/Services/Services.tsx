import * as React from 'react';
import { useHistory, useLocation, useRouteMatch, Link } from 'react-router-dom';
import { Button, PageSection, Title } from '@patternfly/react-core';
import { getApiSession, deleteNamespacedCustomObject, listNamespacedCustomObject } from '@app/api';
import TimesIcon from '@patternfly/react-icons/dist/js/icons/times-icon';

export interface ServicesProps {
  location?: any;
}

const Services: React.FunctionComponent<ServicesProps> = ({
  location,
}) => {
  const history = useHistory();

  const resourceClaimNamespaceRouteMatch = useRouteMatch<IHostsMatchParams>('/services/:namespace');
  const resourceClaimRouteMatch = useRouteMatch<IHostsMatchParams>('/services/:namespace/:name');

  const resourceClaimNamespace = (
    resourceClaimRouteMatch ? resourceClaimRouteMatch.params.namespace :
    resourceClaimNamespaceRouteMatch ? resourceClaimNamespaceRouteMatch.params.namespace : null
  );
  const resourceClaimName = (
    resourceClaimRouteMatch ? resourceClaimRouteMatch.params.name : null
  );

  const [resourceClaims, setResourceClaims] = React.useState({});

  const selectedResourceClaim = (
    resourceClaimName && resourceClaims[resourceClaimNamespace]
    ? resourceClaims[resourceClaimNamespace].find(resourceClaim => resourceClaim.metadata.name === resourceClaimName) : null
  );

  async function deleteSelectedResourceClaim(): void {
    await deleteNamespacedCustomObject('poolboy.gpte.redhat.com', 'v1', resourceClaimNamespace, 'resourceclaims', resourceClaimName);
    await refreshResourceClaimsFromNamespace(resourceClaimNamespace);
    history.push('/services');
  }

  async function refreshResourceClaimsFromNamespace(namespace): void {
    const resp = await listNamespacedCustomObject('poolboy.gpte.redhat.com', 'v1', namespace.name, 'resourceclaims');
    setResourceClaims((state) => {
      const copy = Object.assign({}, state);
      return Object.assign(copy, { [namespace.name]: resp.items })
    });
  }

  async function refreshResourceClaims(): void {
    const session = await getApiSession();
    refreshResourceClaimsFromNamespace(session.userNamespace);
  }

  React.useEffect(() => {
    refreshResourceClaims();
  }, []);

  function displayName(item): string {
    if (item.metadata.annotations && item.metadata.annotations['babylon.gpte.redhat.com/displayName']) {
      return item.metadata.annotations['babylon.gpte.redhat.com/displayName'];
    } else {
      return item.metadata.name;
    }
  }

  function unselectResourceClaim(): void {
    if (location.state) {
      history.goBack();
    } else {
      history.push('/services');
    }
  }

  const selectedResourceClaimDisplay = selectedResourceClaim ? (
    <div>
      <span>Selected: {selectedResourceClaim.metadata.name}</span>
      <Button variant="plain" aria-label="Action" onClick={unselectResourceClaim}>
        <TimesIcon />
      </Button>
      <div><b>Created:</b> {selectedResourceClaim.metadata.creationTimestamp}</div>
      <pre>{JSON.stringify(selectedResourceClaim)}</pre>
      <Button aria-label="Action" onClick={deleteSelectedResourceClaim}>
        Delete
      </Button>
    </div>
  ) : null;

  const filteredResourceClaims = (
    (resourceClaimNamespace ? (resourceClaims[resourceClaimNamespace] || []) : Object.values(resourceClaims).flat())
    .sort((a, b) => displayName(a) > displayName(b))
  );

  const resourceClaimList = filteredResourceClaims.map(
    resourceClaim => (
      <p key={resourceClaim.metadata.uid}>
        <Link
          to={{
            pathname: '/services/' + resourceClaim.metadata.namespace + '/' + resourceClaim.metadata.name,
            state: { fromServices: true },
          }}
        >
          {displayName(resourceClaim)}
        </Link>
      </p>
    )
  );

  return (
    <PageSection>
      <Title headingLevel="h1" size="lg">Services</Title>
      {selectedResourceClaimDisplay}
      {resourceClaimList}
    </PageSection>
  );
}

export { Services };
