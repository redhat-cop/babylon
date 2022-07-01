import React from 'react';
import { Link, useLocation, useRouteMatch } from 'react-router-dom';
import { Badge, CardBody, CardHeader, Split, SplitItem, Title } from '@patternfly/react-core';
import { CatalogItem } from '@app/types';
import { displayName, renderContent, stripHtml } from '@app/util';
import CatalogItemIcon from './CatalogItemIcon';
import { getDescription, getIsDisabled, getProvider, getStage, getStatus } from './catalog-utils';
import StatusPageIcons from '@app/components/StatusPageIcons';

import './catalog-item-card.css';

const CatalogItemCard: React.FC<{ catalogItem: CatalogItem }> = ({ catalogItem }) => {
  const location = useLocation();
  const routeMatch = useRouteMatch<any>('/catalog/:namespace?');
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
      className={`catalog-item-card ${isDisabled ? 'catalog-item-card--disabled' : ''}`}
      to={`${location.pathname}?${urlSearchParams.toString()}`}
    >
      <CardHeader className="catalog-item-card__header">
        <Split>
          <SplitItem>
            <CatalogItemIcon catalogItem={catalogItem} />
            {status && status !== 'operational' ? (
              <StatusPageIcons status={status} className="catalog-item-card__statusPageIcon" />
            ) : null}
          </SplitItem>
          <SplitItem className="catalog-item-card__badges" isFilled>
            {stage === 'dev' ? (
              <Badge className="catalog-item-card__badges--dev">development</Badge>
            ) : stage === 'test' ? (
              <Badge className="catalog-item-card__badges--test">test</Badge>
            ) : null}
          </SplitItem>
        </Split>
      </CardHeader>
      <CardBody className="catalog-item-card__body">
        <Title className="catalog-item-card__title" headingLevel="h3">
          {displayName(catalogItem)}
        </Title>
        <Title className="catalog-item-card__subtitle" headingLevel="h6">
          provided by {provider.replace(/_/g, ' ')}
        </Title>
        <div className="catalog-item-card__description">
          {description
            ? stripHtml(renderContent(description, { format: descriptionFormat }))
            : 'No description available.'}
        </div>
      </CardBody>
    </Link>
  );
};

export default CatalogItemCard;
