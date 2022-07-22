import React from 'react';
import { Tab, Tabs, TabTitleText } from '@patternfly/react-core';
import { CatalogItem } from '@app/types';
import { formatString, getCategory } from './catalog-utils';

import './catalog-category-selector.css';

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
      <Tab eventKey="all" title={<TabTitleText>All Items</TabTitleText>} aria-controls=""></Tab>
      {categories.map((category) => (
        <Tab key={category} eventKey={category} title={<TabTitleText>{formatString(category)}</TabTitleText>}></Tab>
      ))}
    </Tabs>
  );
};

export default CatalogCategorySelector;
