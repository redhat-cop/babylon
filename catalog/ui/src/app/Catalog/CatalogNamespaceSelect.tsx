import React from 'react';
import { useState } from 'react';
import { useSelector } from 'react-redux';

import { Dropdown, DropdownItem, DropdownToggle, PageSection, PageSectionVariants } from '@patternfly/react-core';

import { selectCatalogNamespaces } from '@app/store';
import { displayName } from '@app/util';
import './catalog-namespace-select.css';

interface CatalogNamespaceSelectProps {
  onSelect: (ns: string) => void;
  selected?: string;
}

const CatalogNamespaceSelect: React.FunctionComponent<CatalogNamespaceSelectProps> = ({ onSelect, selected }) => {
  const catalogNamespaces = useSelector(selectCatalogNamespaces);
  const selectedCatalogNamespace = catalogNamespaces.find((ns) => ns.name === selected);

  const [isOpen, setIsOpen] = useState<boolean>(false);

  return (
    <PageSection variant={PageSectionVariants.light} className="catalog-namespace-select">
      <Dropdown
        isPlain
        isOpen={isOpen}
        toggle={
          <DropdownToggle onToggle={() => setIsOpen((v) => !v)}>
            Catalog: {selected ? displayName(selectedCatalogNamespace) : 'all catalogs'}
          </DropdownToggle>
        }
        dropdownItems={[
          <DropdownItem
            key="*"
            onClick={() => {
              setIsOpen(false);
              onSelect(null);
            }}
          >
            - all catalogs -
          </DropdownItem>,
          ...catalogNamespaces.map((ns) => (
            <DropdownItem
              key={ns.name}
              onClick={() => {
                setIsOpen(false);
                onSelect(ns.name);
              }}
            >
              {displayName(ns)}
            </DropdownItem>
          )),
        ]}
      />
    </PageSection>
  );
};

export default CatalogNamespaceSelect;
