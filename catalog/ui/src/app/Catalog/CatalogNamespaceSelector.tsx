import React, { useMemo } from 'react';
import { Radio, Stack, StackItem, Title } from '@patternfly/react-core';
import { CatalogNamespace } from '@app/types';
import { displayName } from '@app/util';
import { ALL_CATALOGS_NS } from './catalog-utils';

import './catalog-namespace-selector.css';

const DEFAULT_CATALOG_NAMESPACE = 'babylon-catalog-prod';

const CatalogNamespaceSelector: React.FC<{
  catalogNamespaces: CatalogNamespace[];
  onSelect: (ns: string) => void;
  selected: string;
}> = ({ catalogNamespaces, onSelect, selected }) => {
  const sortedNamespaces = useMemo(
    () =>
      [...catalogNamespaces].sort((a, b) => {
        if (a.name === DEFAULT_CATALOG_NAMESPACE) return -1;
        if (b.name === DEFAULT_CATALOG_NAMESPACE) return 1;
        return displayName(a).localeCompare(displayName(b));
      }),
    [catalogNamespaces],
  );

  return (
    <div className="catalog-namespace-selector">
      <Title headingLevel="h6" className="catalog-namespace-selector__title">
        Catalog
      </Title>
      <Stack className="catalog-namespace-selector__options">
        <StackItem>
          <Radio
            id="catalog-ns-all"
            name="catalog-namespace"
            label="All"
            isChecked={selected === ALL_CATALOGS_NS}
            onChange={() => onSelect(ALL_CATALOGS_NS)}
          />
        </StackItem>
        {sortedNamespaces.map((ns) => (
          <StackItem key={ns.name}>
            <Radio
              id={`catalog-ns-${ns.name}`}
              name="catalog-namespace"
              label={displayName(ns)}
              isChecked={selected === ns.name}
              onChange={() => onSelect(ns.name)}
            />
          </StackItem>
        ))}
      </Stack>
    </div>
  );
};

export default CatalogNamespaceSelector;
