import React, { useMemo } from 'react';
import { Checkbox, Tooltip, Stack, StackItem } from '@patternfly/react-core';
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
  onSelect: (categories: string[]) => void;
  selected: string[];
  isHorizontal?: boolean;
}> = ({ catalogItems, onSelect, selected, isHorizontal = false }) => {
  const categories = useMemo(() => {
    const cats = Array.from(
      new Set((catalogItems || []).map((ci) => getCategory(ci)).filter((category) => category !== null)),
    );
    cats.sort((a, b) => {
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
    return cats;
  }, [catalogItems]);

  const handleCheckboxChange = (category: string, checked: boolean) => {
    const currentSelected = selected || [];
    if (checked) {
      if (!currentSelected.includes(category)) {
        onSelect([...currentSelected, category]);
      }
    } else {
      onSelect(currentSelected.filter((c) => c !== category));
    }
  };

  const isChecked = (category: string) => {
    return (selected || []).includes(category);
  };

  return (
    <Stack className="catalog-category-selector" hasGutter style={isHorizontal ? { flexDirection: 'row', flexWrap: 'wrap' } : undefined}>
      {categories.map((category) => {
        return (
          <StackItem key={category}>
            <Checkbox
              id={`category-${category}`}
              label={
                <>
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
                </>
              }
              isChecked={isChecked(category)}
              onChange={(_, checked) => handleCheckboxChange(category, checked)}
              aria-label={formatString(category)}
            />
          </StackItem>
        );
      })}
    </Stack>
  );
};

export default CatalogCategorySelector;