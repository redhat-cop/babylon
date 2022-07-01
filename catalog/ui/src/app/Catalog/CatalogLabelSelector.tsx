import React from 'react';

import { Checkbox, Form, FormGroup } from '@patternfly/react-core';
import { BABYLON_DOMAIN } from '@app/util';
import { CatalogItem } from '@app/types';
import './catalog-label-selector.css';
import { HIDDEN_LABELS } from './catalog-utils';
interface CatalogLabelValues {
  displayName: string;
  values: { [value: string]: CatalogLabelValueItemCount };
}

interface CatalogLabelValueItemCount {
  count: number;
  displayName: string;
}

const CatalogLabelSelector: React.FC<{
  catalogItems: CatalogItem[];
  filteredCatalogItems: CatalogItem[];
  onSelect: (labels: { [label: string]: string[] }) => void;
  selected: { [label: string]: string[] };
}> = ({ catalogItems, filteredCatalogItems, onSelect, selected }) => {
  const labels: { [label: string]: CatalogLabelValues } = {};
  for (const catalogItem of catalogItems || []) {
    if (!catalogItem.metadata.labels) continue;
    for (const [label, value] of Object.entries(catalogItem.metadata.labels)) {
      if (!label.startsWith(`${BABYLON_DOMAIN}/`) || label.toLowerCase() === `${BABYLON_DOMAIN}/category`) continue;
      // Allow multiple values for labels with numeric suffixes
      const attr: string = label.substring(BABYLON_DOMAIN.length + 1).replace(/-[0-9]+$/, '');
      const attrKey: string = attr.toLowerCase();
      const valueKey: string = value.toLowerCase();
      if (!labels[attrKey]) {
        labels[attrKey] = {
          displayName: attr === 'stage' ? 'Stage' : attr.replace(/_/g, ' '),
          values: {},
        };
      }
      const labelValues = labels[attrKey].values;
      if (!labelValues[valueKey]) {
        labelValues[valueKey] = {
          count: 0,
          displayName: value.replace(/_/g, ' '),
        };
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
      } else {
        delete labels[attrKey.toLowerCase()];
      }
    }
  }

  function onChange(checked: boolean, changedLabel: string, changedValue: string): void {
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
  }

  return (
    <Form className="catalog-label-selector">
      {Object.entries(labels)
        .sort()
        .map(([attrKey, attr]: [string, CatalogLabelValues]) => (
          <FormGroup key={attrKey} fieldId={attrKey}>
            <fieldset>
              <legend className="pf-c-form__label">
                <span className="pf-c-form__label-text">{attr.displayName}</span>
              </legend>
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
            </fieldset>
          </FormGroup>
        ))}
    </Form>
  );
};

export default CatalogLabelSelector;
