import React from 'react';
import { Link, useLocation, useRouteMatch } from 'react-router-dom';

import { Badge, CardBody, CardHeader, Split, SplitItem, Title } from '@patternfly/react-core';

import { CatalogItem } from '@app/types';
import { displayName, renderContent } from '@app/util';

import CatalogItemIcon from './CatalogItemIcon';
import { getDescription, getProvider, getStage } from './catalog-utils';

const CatalogItemCard: React.FunctionComponent<{ catalogItem: CatalogItem }> = ({ catalogItem }) => {
  const location = useLocation();
  const routeMatch = useRouteMatch<any>('/catalog/:namespace?');
  const urlSearchParams = new URLSearchParams(location.search);
  const { description, descriptionFormat } = getDescription(catalogItem);
  const provider = getProvider(catalogItem);
  const stage = getStage(catalogItem);

  if (routeMatch.params.namespace) {
    urlSearchParams.set('item', catalogItem.metadata.name);
  } else {
    urlSearchParams.set('item', `${catalogItem.metadata.namespace}/${catalogItem.metadata.name}`);
  }

  return (
    <Link className="catalog-item-card" to={`${location.pathname}?${urlSearchParams.toString()}`}>
      <CardHeader className="catalog-item-card-header">
        <Split>
          <SplitItem>
            <CatalogItemIcon catalogItem={catalogItem} />
          </SplitItem>
          <SplitItem className="catalog-item-badges" isFilled>
            {stage === 'dev' ? (
              <Badge className="catalog-dev-badge">development</Badge>
            ) : stage === 'test' ? (
              <Badge className="catalog-test-badge">test</Badge>
            ) : null}
          </SplitItem>
        </Split>
      </CardHeader>
      <CardBody className="catalog-item-card-body">
        <Title className="catalog-item-card-title" headingLevel="h3">
          {displayName(catalogItem)}
        </Title>
        <Title className="catalog-item-card-subtitle" headingLevel="h4">
          provided by {provider.replace(/_/g, ' ')}
        </Title>
        <div
          className="catalog-item-card-description"
          dangerouslySetInnerHTML={{
            __html: description
              ? renderContent(description, { format: descriptionFormat })
              : 'No description available.',
          }}
        />
      </CardBody>
    </Link>
  );
};

export default CatalogItemCard;
