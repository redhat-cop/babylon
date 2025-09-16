// @ts-nocheck
import React from 'react';
import { Tab, Tabs, TabTitleText, Tooltip } from '@patternfly/react-core';
import { CatalogItem } from '@app/types';
import InfoAltIcon from '@patternfly/react-icons/dist/js/icons/info-alt-icon';
import { formatString, getCategory } from './catalog-utils';

import './catalog-category-selector.css';

const CATEGORIES_DEFINITIONS = {
  labs: "Environments used to increase user's skills and knowledge",
  demos: 'Environments used to showcase and demonstrate solutions to customers',
  workshops: 'Environments used to provide a hands-on experience to our customers with our solutions',
  open_environments:
    'Environments allowing access to different cloud providers without instructions on what to do with the environment',
  red_hat_one:
    'Red Hat One is where the Global Sales organization unites as one selling, services, customer success, and partner team to move as one, from day one.',
};

const CatalogCategorySelector: React.FC<{
  catalogItems: CatalogItem[];
  onSelect: (category: string) => void;
  selected: string;
  isVertical?: boolean;
}> = ({ catalogItems, onSelect, selected, isVertical = true }) => {
  const categories = Array.from(
    new Set((catalogItems || []).map((ci) => getCategory(ci)).filter((category) => category !== null)),
  );
  categories.sort((a, b) => {
    const av = (a as string).toUpperCase();
    const bv = (b as string).toUpperCase();
    if (av == 'OTHER') {
      return 1;
    } else if (bv == 'OTHER') {
      return -1;
    } else {
      return av < bv ? -1 : av > bv ? 1 : 0;
    }
  });

  return (
    <Tabs
      className="catalog-category-selector"
      isVertical={isVertical}
      activeKey={selected || 'all'}
      onSelect={(event, category) => (category === 'all' ? onSelect(null) : onSelect(`${category}`))}
    >
      <Tab eventKey="all" title={<TabTitleText>All Items</TabTitleText>} aria-label="All Items"></Tab>
      <Tab
        eventKey="favorites"
        title={
          <TabTitleText>
            Favorites{' '}
            <Tooltip content="Items marked as favorite">
              <InfoAltIcon
                style={{
                  paddingTop: 'var(--pf-t--global--spacer--xs)',
                  marginLeft: 'var(--pf-t--global--spacer--sm)',
                  width: 'var(--pf-t--global--icon--size--font--xs)',
                }}
              />
            </Tooltip>
          </TabTitleText>
        }
        aria-label="Favorites"
      ></Tab>
      {categories.map((category) => {
        return (
          <Tab
            key={category}
            eventKey={category}
            title={
              <TabTitleText>
                {formatString(category)}
                {category.toLowerCase() in CATEGORIES_DEFINITIONS ? (
                  <Tooltip content={CATEGORIES_DEFINITIONS[category.toLowerCase()]}>
                    <InfoAltIcon
                      style={{
                        paddingTop: 'var(--pf-t--global--spacer--xs)',
                        marginLeft: 'var(--pf-t--global--spacer--sm)',
                        width: 'var(--pf-t--global--icon--size--font--xs)',
                      }}
                    />
                  </Tooltip>
                ) : null}
              </TabTitleText>
            }
            aria-label={formatString(category)}
          ></Tab>
        );
      })}
    </Tabs>
  );
};

export default CatalogCategorySelector;
