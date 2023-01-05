import React from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Badge, CardBody, CardHeader, Split, SplitItem, Title, Tooltip } from '@patternfly/react-core';
import { CatalogItem } from '@app/types';
import StatusPageIcons from '@app/components/StatusPageIcons';
import { displayName, renderContent, stripHtml } from '@app/util';
import StarRating from '@app/components/StarRating';
import {
  formatString,
  getDescription,
  getIsDisabled,
  getProvider,
  getRating,
  getStage,
  getStatus,
  getSLA,
} from './catalog-utils';
import CatalogItemIcon from './CatalogItemIcon';

import './catalog-item-card.css';

const CatalogItemCard: React.FC<{ catalogItem: CatalogItem }> = ({ catalogItem }) => {
  const location = useLocation();
  const { namespace } = useParams();
  const urlSearchParams = new URLSearchParams(location.search);
  const { description, descriptionFormat } = getDescription(catalogItem);
  const provider = getProvider(catalogItem);
  const stage = getStage(catalogItem);
  const isDisabled = getIsDisabled(catalogItem);
  const rating = getRating(catalogItem);
  const { code: status } = getStatus(catalogItem);
  const sla = getSLA(catalogItem);

  if (!urlSearchParams.has('item')) {
    if (namespace) {
      urlSearchParams.set('item', catalogItem.metadata.name);
    } else {
      urlSearchParams.set('item', `${catalogItem.metadata.namespace}/${catalogItem.metadata.name}`);
    }
  }

  return (
    <div className="catalog-item-card__wrapper">
      <div className="catalog-item-card__badges">
        {sla && stage === 'prod' ? (
          <Tooltip content={<p>SLA</p>}>
            <a href="/support" target="_blank" rel="nofollow noreferrer">
              <Badge className="catalog-item-card__badges--sla">{sla.replace(/_+/g, ' | ')}</Badge>
            </a>
          </Tooltip>
        ) : stage === 'dev' ? (
          <Badge className="catalog-item-card__badges--dev">development</Badge>
        ) : stage === 'test' ? (
          <Badge className="catalog-item-card__badges--test">test</Badge>
        ) : null}
      </div>
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
