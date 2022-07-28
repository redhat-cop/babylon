import React from 'react';
import { Link, useLocation, useRouteMatch } from 'react-router-dom';
import { Badge, Card, CardBody, CardHeader, Title } from '@patternfly/react-core';
import { CatalogItem } from '@app/types';
import StatusPageIcons from '@app/components/StatusPageIcons';
import CatalogItemIcon from './CatalogItemIcon';
import { formatString, getDescription, getIsDisabled, getProvider, getStage, getStatus } from './catalog-utils';
import { displayName, renderContent, stripHtml } from '@app/util';

import './catalog-item-list-item.css';

const CatalogItemListItem: React.FC<{ catalogItem: CatalogItem }> = ({ catalogItem }) => {
  const location = useLocation();
  const routeMatch = useRouteMatch<{ namespace: string }>('/catalog/:namespace?');
  const urlSearchParams = new URLSearchParams(location.search);
  const { description, descriptionFormat } = getDescription(catalogItem);
  const provider = getProvider(catalogItem);
  const stage = getStage(catalogItem);
  const isDisabled = getIsDisabled(catalogItem);
  const { code: status } = getStatus(catalogItem);

  if (!urlSearchParams.has('item')) {
    if (routeMatch.params.namespace) {
      urlSearchParams.set('item', catalogItem.metadata.name);
    } else {
      urlSearchParams.set('item', `${catalogItem.metadata.namespace}/${catalogItem.metadata.name}`);
    }
  }

  return (
    <Link
      className={`catalog-item-list-item${isDisabled ? ' catalog-item-list-item--disabled' : ''}`}
      to={`${location.pathname}?${urlSearchParams.toString()}`}
    >
      <Card className="catalog-item-list-item__card" component="div">
        <CardHeader className="catalog-item-list-item__header">
          <CatalogItemIcon catalogItem={catalogItem} />
          {status && status !== 'operational' ? (
            <StatusPageIcons status={status} className="catalog-item-list-item__statusPageIcon" />
          ) : null}
          {stage === 'dev' ? (
            <Badge className="catalog-item-list-item--dev">development</Badge>
          ) : stage === 'test' ? (
            <Badge className="catalog-item-list-item--test">test</Badge>
          ) : null}
        </CardHeader>
        <CardBody className="catalog-item-list-item__body">
          <Title className="catalog-item-list-item__title" headingLevel="h3">
            {displayName(catalogItem)}
          </Title>
          <Title className="catalog-item-list-item__subtitle" headingLevel="h6">
            provided by {formatString(provider)}
          </Title>
          <div className="catalog-item-list-item__description">
            {description
              ? stripHtml(renderContent(description, { format: descriptionFormat }))
              : 'No description available.'}
          </div>
        </CardBody>
      </Card>
    </Link>
  );
};

export default CatalogItemListItem;
