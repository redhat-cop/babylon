import React, { useCallback, useState } from 'react';
import { Button, Checkbox, ExpandableSection, Form, FormGroup, Tooltip } from '@patternfly/react-core';
import FilterAltIcon from '@patternfly/react-icons/dist/js/icons/filter-alt-icon';
import { CatalogItem } from '@app/types';
import { BABYLON_DOMAIN, CATALOG_MANAGER_DOMAIN } from '@app/util';
import StarRating from '@app/components/StarRating';
import { formatString, HIDDEN_LABELS, CUSTOM_LABELS } from './catalog-utils';

import './catalog-label-selector.css';

type CatalogLabelValueItemCount = {
  count: number;
  displayName: string;
};

type CatalogLabelValues = {
  displayName: string;
  values: { [value: string]: CatalogLabelValueItemCount };
};

const CatalogLabelSelector: React.FC<{
  catalogItems: CatalogItem[];
  filteredCatalogItems: CatalogItem[];
  onSelect: (labels: { [label: string]: string[] }) => void;
  selected: { [label: string]: string[] };
}> = ({ catalogItems, filteredCatalogItems, onSelect, selected }) => {
  const defaultExpandedLabels: { [label: string]: boolean } = Object.keys(selected).reduce((acc, value) => {
    return { ...acc, [value]: true };
  }, {});
  const [expandedLabels, setExpandedLabels] = useState(defaultExpandedLabels);
  const labels: { [label: string]: CatalogLabelValues } = {};
  for (const catalogItem of catalogItems || []) {
    if (!catalogItem.metadata.labels) continue;
    for (const [label, value] of Object.entries(catalogItem.metadata.labels)) {
      let domain: string = null;
      if (label.startsWith(`${BABYLON_DOMAIN}/`)) {
        domain = BABYLON_DOMAIN;
      } else if (label.startsWith(`${CATALOG_MANAGER_DOMAIN}/`)) {
        domain = CATALOG_MANAGER_DOMAIN;
      }
      if (!domain) continue;
      if (label.toLowerCase() === `${CUSTOM_LABELS.CATEGORY.domain}/${CUSTOM_LABELS.CATEGORY.key}`) continue;

      // Allow multiple values for labels with numeric suffixes
      const attr = label.substring(domain.length + 1).replace(/-[0-9]+$/, '');
      const attrKey = attr.toLowerCase();
      // Only non-hidden labels
      if (!HIDDEN_LABELS.includes(attr)) {
        const valueKey = value.toLowerCase();
        if (!labels[attrKey]) {
          labels[attrKey] = {
            displayName: formatString(attr),
            values: {},
          };
        }
        if (!labels[attrKey].values[valueKey]) {
          labels[attrKey].values[valueKey] = {
            count: 0,
            displayName: formatString(value),
          };
        }
      }
    }
  }

  for (const catalogItem of filteredCatalogItems || []) {
    if (!catalogItem.metadata.labels) continue;
    for (const [label, value] of Object.entries(catalogItem.metadata.labels)) {
      if (label.toLowerCase() === `${CUSTOM_LABELS.CATEGORY.domain}/${CUSTOM_LABELS.CATEGORY.key}`) continue;
      // Allow multiple values for labels with numeric suffixes
      if (label.startsWith(`${BABYLON_DOMAIN}/`)) {
        const attrKey = label.substring(BABYLON_DOMAIN.length + 1).replace(/-[0-9]+$/, '');
        // Only non-hidden labels
        if (!HIDDEN_LABELS.includes(attrKey)) {
          const valueKey = value.toLowerCase();
          labels[attrKey.toLowerCase()].values[valueKey].count++;
        }
      }
      if (label.startsWith(`${CATALOG_MANAGER_DOMAIN}/`)) {
        const attrKey = label.substring(CATALOG_MANAGER_DOMAIN.length + 1).replace(/-[0-9]+$/, '');
        // Only non-hidden labels
        if (!HIDDEN_LABELS.includes(attrKey)) {
          const valueKey = value.toLowerCase();
          labels[attrKey.toLowerCase()].values[valueKey].count++;
        }
      }
    }
  }

  const onChange = useCallback(
    (checked: boolean, changedLabel: string, changedValue: string, isCheckbox = true) => {
      const updated: { [label: string]: string[] } = {};
      for (const [label, values] of Object.entries(selected || {})) {
        if (label === changedLabel) {
          if (isCheckbox) {
            const updatedValues = checked ? [...values, changedValue] : values.filter((v) => v != changedValue);
            if (updatedValues.length > 0) {
              updated[label] = updatedValues;
            }
          } else {
            updated[label] = [changedValue];
          }
        } else {
          updated[label] = values;
        }
      }
      if (checked && !updated[changedLabel]) {
        updated[changedLabel] = [changedValue];
      }
      onSelect(Object.keys(updated).length === 0 ? null : updated);
    },
    [onSelect, selected]
  );

  const onClearFilter = useCallback(
    (filterName) => {
      const updated: { [label: string]: string[] } = {};
      for (const [label, values] of Object.entries(selected || {})) {
        if (label !== filterName) {
          updated[label] = values;
        }
      }
      onSelect(Object.keys(updated).length === 0 ? null : updated);
    },
    [onSelect, selected]
  );

  const featuredLabels = ['sales_play'];
  const lastLabels = [CUSTOM_LABELS.RATING.key];

  const labelsSorted = Object.entries(labels).sort(([a], [b]) => {
    if (lastLabels.includes(a)) return 1;
    if (lastLabels.includes(b)) return -1;
    if (featuredLabels.includes(a)) return -1;
    if (featuredLabels.includes(b)) return 1;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });

  return (
    <Form className="catalog-label-selector">
      {labelsSorted.map(([attrKey, attr]: [string, CatalogLabelValues]) => (
        <ExpandableSection
          key={attrKey}
          isExpanded={expandedLabels[attrKey] || false}
          toggleContent={
            <div style={{ display: 'flex', flexDirection: 'row' }}>
              <p>{attr.displayName}</p>
              {Object.entries(attr.values).some(([valueKey]) =>
                (selected?.[attrKey] || []).includes(valueKey) || attrKey === CUSTOM_LABELS.RATING.key
                  ? selected?.[attrKey]
                  : false
              ) ? (
                <Tooltip content={<div>Clear filter</div>}>
                  <Button
                    variant="plain"
                    component="span"
                    style={{ marginRight: 0, marginLeft: 'auto', padding: 0 }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onClearFilter(attrKey);
                    }}
                  >
                    <FilterAltIcon />
                  </Button>
                </Tooltip>
              ) : null}
            </div>
          }
          onToggle={(isExpanded: boolean) => setExpandedLabels({ ...expandedLabels, [attrKey]: isExpanded })}
        >
          <FormGroup>
            {attrKey !== CUSTOM_LABELS.RATING.key ? (
              Object.entries(attr.values)
                .sort()
                .map(([valueKey, value]: [string, CatalogLabelValueItemCount]) => (
                  <Checkbox
                    id={attrKey + '/' + valueKey}
                    key={attrKey + '/' + valueKey}
                    label={value.displayName + ' (' + value.count + ')'}
                    isChecked={(selected?.[attrKey] || []).includes(valueKey)}
                    onChange={(checked) => onChange(checked, attrKey, valueKey)}
                  />
                ))
            ) : (
              <div>
                {[4, 3, 2, 1].map((rating) => (
                  <Button
                    key={rating}
                    variant="link"
                    onClick={() => onChange(true, CUSTOM_LABELS.RATING.key, rating.toString(), false)}
                    className="catalog-label-selector__rating-btn"
                    isActive={(selected?.[attrKey] || []).includes(rating.toString())}
                  >
                    <StarRating count={5} rating={rating} readOnly hideCounter /> & Up
                  </Button>
                ))}
              </div>
            )}
          </FormGroup>
        </ExpandableSection>
      ))}
    </Form>
  );
};

export default CatalogLabelSelector;
