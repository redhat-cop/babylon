import React, { useMemo } from 'react';
import { useHistory, useLocation, useRouteMatch } from 'react-router-dom';
import { EmptyState, EmptyStateBody, EmptyStateIcon, PageSection, Title } from '@patternfly/react-core';
import useSWR from 'swr';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';
import { apiPaths, fetcher } from '@app/api';
import { CatalogItem } from '@app/types';
import CatalogItemRequestForm from './CatalogItemRequestForm';
import CatalogItemWorkshopForm from './CatalogItemWorkshopForm';
import { ErrorBoundary } from 'react-error-boundary';

import './catalog.css';

const CatalogItemFormData: React.FC<{ namespace: string; catalogItemName: string }> = ({
  namespace,
  catalogItemName,
}) => {
  const history = useHistory();
  const location = useLocation();

  const urlSearchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const showWorkshopForm: boolean = urlSearchParams.get('request') === 'workshop';

  const { data: catalogItem } = useSWR<CatalogItem>(
    apiPaths.CATALOG_ITEM({ namespace, name: catalogItemName }),
    fetcher
  );

  if (showWorkshopForm) {
    return <CatalogItemWorkshopForm catalogItem={catalogItem} onCancel={history.goBack} />;
  }
  return <CatalogItemRequestForm catalogItem={catalogItem} onCancel={history.goBack} />;
};

const CatalogItemForm: React.FC = () => {
  const routeMatch = useRouteMatch<{ namespace: string; catalogItem: string }>(
    '/catalog/:namespace/order/:catalogItem'
  );
  const { catalogItem: catalogItemName, namespace }: { catalogItem: string; namespace: string } = routeMatch.params;
  return (
    <ErrorBoundary
      fallbackRender={() => (
        <PageSection>
          <EmptyState variant="full">
            <EmptyStateIcon icon={ExclamationTriangleIcon} />
            <Title headingLevel="h1" size="lg">
              Catalog item not found.
            </Title>
            <EmptyStateBody>
              CatalogItem {catalogItemName} was not found in {namespace}
            </EmptyStateBody>
          </EmptyState>
        </PageSection>
      )}
    >
      <CatalogItemFormData catalogItemName={catalogItemName} namespace={namespace} />
    </ErrorBoundary>
  );
};

export default CatalogItemForm;
