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
}> = ({ catalogItems, onSelect, selected }) => {
  const categories = Array.from(
    new Set((catalogItems || []).map((ci) => getCategory(ci)).filter((category) => category !== null))
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
      isVertical
      className="catalog-category-selector"
      activeKey={selected || 'all'}
      onSelect={(event, category) => (category === 'all' ? onSelect(null) : onSelect(`${category}`))}
      inset={{
        default: 'insetNone',
        sm: 'insetNone',
        md: 'insetNone',
        lg: 'insetNone',
        xl: 'insetNone',
        '2xl': 'insetNone',
      }}
    >
      <Tab key="all" eventKey="all" title={<TabTitleText>All Items</TabTitleText>} aria-controls=""></Tab>
      {categories.map((category) => (
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
                      paddingTop: 'var(--pf-global--spacer--xs)',
                      marginLeft: 'var(--pf-global--spacer--sm)',
                      width: 'var(--pf-global--icon--FontSize--sm)',
                    }}
                  />
                </Tooltip>
              ) : null}
            </TabTitleText>
          }
        ></Tab>
      ))}
    </Tabs>
  );
};

export default CatalogCategorySelector;
