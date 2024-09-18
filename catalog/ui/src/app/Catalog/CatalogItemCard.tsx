import React from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { Badge, CardBody, CardHeader, Split, SplitItem, Title, Tooltip } from '@patternfly/react-core';
import { CatalogItem } from '@app/types';
import StatusPageIcons from '@app/components/StatusPageIcons';
import { displayName, renderContent, stripHtml } from '@app/util';
import StarRating from '@app/components/StarRating';
import { formatString, getDescription, getProvider, getRating, getStage, getStatus, getSLA } from './catalog-utils';
import CatalogItemIcon from './CatalogItemIcon';

import './catalog-item-card.css';

const CatalogItemCard: React.FC<{ catalogItem: CatalogItem }> = ({ catalogItem }) => {
  const location = useLocation();
  const { namespace } = useParams();
  const [searchParams] = useSearchParams();
  const { description, descriptionFormat } = getDescription(catalogItem);
  const provider = getProvider(catalogItem);
  const stage = getStage(catalogItem);
  const rating = getRating(catalogItem);
  const status = getStatus(catalogItem);
  const sla = getSLA(catalogItem);

  if (namespace) {
    searchParams.set('item', catalogItem.metadata.name);
  } else {
    searchParams.set('item', `${catalogItem.metadata.namespace}/${catalogItem.metadata.name}`);
  }

  return (
    <div className="catalog-item-card__wrapper">
      <div className="catalog-item-card__badge">
        {sla && stage === 'prod' ? (
          <Tooltip content={<p>Service Level</p>}>
            <a href="/support" target="_blank" rel="nofollow noreferrer">
              <Badge className="catalog-item-card__badge--sla">{sla.replace(/_+/g, ' | ')}</Badge>
            </a>
          </Tooltip>
        ) : stage === 'dev' ? (
          <Badge className="catalog-item-card__badge--dev">development</Badge>
        ) : stage === 'test' ? (
          <Badge className="catalog-item-card__badge--test">test</Badge>
        ) : stage === 'event' ? (
          <Badge className="catalog-item-card__badge--event">event</Badge>
        ) : null}
      </div>
      <Link
        className={`catalog-item-card ${status && status.disabled ? 'catalog-item-card--disabled' : ''}`}
        to={`${location.pathname}?${searchParams.toString()}`}
      >
        <CardHeader className="catalog-item-card__header">
          <Split>
            <SplitItem>
              <CatalogItemIcon catalogItem={catalogItem} />
              {status && status.name !== 'Operational' ? (
                <StatusPageIcons status={status.name} className="catalog-item-card__statusPageIcon" />
              ) : null}
            </SplitItem>
          </Split>
        </CardHeader>
        <CardBody className="catalog-item-card__body">
          <Title className="catalog-item-card__title" headingLevel="h3">
            {displayName(catalogItem)}
          </Title>
          <Title className="catalog-item-card__subtitle" headingLevel="h6">
            provided by {formatString(provider)}
          </Title>
          {description ? (
            <div className="catalog-item-card__description">
              {stripHtml(renderContent(description, { format: descriptionFormat })).slice(0, 150)}
            </div>
          ) : null}
          <div className="catalog-item-card__rating">
            <StarRating count={5} rating={rating?.ratingScore} total={rating?.totalRatings} readOnly hideIfNotRated />
          </div>
        </CardBody>
      </Link>
    </div>
  );
};

export default CatalogItemCard;
