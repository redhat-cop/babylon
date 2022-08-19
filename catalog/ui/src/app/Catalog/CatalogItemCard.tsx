import React, { useMemo } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Badge, CardBody, CardHeader, Split, SplitItem, Title } from '@patternfly/react-core';
import { CatalogItem } from '@app/types';
import CatalogItemIcon from './CatalogItemIcon';
import { formatString, getDescription, getIsDisabled, getProvider, getStage, getStatus } from './catalog-utils';
import StatusPageIcons from '@app/components/StatusPageIcons';
import SlaIcon, { SUPPORT_LEVELS } from '@app/components/SlaIcon';
import { displayName, renderContent, stripHtml } from '@app/util';

import './catalog-item-card.css';

const CatalogItemCard: React.FC<{ catalogItem: CatalogItem }> = ({ catalogItem }) => {
  const location = useLocation();
  const { namespace } = useParams();
  const navigate = useNavigate();
  const level = useMemo(() => {
    const randomNumber = Math.floor(Math.random() * SUPPORT_LEVELS.length);
    return SUPPORT_LEVELS[randomNumber];
  }, []);
  const urlSearchParams = new URLSearchParams(location.search);
  const { description, descriptionFormat } = getDescription(catalogItem);
  const provider = getProvider(catalogItem);
  const stage = getStage(catalogItem);
  const isDisabled = getIsDisabled(catalogItem);
  const { code: status } = getStatus(catalogItem);

  if (!urlSearchParams.has('item')) {
    if (namespace) {
      urlSearchParams.set('item', catalogItem.metadata.name);
    } else {
      urlSearchParams.set('item', `${catalogItem.metadata.namespace}/${catalogItem.metadata.name}`);
    }
  }

  return (
    <div className="catalog-item-card__wrapper">
      {stage === 'prod' ? (
        <a href="/support" className="catalog-item-card__support">
          <SlaIcon level={level} className="catalog-item-card__sla-icon" />
        </a>
      ) : null}
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
            {stage !== 'prod' ? (
              <SplitItem className="catalog-item-card__badges" isFilled>
                <Badge className={`catalog-item-card__badges--${stage}`}>
                  {stage === 'dev' ? 'development' : stage}
                </Badge>
              </SplitItem>
            ) : null}
          </Split>
        </CardHeader>
        <CardBody className="catalog-item-card__body">
          <Title className="catalog-item-card__title" headingLevel="h3">
            {displayName(catalogItem)}
          </Title>
          <Title className="catalog-item-card__subtitle" headingLevel="h6">
            provided by {formatString(provider)}
          </Title>
          <div className="catalog-item-card__description">
            {description
              ? stripHtml(renderContent(description, { format: descriptionFormat })).slice(0, 150)
              : 'No description available.'}
          </div>
        </CardBody>
      </Link>
    </div>
  );
};

export default CatalogItemCard;
