import React, { useCallback, useState } from 'react';
import { Button, Checkbox, ExpandableSection, Form, FormGroup, Tooltip } from '@patternfly/react-core';
import { CatalogItem } from '@app/types';
import { BABYLON_DOMAIN } from '@app/util';
import { formatString, HIDDEN_LABELS } from './catalog-utils';

import './catalog-label-selector.css';
import { FilterAltIcon } from '@patternfly/react-icons';

type CatalogLabelValues = {
  displayName: string;
  values: { [value: string]: CatalogLabelValueItemCount };
};

type CatalogLabelValueItemCount = {
  count: number;
  displayName: string;
};

const CatalogLabelSelector: React.FC<{
  catalogItems: CatalogItem[];
  filteredCatalogItems: CatalogItem[];
  onSelect: (labels: { [label: string]: string[] }) => void;
  selected: { [label: string]: string[] };
}> = ({ catalogItems, filteredCatalogItems, onSelect, selected }) => {
  const [expandedLabels, setExpandedLabels] = useState<{ [label: string]: boolean }>({});
  const labels: { [label: string]: CatalogLabelValues } = {};
  for (const catalogItem of catalogItems || []) {
    if (!catalogItem.metadata.labels) continue;
    for (const [label, value] of Object.entries(catalogItem.metadata.labels)) {
      if (!label.startsWith(`${BABYLON_DOMAIN}/`) || label.toLowerCase() === `${BABYLON_DOMAIN}/category`) continue;
      // Allow multiple values for labels with numeric suffixes
      const attr: string = label.substring(BABYLON_DOMAIN.length + 1).replace(/-[0-9]+$/, '');
      const attrKey: string = attr.toLowerCase();
      // Only non-hidden labels
      if (!HIDDEN_LABELS.includes(attr)) {
        const valueKey: string = value.toLowerCase();
        if (!labels[attrKey]) {
          labels[attrKey] = {
            displayName: formatString(attr),
            values: {},
          };
        }
        const labelValues = labels[attrKey].values;
        if (!labelValues[valueKey]) {
          labelValues[valueKey] = {
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
      if (!label.startsWith(`${BABYLON_DOMAIN}/`) || label.toLowerCase() === `${BABYLON_DOMAIN}/category`) continue;
      // Allow multiple values for labels with numeric suffixes
      const attrKey: string = label.substring(BABYLON_DOMAIN.length + 1).replace(/-[0-9]+$/, '');
      // Only non-hidden labels
      if (!HIDDEN_LABELS.includes(attrKey)) {
        const valueKey: string = value.toLowerCase();
        labels[attrKey.toLowerCase()].values[valueKey].count++;
      }
    }
  }

  const onChange = useCallback(
    (checked: boolean, changedLabel: string, changedValue: string) => {
      const updated: { [label: string]: string[] } = {};
      for (const [label, values] of Object.entries(selected || {})) {
        if (label === changedLabel) {
          const updatedValues = checked ? [...values, changedValue] : values.filter((v) => v != changedValue);
          if (updatedValues.length > 0) {
            updated[label] = updatedValues;
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

  const labelsSorted = Object.entries(labels).sort();
  const featuredIndex = labelsSorted.findIndex(([x]) => x.toLowerCase() === 'sales_play_demos');
  if (featuredIndex !== -1) {
    const featuredLabel = labelsSorted[featuredIndex];
    labelsSorted.splice(featuredIndex, 1);
    labelsSorted.unshift(featuredLabel);
  }

  return (
    <Form className="catalog-label-selector">
      {labelsSorted.map(([attrKey, attr]: [string, CatalogLabelValues]) => (
        <ExpandableSection
          key={attrKey}
          isExpanded={expandedLabels[attrKey] || false}
          toggleContent={
            <div style={{ display: 'flex', flexDirection: 'row' }}>
              <p>{attr.displayName}</p>
              {Object.entries(attr.values).some(([valueKey]) => (selected?.[attrKey] || []).includes(valueKey)) ? (
                <Tooltip content={<div>Clear filter</div>}>
                  <Button
                    variant="plain"
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
            {Object.entries(attr.values)
              .sort()
              .map(([valueKey, value]: [string, CatalogLabelValueItemCount]) => (
                <Checkbox
                  id={attrKey + '/' + valueKey}
                  key={attrKey + '/' + valueKey}
                  label={value.displayName + ' (' + value.count + ')'}
                  isChecked={(selected?.[attrKey] || []).includes(valueKey)}
                  onChange={(checked) => onChange(checked, attrKey, valueKey)}
                />
              ))}
          </FormGroup>
        </ExpandableSection>
      ))}
    </Form>
  );
};

export default CatalogLabelSelector;
